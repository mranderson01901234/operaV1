/**
 * Document Tools IPC Handlers
 *
 * Handles IPC communication for LLM-triggered document operations.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  executeListDocuments,
  executeReadDocument,
  executeCreateDocument,
  executeEditDocument,
  getPendingEdits,
  getPendingEdit,
  approveEdit,
  rejectEdit,
} from '../documents/document-tool-executor'
import type { DocumentEditRequest } from '../../shared/types'

/**
 * Register all document tool IPC handlers
 */
export function registerDocumentToolHandlers(): void {
  // ============================================================================
  // Tool Execution Handlers
  // ============================================================================

  /**
   * List all documents for an agent
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_TOOL_LIST,
    async (_event, agentId: string) => {
      return executeListDocuments(agentId)
    }
  )

  /**
   * Read document content
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_TOOL_READ,
    async (_event, args: { documentId: string }) => {
      return executeReadDocument(args)
    }
  )

  /**
   * Create a new document
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_TOOL_CREATE,
    async (
      _event,
      args: { filename: string; content: string; mimeType?: string },
      agentId: string
    ) => {
      return executeCreateDocument(args, agentId)
    }
  )

  /**
   * Edit an existing document
   * Returns requiresConfirmation: true for destructive operations
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_TOOL_EDIT,
    async (_event, args: DocumentEditRequest, agentId: string) => {
      return executeEditDocument(args, agentId)
    }
  )

  // ============================================================================
  // Pending Edit Confirmation Handlers
  // ============================================================================

  /**
   * Get all pending edits for an agent
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_EDIT_GET_PENDING,
    async (_event, agentId: string) => {
      const edits = getPendingEdits(agentId)
      return {
        success: true,
        edits,
        count: edits.length,
      }
    }
  )

  /**
   * Approve a pending edit
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_EDIT_APPROVE,
    async (_event, pendingEditId: string) => {
      const result = await approveEdit(pendingEditId)
      return result
    }
  )

  /**
   * Reject a pending edit
   */
  ipcMain.handle(
    IPC_CHANNELS.DOCUMENT_EDIT_REJECT,
    async (_event, pendingEditId: string) => {
      const result = rejectEdit(pendingEditId)
      return result
    }
  )
}
