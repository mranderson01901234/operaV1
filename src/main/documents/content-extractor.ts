/**
 * Content Extractor Service
 * 
 * Extracts text content from documents for LLM context.
 * Leverages file-processor.ts for basic extraction and adds Office document support.
 */

import { readDocument, getDocumentFilePath } from './file-manager'
import { processFileFromBuffer } from '../files/file-processor'
import { parseExcelFile, getExcelSummary, type ExcelChunkOptions } from './excel-parser'
import type { Document } from '../../shared/types'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Extract text content from a document
 * Uses cached extractedText if available, otherwise extracts from file
 */
export async function extractDocumentContent(
  document: Document,
  options?: ExcelChunkOptions
): Promise<string> {
  // Check if this is an Excel file
  const isExcel = 
    document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    document.mimeType === 'application/vnd.ms-excel'

  if (isExcel) {
    // Parse Excel file with chunking support
    const buffer = await readDocument(document.filePath)
    const result = await parseExcelFile(buffer, options || { maxRows: 1000 })
    
    // Return content with truncation message if needed
    if (result.message) {
      return `${result.content}\n\n${result.message}`
    }
    return result.content
  }

  // Check if this is a legacy .doc file
  const isLegacyDoc = document.mimeType === 'application/msword'
  
  if (isLegacyDoc) {
    try {
      // Get absolute path for antiword (document.filePath is relative)
      const absoluteFilePath = getDocumentFilePath(document.filePath)
      // Use antiword to extract text
      const { stdout } = await execAsync(`antiword "${absoluteFilePath}"`)
      return stdout || ''
    } catch (error) {
      console.error('Error extracting text from .doc file:', error)
      // Fallback to empty string if extraction fails
      return ''
    }
  }

  // Return cached text if available (for non-Excel files)
  if (document.extractedText && !options) {
    return document.extractedText
  }

  // Read file from filesystem
  const buffer = await readDocument(document.filePath)
  
  // Use existing file processor for extraction
  // This handles text files, code files, and basic document types
  const result = await processFileFromBuffer(
    buffer,
    document.name,
    document.mimeType,
    'default'
  )

  if (result.success && result.attachment?.extractedText) {
    return result.attachment.extractedText
  }

  // Fallback: try to extract as UTF-8 text
  try {
    return buffer.toString('utf8')
  } catch {
    return ''
  }
}

/**
 * Extract text content from Office documents
 * Supports Excel files with chunking
 */
export async function extractOfficeDocumentContent(
  document: Document,
  options?: ExcelChunkOptions
): Promise<string> {
  return extractDocumentContent(document, options)
}

/**
 * Get Excel file summary (metadata + sample rows)
 */
export async function getExcelDocumentSummary(document: Document): Promise<{
  metadata: {
    sheetNames: string[]
    totalRows: number
    totalColumns: number
    rowCounts: Record<string, number>
    columnCounts: Record<string, number>
    columnNames: Record<string, string[]>
  }
  sampleRows: string[][]
}> {
  const buffer = await readDocument(document.filePath)
  return await getExcelSummary(buffer)
}

