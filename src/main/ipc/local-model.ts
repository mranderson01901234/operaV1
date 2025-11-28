/**
 * IPC handlers for cloud preprocessor operations
 * Used for cost optimization in web search workflows
 * 
 * Uses Gemini 2.5 Flash (cheapest cloud model) instead of local Ollama
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { cloudPreprocessor } from '../llm/cloud-preprocessor'
import type { Message } from '../../shared/types'

/**
 * Registers all cloud preprocessor IPC handlers
 */
export function registerLocalModelHandlers(): void {
  // Check if cloud preprocessor is available
  ipcMain.handle(IPC_CHANNELS.LOCAL_MODEL_CHECK_AVAILABLE, async () => {
    try {
      return {
        success: true,
        available: cloudPreprocessor.isAvailable(),
      }
    } catch (error) {
      console.error('[Cloud Preprocessor] Check availability error:', error)
      return {
        success: false,
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Classify search intent from user message
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_MODEL_CLASSIFY_SEARCH_INTENT,
    async (_event, userMessage: string) => {
      try {
        console.log('[Cloud Preprocessor] Classifying search intent:', userMessage.substring(0, 100))
        const intent = await cloudPreprocessor.classifySearchIntent(userMessage)
        
        if (intent) {
          console.log('[Cloud Preprocessor] Search intent detected:', {
            isSearch: intent.isSearch,
            query: intent.query,
            searchEngine: intent.searchEngine,
            needsPremiumModel: intent.needsPremiumModel,
            confidence: intent.confidence,
          })
        } else {
          console.log('[Cloud Preprocessor] No search intent detected or low confidence')
        }

        return {
          success: true,
          intent,
        }
      } catch (error) {
        console.error('[Cloud Preprocessor] Classify search intent error:', error)
        return {
          success: false,
          intent: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  // Extract search results from page content
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_MODEL_EXTRACT_SEARCH_RESULTS,
    async (_event, pageText: string, query: string) => {
      try {
        console.log('[Cloud Preprocessor] Extracting search results for query:', query)
        const results = await cloudPreprocessor.extractSearchResults(pageText, query)
        
        if (results) {
          console.log(`[Cloud Preprocessor] Extracted ${results.length} search results`)
        } else {
          console.log('[Cloud Preprocessor] Failed to extract search results, falling back to cloud model')
        }

        return {
          success: true,
          results,
        }
      } catch (error) {
        console.error('[Cloud Preprocessor] Extract search results error:', error)
        return {
          success: false,
          results: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )

  // Plan multi-step search strategy
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_MODEL_PLAN_SEARCH,
    async (_event, userMessage: string, conversationHistory: Message[]) => {
      try {
        console.log('[Cloud Preprocessor] Planning search strategy for:', userMessage.substring(0, 100))
        const plan = await cloudPreprocessor.planSearchStrategy(userMessage, conversationHistory)
        
        if (plan) {
          console.log(`[Cloud Preprocessor] Search plan created with ${plan.steps.length} steps`)
        } else {
          console.log('[Cloud Preprocessor] Failed to create search plan, falling back to cloud model')
        }

        return {
          success: true,
          plan,
        }
      } catch (error) {
        console.error('[Cloud Preprocessor] Plan search error:', error)
        return {
          success: false,
          plan: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }
  )
}

