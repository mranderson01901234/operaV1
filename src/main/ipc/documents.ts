/**
 * Document IPC handlers
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { documentQueries, tabQueries } from '../db/queries'
import { saveDocument, deleteDocument, readDocument, getDocumentFilePath } from '../documents/file-manager'
import { processFileFromDataUri } from '../files/file-processor'
import { extractDocumentContent } from '../documents/content-extractor'
import { v4 as uuidv4 } from 'uuid'
import type { Document, CreateDocumentParams, CreateTabParams } from '../../shared/types'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Register all document-related IPC handlers
 */
export function registerDocumentHandlers(): void {
  /**
   * Create a document from a file upload and optionally create a tab
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_CREATE_TAB,
    async (
      _event,
      params: {
        agentId: string
        dataUri: string
        filename: string
        mimeType: string
        size: number
        provider?: string
        makeActive?: boolean
      }
    ) => {
      try {
        // Process file using existing file processor
        const processResult = await processFileFromDataUri(
          params.dataUri,
          params.filename,
          params.mimeType,
          params.size,
          params.provider || 'default'
        )

        if (!processResult.success || !processResult.attachment) {
          return {
            success: false,
            error: processResult.error || 'Failed to process file',
          }
        }

        const attachment = processResult.attachment

        // Create document ID
        const documentId = uuidv4()

        // Extract buffer from data URI
        const match = params.dataUri.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) {
          return { success: false, error: 'Invalid data URI format' }
        }

        const buffer = Buffer.from(match[2], 'base64')

        // Save file to filesystem
        const filePath = await saveDocument(
          params.agentId,
          documentId,
          params.filename,
          buffer
        )

        // Create document record
        const document = documentQueries.create({
          id: documentId,
          agentId: params.agentId,
          name: params.filename,
          filePath,
          mimeType: attachment.mimeType,
          fileSize: attachment.size,
          extractedText: attachment.extractedText,
        })

        // Create document tab
        const tabPosition = tabQueries.getNextPosition(params.agentId)
        const tab = tabQueries.create({
          id: uuidv4(),
          agentId: params.agentId,
          title: params.filename,
          url: `document://${documentId}`,
          type: 'document',
          documentId: documentId,
          isActive: params.makeActive ?? true,
          isPinned: false,
          position: tabPosition,
        })

        // Set as active tab if requested
        if (params.makeActive) {
          tabQueries.setActiveTab(params.agentId, tab.id)
        }

        return {
          success: true,
          document,
          tab,
        }
      } catch (error) {
        console.error('Error creating document tab:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create document',
        }
      }
    }
  )

  /**
   * Get a document by ID
   */
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_GET_BY_ID, async (_event, id: string) => {
    try {
      const document = documentQueries.getById(id)
      if (!document) {
        return { success: false, error: 'Document not found' }
      }
      return { success: true, document }
    } catch (error) {
      console.error('Error getting document:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * Get all documents for an agent
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_GET_BY_AGENT,
    async (_event, agentId: string) => {
      try {
        const documents = documentQueries.getByAgent(agentId)
        return { success: true, documents }
      } catch (error) {
        console.error('Error getting documents:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  /**
   * Update a document
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_UPDATE,
    async (
      _event,
      id: string,
      updates: { name?: string; extractedText?: string }
    ) => {
      try {
        const document = documentQueries.update(id, updates)
        if (!document) {
          return { success: false, error: 'Document not found' }
        }
        return { success: true, document }
      } catch (error) {
        console.error('Error updating document:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  /**
   * Delete a document
   */
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_DELETE, async (_event, id: string) => {
    try {
      const document = documentQueries.getById(id)
      if (!document) {
        return { success: false, error: 'Document not found' }
      }

      // Delete file from filesystem
      await deleteDocument(document.agentId, document.id)

      // Delete document record
      const deleted = documentQueries.delete(id)
      if (!deleted) {
        return { success: false, error: 'Failed to delete document' }
      }

      return { success: true }
    } catch (error) {
      console.error('Error deleting document:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * Read a document file and return as base64 data URI
   */
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_READ_FILE, async (_event, id: string) => {
    try {
      const document = documentQueries.getById(id)
      if (!document) {
        return { success: false, error: 'Document not found' }
      }

      // Read file from filesystem
      const buffer = await readDocument(document.filePath)

      // Convert to base64 data URI
      const base64 = buffer.toString('base64')
      const dataUri = `data:${document.mimeType};base64,${base64}`

      return {
        success: true,
        dataUri,
        mimeType: document.mimeType,
      }
    } catch (error) {
      console.error('Error reading document file:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read document file',
      }
    }
  })

  /**
   * Save document file content
   * Accepts content as string (for text files) or data URI (for binary files)
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_SAVE_FILE,
    async (
      _event,
      id: string,
      content: string,
      options?: { isDataUri?: boolean; extractText?: boolean }
    ) => {
      try {
        const document = documentQueries.getById(id)
        if (!document) {
          return { success: false, error: 'Document not found' }
        }

        let buffer: Buffer
        if (options?.isDataUri) {
          // Extract base64 from data URI
          const match = content.match(/^data:[^;]+;base64,(.+)$/)
          if (!match) {
            return { success: false, error: 'Invalid data URI format' }
          }
          buffer = Buffer.from(match[1], 'base64')
        } else {
          // Plain text content
          buffer = Buffer.from(content, 'utf8')
        }

        // Save file to filesystem (overwrite existing file)
        const filePath = await saveDocument(document.agentId, document.id, document.name, buffer)

        // Extract text if requested (for text files, use content directly)
        let extractedText: string | undefined
        if (options?.extractText && !options.isDataUri) {
          extractedText = content
        }
        // For binary files, we skip extraction on save (can be done later if needed)

        // Update document record with new file size
        const fs = await import('fs/promises')
        const { getDocumentFilePath } = await import('../documents/file-manager')
        const absolutePath = getDocumentFilePath(filePath)
        const stats = await fs.stat(absolutePath)
        const updatedDocument = documentQueries.update(document.id, {
          filePath,
          fileSize: stats.size,
          extractedText,
        })

        return {
          success: true,
          document: updatedDocument,
        }
      } catch (error) {
        console.error('Error saving document file:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save document file',
        }
      }
    }
  )

  /**
   * Extract text from a .doc file (legacy Word format)
   * This is handled in the main process since doc-extract is a Node.js library
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_EXTRACT_DOC_TEXT,
    async (_event, id: string) => {
      try {
        const document = documentQueries.getById(id)
        if (!document) {
          return { success: false, error: 'Document not found' }
        }

        if (document.mimeType !== 'application/msword') {
          return { success: false, error: 'Document is not a .doc file' }
        }

        // Extract text using antiword (system or bundled)
        try {
          // Try system antiword first, then bundled
          let antiwordPath = 'antiword'
          
          // Check if system antiword exists
          try {
            await execAsync('which antiword')
            antiwordPath = 'antiword'
          } catch {
            // Try bundled binary
            const platform = process.platform
            const bundledPath = platform === 'win32' 
              ? path.join(__dirname, '../../resources/binaries/win32/antiword.exe')
              : path.join(__dirname, '../../resources/binaries', platform, 'antiword')
            
            const fs = await import('fs')
            if (fs.existsSync(bundledPath)) {
              antiwordPath = bundledPath
            } else {
              return {
                success: false,
                error: 'antiword not found. Install with: sudo apt-get install antiword (Linux) or brew install antiword (macOS)',
              }
            }
          }
          
          // Get absolute path for antiword (document.filePath is relative)
          const absoluteFilePath = getDocumentFilePath(document.filePath)

          // Extract text using antiword (outputs plain text)
          const { stdout, stderr } = await execAsync(
            `"${antiwordPath}" "${absoluteFilePath}"`
          )
          
          return {
            success: true,
            text: stdout || '',
          }
        } catch (extractError) {
          const errorMessage = extractError instanceof Error ? extractError.message : String(extractError)
          console.error('Error extracting text from .doc file:', extractError)
          return {
            success: false,
            error: `Failed to extract text: ${errorMessage}`,
          }
        }
      } catch (error) {
        console.error('Error extracting text from .doc file:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to extract text from .doc file',
        }
      }
    }
  )

  /**
   * Check if antiword is available (system or bundled)
   */
  ipcMain.handle(IPC_CHANNELS.DOCUMENT_CHECK_DEPENDENCIES, async () => {
    try {
      // Check system antiword
      try {
        await execAsync('which antiword')
        return { success: true, available: true }
      } catch {
        // Check bundled
        const platform = process.platform
        const fs = await import('fs')
        const bundledPath = platform === 'win32' 
          ? path.join(__dirname, '../../resources/binaries/win32/antiword.exe')
          : path.join(__dirname, '../../resources/binaries', platform, 'antiword')
        
        const available = fs.existsSync(bundledPath)
        return {
          success: true,
          available,
          error: available ? undefined : 'antiword not found. Install: sudo apt-get install antiword',
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check dependencies',
      }
    }
  })
}

