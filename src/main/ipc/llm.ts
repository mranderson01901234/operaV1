import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { llmRouter } from '../llm/router'
import { apiKeyManager } from '../llm/apiKeys'
import { getToolsForProvider } from '../llm/tools'
import type { ChatParams, ChatChunk } from '../../shared/types'

/**
 * Registers all LLM-related IPC handlers
 */
export function registerLLMHandlers(): void {
  // Stream LLM responses
  ipcMain.handle(IPC_CHANNELS.LLM_STREAM, async (_event, params: ChatParams & { provider: string }): Promise<ChatChunk[]> => {
    try {
      const { provider, ...chatParams } = params
      console.log('[LLM] Starting stream request:', {
        provider,
        model: chatParams.model,
        messageCount: chatParams.messages.length,
        hasTools: !!chatParams.tools && chatParams.tools.length > 0,
        hasImages: !!chatParams.images && chatParams.images.length > 0,
      })
      
      const stream = llmRouter.chat(provider, chatParams)
      const chunks: ChatChunk[] = []
      let chunkCount = 0
      
      for await (const chunk of stream) {
        chunkCount++
        if (chunk.error) {
          console.error('[LLM] Chunk error:', chunk.error)
        }
        if (chunk.content) {
          console.log('[LLM] Content chunk:', chunk.content.substring(0, 50) + '...')
        }
        if (chunk.toolCalls) {
          console.log('[LLM] Tool calls chunk:', chunk.toolCalls.length)
        }
        chunks.push(chunk)
      }
      
      console.log('[LLM] Stream complete:', {
        chunkCount,
        totalChunks: chunks.length,
        hasContent: chunks.some((c) => c.content),
        hasToolCalls: chunks.some((c) => c.toolCalls),
      })
      
      return chunks
    } catch (error) {
      console.error('[LLM] Stream handler error:', error)
      return [{
        done: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      }]
    }
  })

  // API Key management
  ipcMain.handle('apiKey:set', async (_event, provider: string, key: string) => {
    return await apiKeyManager.store(provider, key)
  })

  ipcMain.handle('apiKey:get', async (_event, provider: string) => {
    return await apiKeyManager.get(provider)
  })

  ipcMain.handle('apiKey:has', async (_event, provider: string) => {
    return await apiKeyManager.has(provider)
  })

  ipcMain.handle('apiKey:delete', async (_event, provider: string) => {
    return await apiKeyManager.delete(provider)
  })

  // LLM provider info
  ipcMain.handle('llm:getProviders', async () => {
    return llmRouter.getAvailableProviders()
  })

  ipcMain.handle('llm:getModels', async (_event, provider: string) => {
    return llmRouter.getProviderModels(provider)
  })

  ipcMain.handle('llm:getModelCapabilities', async (_event, provider: string, model: string) => {
    return llmRouter.getModelCapabilities(provider, model)
  })

  ipcMain.handle('llm:getBrowserTools', async (_event, provider: string) => {
    return getToolsForProvider(provider)
  })
}
