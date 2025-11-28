// src/main/ipc/research.ts

import { ipcMain } from 'electron'
import { DeepResearchEngine, DEFAULT_CONFIG, type DeepResearchConfig } from '../research'
import { ResearchLLMAdapter } from '../research/llm-adapter'
import { IPC_CHANNELS } from '../../shared/ipc-channels'



export function registerResearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.RESEARCH_DEEP, async (_event, userPrompt: string, agentId: string) => {
    try {
      const llmAdapter = new ResearchLLMAdapter()
      // Create engine with agentId for this specific research request
      const engine = new DeepResearchEngine(llmAdapter, DEFAULT_CONFIG, agentId)
      const result = await engine.research(userPrompt)
      return { success: true, result }
    } catch (error) {
      console.error('[Research IPC] Deep research failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.RESEARCH_CONFIGURE, async (_event, _config: Partial<DeepResearchConfig>) => {
    try {
      // Configuration is now per-request, no need to store globally
      return { success: true }
    } catch (error) {
      console.error('[Research IPC] Configuration failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

