/**
 * FileProcessor Service
 *
 * Handles secure file processing for document uploads:
 * - Magic byte validation (verify file content matches claimed type)
 * - Size limit enforcement
 * - MIME type detection and categorization
 * - Text extraction for non-native formats
 * - Base64 encoding for LLM submission
 */

import { readFile, writeFile, unlink } from 'fs/promises'
import * as path from 'path'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Attachment, AttachmentType } from '../../shared/types'
import { SUPPORTED_MIME_TYPES, FILE_SIZE_LIMITS } from '../../shared/types'

const execAsync = promisify(exec)

// Magic byte signatures for file type detection
const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }> = {
  // Images
  'image/jpeg': { bytes: [0xFF, 0xD8, 0xFF] },
  'image/png': { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  'image/gif': { bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  'image/webp': { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF, check WEBP at offset 8
  'image/bmp': { bytes: [0x42, 0x4D] }, // BM
  'image/tiff': { bytes: [0x49, 0x49, 0x2A, 0x00] }, // Little-endian TIFF

  // Documents
  'application/pdf': { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF

  // Office documents (ZIP-based, start with PK)
  'application/zip': { bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK

  // RTF
  'application/rtf': { bytes: [0x7B, 0x5C, 0x72, 0x74, 0x66] }, // {\rtf

  // Legacy Office documents (OLE Compound Document format)
  // .doc, .xls, .ppt files all use this format
  'application/x-ole-compound': { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] },
}

// Extension to MIME type mapping for text-based files
const TEXT_EXTENSIONS: Record<string, string> = {
  // Text
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'text/xml',
  '.json': 'application/json',

  // Code
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.h': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.hpp': 'text/x-c++',
  '.cc': 'text/x-c++',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.kts': 'text/x-kotlin',
  '.scala': 'text/x-scala',
  '.sql': 'text/x-sql',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh': 'text/x-shellscript',
  '.yaml': 'text/x-yaml',
  '.yml': 'text/x-yaml',
  '.toml': 'text/x-toml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',

  // Documents
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.rtf': 'application/rtf',
}

export interface FileValidationResult {
  valid: boolean
  error?: string
  mimeType?: string
  category?: AttachmentType
  size?: number
}

export interface ProcessedFile {
  success: boolean
  error?: string
  attachment?: Attachment
}

/**
 * Detect MIME type from file content using magic bytes
 */
function detectMimeTypeFromBytes(buffer: Buffer): string | null {
  for (const [mimeType, signature] of Object.entries(MAGIC_BYTES)) {
    const offset = signature.offset ?? 0
    const bytes = signature.bytes

    if (buffer.length < offset + bytes.length) continue

    let match = true
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[offset + i] !== bytes[i]) {
        match = false
        break
      }
    }

    if (match) {
      // Special case for WebP (need to check WEBP at offset 8)
      if (mimeType === 'image/webp') {
        if (buffer.length >= 12 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 &&
            buffer[10] === 0x42 && buffer[11] === 0x50) {
          return 'image/webp'
        }
        continue
      }

      // Special case for Office documents (all ZIP-based)
      if (mimeType === 'application/zip') {
        // Could be docx, xlsx, pptx - check internal structure later
        return 'application/zip'
      }

      return mimeType
    }
  }

  return null
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase()
  return TEXT_EXTENSIONS[ext] || null
}

/**
 * Determine attachment type category from MIME type
 */
function getCategoryFromMimeType(mimeType: string): AttachmentType {
  if (SUPPORTED_MIME_TYPES.image.includes(mimeType as any)) {
    return 'image'
  }
  if (SUPPORTED_MIME_TYPES.document.includes(mimeType as any)) {
    return 'document'
  }
  if (SUPPORTED_MIME_TYPES.text.includes(mimeType as any)) {
    return 'text'
  }
  if (SUPPORTED_MIME_TYPES.code.includes(mimeType as any)) {
    return 'code'
  }
  // Default to text for unknown types
  return 'text'
}

/**
 * Check if a MIME type is natively supported by LLM providers
 * (can be sent as-is without text extraction)
 */
function isNativelySupportedByLLM(mimeType: string): boolean {
  // Images and PDFs are natively supported
  return (
    SUPPORTED_MIME_TYPES.image.includes(mimeType as any) ||
    mimeType === 'application/pdf'
  )
}

/**
 * Check if content appears to be valid UTF-8 text
 */
function isValidUtf8Text(buffer: Buffer): boolean {
  try {
    const text = buffer.toString('utf8')
    // Check for null bytes or control characters (except common ones)
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      const byte = buffer[i]
      // Allow common control chars: tab, newline, carriage return
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Validate a file for security and compatibility
 */
export function validateFile(
  buffer: Buffer,
  filename: string,
  claimedMimeType: string,
  provider: string = 'default'
): FileValidationResult {
  // 1. Check file size
  const sizeLimit = FILE_SIZE_LIMITS[provider as keyof typeof FILE_SIZE_LIMITS] || FILE_SIZE_LIMITS.default
  if (buffer.length > sizeLimit) {
    return {
      valid: false,
      error: `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds limit (${sizeLimit / 1024 / 1024}MB)`,
      size: buffer.length,
    }
  }

  // 2. Detect actual MIME type from content
  let detectedMimeType = detectMimeTypeFromBytes(buffer)

  // 3. If not detected from bytes, try extension for text files
  if (!detectedMimeType) {
    const extMimeType = getMimeTypeFromExtension(filename)
    if (extMimeType && isValidUtf8Text(buffer)) {
      detectedMimeType = extMimeType
    }
  }

  // 4. If still not detected, check if it's valid UTF-8 text
  if (!detectedMimeType && isValidUtf8Text(buffer)) {
    detectedMimeType = 'text/plain'
  }

  // 5. If we couldn't detect the type at all, reject
  if (!detectedMimeType) {
    return {
      valid: false,
      error: 'Unable to determine file type. The file may be corrupted or in an unsupported format.',
      size: buffer.length,
    }
  }

  // 6. Verify claimed MIME type matches detected (for security)
  // Be lenient with text types and Office documents
  const claimedCategory = getCategoryFromMimeType(claimedMimeType)
  const detectedCategory = getCategoryFromMimeType(detectedMimeType)

  // Allow Office documents detected as ZIP (modern .docx, .xlsx, .pptx)
  if (detectedMimeType === 'application/zip' && claimedCategory === 'document') {
    detectedMimeType = claimedMimeType
  }

  // Allow legacy Office documents detected as OLE Compound (.doc, .xls, .ppt)
  if (detectedMimeType === 'application/x-ole-compound' && claimedCategory === 'document') {
    detectedMimeType = claimedMimeType
  }

  // For security, verify binary files match their claimed type
  if (detectedCategory === 'image' || detectedMimeType === 'application/pdf') {
    if (detectedMimeType !== claimedMimeType && !claimedMimeType.startsWith('image/')) {
      console.warn(`MIME type mismatch: claimed ${claimedMimeType}, detected ${detectedMimeType}`)
      // Use detected type for safety
    }
  }

  const category = getCategoryFromMimeType(detectedMimeType)

  return {
    valid: true,
    mimeType: detectedMimeType,
    category,
    size: buffer.length,
  }
}

/**
 * Process a file from a file path
 */
export async function processFileFromPath(
  filePath: string,
  claimedMimeType: string,
  provider: string = 'default'
): Promise<ProcessedFile> {
  try {
    const buffer = await readFile(filePath)
    const filename = path.basename(filePath)

    return processFileFromBuffer(buffer, filename, claimedMimeType, provider)
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Process a file from a Buffer (main entry point for IPC)
 */
export async function processFileFromBuffer(
  buffer: Buffer,
  filename: string,
  claimedMimeType: string,
  provider: string = 'default'
): Promise<ProcessedFile> {
  // Validate the file
  const validation = validateFile(buffer, filename, claimedMimeType, provider)

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    }
  }

  const mimeType = validation.mimeType!
  const category = validation.category!
  const size = validation.size!

  // Convert to base64 data URI
  const base64 = buffer.toString('base64')
  const dataUri = `data:${mimeType};base64,${base64}`

  // Extract text for non-native formats
  let extractedText: string | undefined

  if (!isNativelySupportedByLLM(mimeType)) {
    // For text-based files, extract the content
    if (category === 'text' || category === 'code') {
      try {
        extractedText = buffer.toString('utf8')
      } catch {
        extractedText = undefined
      }
    }
    // For legacy .doc files, use antiword
    if (mimeType === 'application/msword') {
      try {
        // Write buffer to temp file for antiword to process
        const tempPath = path.join(tmpdir(), `doc-${Date.now()}-${filename}`)
        await writeFile(tempPath, buffer)
        
        try {
          const { stdout } = await execAsync(`antiword "${tempPath}"`)
          extractedText = stdout || undefined
        } finally {
          // Clean up temp file
          try {
            await unlink(tempPath)
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        console.warn('Failed to extract text from .doc file:', error)
        // Don't fail the upload if extraction fails - file will still be saved
        extractedText = undefined
      }
    }
    // For other Office documents (.docx, .xlsx, etc.), we'll extract text when needed
    // For now, we'll send them as-is and let the LLM handle what it can
  }

  const attachment: Attachment = {
    type: category,
    data: dataUri,
    name: filename,
    mimeType,
    size,
    extractedText,
  }

  return {
    success: true,
    attachment,
  }
}

/**
 * Process a base64 data URI (from renderer process)
 */
export async function processFileFromDataUri(
  dataUri: string,
  filename: string,
  claimedMimeType: string,
  fileSize: number,
  provider: string = 'default'
): Promise<ProcessedFile> {
  try {
    // Extract base64 data from data URI
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      return {
        success: false,
        error: 'Invalid data URI format',
      }
    }

    const base64Data = match[2]
    const buffer = Buffer.from(base64Data, 'base64')

    return processFileFromBuffer(buffer, filename, claimedMimeType, provider)
  } catch (error) {
    return {
      success: false,
      error: `Failed to process file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Get human-readable file type description
 */
export function getFileTypeDescription(mimeType: string): string {
  const descriptions: Record<string, string> = {
    'image/jpeg': 'JPEG Image',
    'image/png': 'PNG Image',
    'image/gif': 'GIF Image',
    'image/webp': 'WebP Image',
    'image/svg+xml': 'SVG Image',
    'image/bmp': 'BMP Image',
    'image/tiff': 'TIFF Image',
    'application/pdf': 'PDF Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint Presentation',
    'application/msword': 'Word Document (Legacy)',
    'application/vnd.ms-excel': 'Excel Spreadsheet (Legacy)',
    'application/vnd.ms-powerpoint': 'PowerPoint Presentation (Legacy)',
    'application/rtf': 'Rich Text Document',
    'text/plain': 'Text File',
    'text/markdown': 'Markdown File',
    'text/csv': 'CSV File',
    'text/html': 'HTML File',
    'application/json': 'JSON File',
    'text/javascript': 'JavaScript File',
    'text/typescript': 'TypeScript File',
    'text/x-python': 'Python File',
  }

  return descriptions[mimeType] || 'File'
}
