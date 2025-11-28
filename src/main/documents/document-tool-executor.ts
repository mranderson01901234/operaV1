/**
 * Document Tool Executor
 *
 * Executes document editing tools triggered by LLM.
 * Handles read, create, and edit operations with confirmation flow for destructive operations.
 */

import { v4 as uuidv4 } from 'uuid'
import { BrowserWindow } from 'electron'
import { readDocument, saveDocument } from './file-manager'
import { extractDocumentContent } from './content-extractor'
import { resolveTarget } from './region-resolver'
import { documentQueries, tabQueries } from '../db/queries'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type {
  DocumentEditRequest,
  DocumentEditResult,
  DocumentEditPreview,
  PendingDocumentEdit,
  ResolvedRegion,
  Document,
} from '../../shared/types'
import type { ToolExecutionResult } from '../browser/tool-executor'

/**
 * Notify renderer that a document was updated
 * This triggers auto-refresh in the document viewer
 */
function notifyDocumentUpdated(documentId: string): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(IPC_CHANNELS.DOCUMENT_UPDATED, { documentId })
  }
}

// In-memory store for pending edits awaiting user confirmation
const pendingEdits = new Map<string, PendingDocumentEdit>()

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * List all documents for an agent
 */
export async function executeListDocuments(agentId: string): Promise<ToolExecutionResult> {
  try {
    const documents = documentQueries.getByAgent(agentId)

    return {
      success: true,
      result: {
        documents: documents.map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
          size: d.fileSize,
          sizeFormatted: formatFileSize(d.fileSize),
          updatedAt: d.updatedAt.toISOString(),
        })),
        count: documents.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list documents',
    }
  }
}

/**
 * Get summary/metadata of a document (especially useful for Excel files)
 * 
 * ⚠️ COST WARNING: For large file reviews, always use gemini-2.5-flash model
 * (~$0.075/1M tokens) to minimize costs. This tool is cost-efficient (~$0.0004).
 */
export async function executeGetDocumentSummary(args: {
  documentId: string
}): Promise<ToolExecutionResult> {
  try {
    const document = documentQueries.getById(args.documentId)
    if (!document) {
      return {
        success: false,
        error: `Document not found: ${args.documentId}`,
      }
    }

    // Check if this is an Excel file
    const isExcel = 
      document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      document.mimeType === 'application/vnd.ms-excel'

    if (isExcel) {
      try {
        const { getExcelDocumentSummary } = await import('./content-extractor')
        const summary = await getExcelDocumentSummary(document)
        
        // Format summary text
        const summaryLines: string[] = []
        summaryLines.push(`Document: ${document.name}`)
        summaryLines.push(`Type: Excel Spreadsheet`)
        summaryLines.push(`Size: ${formatFileSize(document.fileSize)}`)
        summaryLines.push('')
        summaryLines.push(`Sheets: ${summary.metadata.sheetNames.join(', ')}`)
        summaryLines.push(`Total Rows: ${summary.metadata.totalRows}`)
        summaryLines.push(`Total Columns: ${summary.metadata.totalColumns}`)
        summaryLines.push('')
        
        // Per-sheet details
        for (const sheetName of summary.metadata.sheetNames) {
          summaryLines.push(`Sheet "${sheetName}":`)
          summaryLines.push(`  Rows: ${summary.metadata.rowCounts[sheetName]}`)
          summaryLines.push(`  Columns: ${summary.metadata.columnCounts[sheetName]}`)
          if (summary.metadata.columnNames[sheetName]?.length > 0) {
            summaryLines.push(`  Column Names: ${summary.metadata.columnNames[sheetName].join(', ')}`)
          }
          summaryLines.push('')
        }
        
        // Sample rows
        if (summary.sampleRows.length > 0) {
          summaryLines.push('Sample Data (first 5 rows):')
          summaryLines.push('')
          summaryLines.push(`Headers: ${summary.sampleRows[0]?.join(' | ') || ''}`)
          summaryLines.push('')
          for (let i = 1; i < summary.sampleRows.length; i++) {
            summaryLines.push(`Row ${i}: ${summary.sampleRows[i]?.join(' | ') || ''}`)
          }
        }
        
        return {
          success: true,
          result: {
            documentId: document.id,
            name: document.name,
            mimeType: document.mimeType,
            summary: summaryLines.join('\n'),
            metadata: {
              sheetNames: summary.metadata.sheetNames,
              totalRows: summary.metadata.totalRows,
              totalColumns: summary.metadata.totalColumns,
              rowCounts: summary.metadata.rowCounts,
              columnCounts: summary.metadata.columnCounts,
              columnNames: summary.metadata.columnNames,
            },
            sampleRows: summary.sampleRows,
          },
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to get Excel summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }
      }
    }

    // For non-Excel files, return basic info
    return {
      success: true,
      result: {
        documentId: document.id,
        name: document.name,
        mimeType: document.mimeType,
        size: document.fileSize,
        sizeFormatted: formatFileSize(document.fileSize),
        summary: `Document: ${document.name}\nType: ${document.mimeType}\nSize: ${formatFileSize(document.fileSize)}`,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get document summary',
    }
  }
}

/**
 * Read the content of a document
 * Supports chunking for Excel files via startRow/endRow/maxRows parameters
 * 
 * ⚠️ COST WARNING: Reading large files can be expensive. For large file reviews,
 * always use gemini-2.5-flash model (~$0.075/1M tokens) to minimize costs.
 */
export async function executeReadDocument(args: {
  documentId: string
  sheet?: string
  startRow?: number
  endRow?: number
  maxRows?: number
  columns?: string[]
}): Promise<ToolExecutionResult> {
  try {
    const document = documentQueries.getById(args.documentId)
    if (!document) {
      return {
        success: false,
        error: `Document not found: ${args.documentId}`,
      }
    }

    // Check if this is an Excel file
    const isExcel = 
      document.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      document.mimeType === 'application/vnd.ms-excel'

    // Check if file is large (> 1MB) and warn about cost
    const isLargeFile = document.fileSize > 1024 * 1024 // 1MB
    const costWarning = isLargeFile 
      ? '\n\n⚠️ COST WARNING: This is a large file. For cost efficiency, ensure you are using gemini-2.5-flash model (~$0.075/1M tokens). Other models can be 10-100x more expensive.'
      : ''

    // Extract content with options for Excel files
    const excelOptions = isExcel ? {
      sheet: args.sheet,
      startRow: args.startRow,
      endRow: args.endRow,
      maxRows: args.maxRows || 1000,
      columns: args.columns,
      includeHeaders: true,
    } : undefined

    const content = await extractDocumentContent(document, excelOptions)
    const lines = content.split('\n')

    // For Excel files, try to get metadata
    let excelMetadata: any = undefined
    if (isExcel) {
      try {
        const { getExcelDocumentSummary } = await import('./content-extractor')
        const summary = await getExcelDocumentSummary(document)
        excelMetadata = {
          sheetNames: summary.metadata.sheetNames,
          totalRows: summary.metadata.totalRows,
          totalColumns: summary.metadata.totalColumns,
          rowCounts: summary.metadata.rowCounts,
          columnCounts: summary.metadata.columnCounts,
          columnNames: summary.metadata.columnNames,
        }
      } catch (err) {
        // Ignore metadata errors
        console.warn('Failed to get Excel metadata:', err)
      }
    }

    return {
      success: true,
      result: {
        documentId: document.id,
        name: document.name,
        mimeType: document.mimeType,
        content: content + costWarning,
        lineCount: lines.length,
        size: document.fileSize,
        sizeFormatted: formatFileSize(document.fileSize),
        ...(excelMetadata && { excelMetadata }),
        ...(isLargeFile && { 
          costWarning: 'Large file detected. Recommended model: gemini-2.5-flash for cost efficiency.',
          recommendedModel: 'gemini-2.5-flash'
        }),
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read document',
    }
  }
}

/**
 * Create a new document
 */
export async function executeCreateDocument(
  args: { filename: string; content: string; mimeType?: string },
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    // Auto-detect MIME type from extension if not provided
    const mimeType = args.mimeType || detectMimeType(args.filename)

    const documentId = uuidv4()
    const buffer = Buffer.from(args.content, 'utf8')

    // Save file to filesystem
    const filePath = await saveDocument(agentId, documentId, args.filename, buffer)

    // Create document record in database
    const document = documentQueries.create({
      id: documentId,
      agentId,
      name: args.filename,
      filePath,
      mimeType,
      fileSize: buffer.length,
      extractedText: args.content,
    })

    // Create a tab for the new document
    const tabPosition = tabQueries.getNextPosition(agentId)
    const tab = tabQueries.create({
      id: uuidv4(),
      agentId,
      title: args.filename,
      url: `document://${documentId}`,
      type: 'document',
      documentId: documentId,
      isActive: false, // Don't auto-switch, let user decide
      isPinned: false,
      position: tabPosition,
    })

    return {
      success: true,
      result: {
        documentId: document.id,
        name: document.name,
        tabId: tab.id,
        mimeType: document.mimeType,
        size: document.fileSize,
        sizeFormatted: formatFileSize(document.fileSize),
        lineCount: args.content.split('\n').length,
        message: `Created document "${args.filename}" (${formatFileSize(document.fileSize)})`,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create document',
    }
  }
}

/**
 * Edit an existing document
 * Returns requiresConfirmation: true for destructive operations (replace/delete)
 */
export async function executeEditDocument(
  args: DocumentEditRequest,
  agentId: string
): Promise<DocumentEditResult> {
  try {
    const document = documentQueries.getById(args.documentId)
    if (!document) {
      return {
        success: false,
        requiresConfirmation: false,
        error: `Document not found: ${args.documentId}`,
      }
    }

    // Read current content
    const buffer = await readDocument(document.filePath)
    const currentContent = buffer.toString('utf8')
    const lines = currentContent.split('\n')

    // Resolve the target to line numbers
    const resolution = resolveTarget(currentContent, args.target, document.mimeType)
    if (!resolution.success || !resolution.region) {
      return {
        success: false,
        requiresConfirmation: false,
        error: resolution.error || `Could not resolve target: "${args.target}"`,
      }
    }

    const resolvedRegion = resolution.region

    // Generate preview
    const preview = generatePreview(document, currentContent, args, resolvedRegion)

    // Check if operation is destructive
    if (isDestructiveOperation(args.operation)) {
      // Queue for confirmation
      const pendingEditId = uuidv4()
      const pendingEdit: PendingDocumentEdit = {
        id: pendingEditId,
        documentId: args.documentId,
        agentId,
        operation: args.operation,
        editRequest: args,
        resolvedRegion,
        preview,
        status: 'pending',
        createdAt: new Date(),
      }

      pendingEdits.set(pendingEditId, pendingEdit)

      return {
        success: true,
        requiresConfirmation: true,
        pendingEditId,
        preview,
        resolvedRegion,
      }
    }

    // Non-destructive operation - apply immediately
    const applyResult = await applyEdit(document, args, resolvedRegion)

    if (!applyResult.success) {
      return {
        success: false,
        requiresConfirmation: false,
        error: applyResult.error,
      }
    }

    return {
      success: true,
      requiresConfirmation: false,
      preview,
      resolvedRegion,
    }
  } catch (error) {
    return {
      success: false,
      requiresConfirmation: false,
      error: error instanceof Error ? error.message : 'Failed to edit document',
    }
  }
}

// ============================================================================
// Pending Edit Management
// ============================================================================

/**
 * Get all pending edits for an agent
 */
export function getPendingEdits(agentId: string): PendingDocumentEdit[] {
  return Array.from(pendingEdits.values()).filter(
    (e) => e.agentId === agentId && e.status === 'pending'
  )
}

/**
 * Get a specific pending edit by ID
 */
export function getPendingEdit(pendingEditId: string): PendingDocumentEdit | undefined {
  return pendingEdits.get(pendingEditId)
}

/**
 * Approve a pending edit and apply it
 */
export async function approveEdit(
  pendingEditId: string
): Promise<{ success: boolean; error?: string }> {
  const pending = pendingEdits.get(pendingEditId)
  if (!pending) {
    return { success: false, error: 'Pending edit not found' }
  }

  if (pending.status !== 'pending') {
    return { success: false, error: `Edit already ${pending.status}` }
  }

  const document = documentQueries.getById(pending.documentId)
  if (!document) {
    pendingEdits.delete(pendingEditId)
    return { success: false, error: 'Document no longer exists' }
  }

  // Apply the edit
  const result = await applyEdit(document, pending.editRequest, pending.resolvedRegion)

  if (result.success) {
    pending.status = 'applied'
    pendingEdits.delete(pendingEditId)
  }

  return result
}

/**
 * Reject a pending edit
 */
export function rejectEdit(pendingEditId: string): { success: boolean; message?: string } {
  const pending = pendingEdits.get(pendingEditId)
  if (!pending) {
    return { success: false, message: 'Pending edit not found' }
  }

  pending.status = 'rejected'
  pendingEdits.delete(pendingEditId)

  return { success: true, message: 'Edit rejected by user' }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an operation is destructive (requires confirmation)
 */
function isDestructiveOperation(operation: string): boolean {
  return operation === 'replace' || operation === 'delete'
}

/**
 * Generate a preview of what the edit will do
 */
function generatePreview(
  document: Document,
  currentContent: string,
  request: DocumentEditRequest,
  resolvedRegion: ResolvedRegion
): DocumentEditPreview {
  const lines = currentContent.split('\n')
  const totalLines = lines.length
  const { startLine, endLine } = resolvedRegion

  let beforeContent = ''
  let afterContent = ''

  switch (request.operation) {
    case 'append':
      beforeContent = lines.slice(-3).join('\n') // Last 3 lines for context
      afterContent = [...lines, request.content || ''].slice(-5).join('\n')
      break

    case 'insert':
      const insertIdx = startLine - 1
      const before = lines.slice(Math.max(0, insertIdx - 2), insertIdx)
      const after = lines.slice(insertIdx, insertIdx + 2)
      beforeContent = [...before, '--- INSERT HERE ---', ...after].join('\n')

      const newLines = [...lines]
      newLines.splice(insertIdx, 0, request.content || '')
      afterContent = newLines
        .slice(Math.max(0, insertIdx - 2), insertIdx + 3)
        .join('\n')
      break

    case 'replace':
      beforeContent = lines.slice(startLine - 1, endLine).join('\n')
      const replacedLines = [...lines]
      replacedLines.splice(startLine - 1, endLine - startLine + 1, request.content || '')
      afterContent = replacedLines
        .slice(Math.max(0, startLine - 3), startLine + 2)
        .join('\n')
      break

    case 'delete':
      beforeContent = lines.slice(startLine - 1, endLine).join('\n')
      afterContent = '(content will be deleted)'
      break
  }

  // Truncate long content for display
  const maxPreviewLength = 500
  if (beforeContent.length > maxPreviewLength) {
    beforeContent = beforeContent.substring(0, maxPreviewLength) + '\n...(truncated)'
  }
  if (afterContent.length > maxPreviewLength) {
    afterContent = afterContent.substring(0, maxPreviewLength) + '\n...(truncated)'
  }

  return {
    documentId: document.id,
    documentName: document.name,
    operation: request.operation,
    beforeContent,
    afterContent,
    affectedLines: { start: startLine, end: endLine },
    totalLines,
  }
}

/**
 * Apply an edit to a document
 */
async function applyEdit(
  document: Document,
  request: DocumentEditRequest,
  resolvedRegion: ResolvedRegion
): Promise<{ success: boolean; error?: string }> {
  try {
    // Read current content
    const buffer = await readDocument(document.filePath)
    const currentContent = buffer.toString('utf8')
    const lines = currentContent.split('\n')

    const { startLine, endLine } = resolvedRegion
    let newContent: string

    switch (request.operation) {
      case 'append':
        newContent = currentContent + '\n' + (request.content || '')
        break

      case 'insert':
        const insertIdx = startLine - 1
        lines.splice(insertIdx, 0, request.content || '')
        newContent = lines.join('\n')
        break

      case 'replace':
        lines.splice(startLine - 1, endLine - startLine + 1, request.content || '')
        newContent = lines.join('\n')
        break

      case 'delete':
        lines.splice(startLine - 1, endLine - startLine + 1)
        newContent = lines.join('\n')
        break

      default:
        return { success: false, error: `Unknown operation: ${request.operation}` }
    }

    // Save the modified content
    const newBuffer = Buffer.from(newContent, 'utf8')
    await saveDocument(document.agentId, document.id, document.name, newBuffer)

    // Update database with new file size and extracted text
    documentQueries.update(document.id, {
      fileSize: newBuffer.length,
      extractedText: newContent,
    })

    // Notify renderer to refresh the document view
    notifyDocumentUpdated(document.id)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply edit',
    }
  }
}

/**
 * Detect MIME type from filename extension
 */
function detectMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const mimeMap: Record<string, string> = {
    // Text
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',

    // Data
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    yaml: 'text/x-yaml',
    yml: 'text/x-yaml',
    toml: 'text/x-toml',

    // Code
    js: 'text/javascript',
    mjs: 'text/javascript',
    cjs: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    py: 'text/x-python',
    rb: 'text/x-ruby',
    go: 'text/x-go',
    rs: 'text/x-rust',
    java: 'text/x-java',
    c: 'text/x-c',
    cpp: 'text/x-c++',
    h: 'text/x-c',
    hpp: 'text/x-c++',
    cs: 'text/x-csharp',
    php: 'text/x-php',
    swift: 'text/x-swift',
    kt: 'text/x-kotlin',
    scala: 'text/x-scala',
    sql: 'text/x-sql',
    sh: 'text/x-shellscript',
    bash: 'text/x-shellscript',
    zsh: 'text/x-shellscript',

    // Web
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    scss: 'text/x-scss',
    sass: 'text/x-sass',
    less: 'text/x-less',

    // Config
    ini: 'text/plain',
    cfg: 'text/plain',
    conf: 'text/plain',
    env: 'text/plain',
  }

  return mimeMap[ext || ''] || 'text/plain'
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
