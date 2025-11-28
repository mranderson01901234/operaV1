/**
 * File processing IPC handlers
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { processFileFromDataUri, validateFile } from '../files/file-processor'

export function registerFileHandlers() {
  /**
   * Process a file from a data URI
   * Called from renderer with base64 data
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE_PROCESS,
    async (
      _event,
      params: {
        dataUri: string
        filename: string
        mimeType: string
        size: number
        provider?: string
      }
    ) => {
      try {
        const result = await processFileFromDataUri(
          params.dataUri,
          params.filename,
          params.mimeType,
          params.size,
          params.provider || 'default'
        )

        return result
      } catch (error) {
        console.error('[File Process] Error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process file',
        }
      }
    }
  )

  /**
   * Validate a file without full processing
   * Used for quick validation before upload
   */
  ipcMain.handle(
    IPC_CHANNELS.FILE_VALIDATE,
    async (
      _event,
      params: {
        dataUri: string
        filename: string
        mimeType: string
        size: number
        provider?: string
      }
    ) => {
      try {
        // Extract buffer from data URI
        const match = params.dataUri.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) {
          return {
            valid: false,
            error: 'Invalid data URI format',
          }
        }

        const buffer = Buffer.from(match[2], 'base64')

        const result = validateFile(
          buffer,
          params.filename,
          params.mimeType,
          params.provider || 'default'
        )

        return result
      } catch (error) {
        console.error('[File Validate] Error:', error)
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Failed to validate file',
        }
      }
    }
  )
}
