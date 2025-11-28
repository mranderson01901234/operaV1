import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { agentQueries, messageQueries } from '../db/queries'
import type { Agent, Message } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'

// Agent IPC handlers
export function registerAgentHandlers() {
  ipcMain.handle(IPC_CHANNELS.AGENT_CREATE, async (_event, data: { name?: string; model?: string; provider?: Agent['provider'] }) => {
    // Validate that model and provider are provided
    if (!data.model || !data.provider) {
      throw new Error('Model and provider must be provided when creating an agent')
    }
    
    const agent: Omit<Agent, 'createdAt' | 'updatedAt'> = {
      id: uuidv4(),
      name: data.name || `Agent ${Date.now()}`,
      model: data.model,
      provider: data.provider,
    }
    return agentQueries.create(agent)
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_GET_ALL, async () => {
    return agentQueries.getAll()
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_GET_BY_ID, async (_event, id: string) => {
    return agentQueries.getById(id)
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_UPDATE, async (_event, id: string, updates: Partial<Agent>) => {
    return agentQueries.update(id, updates)
  })

  ipcMain.handle(IPC_CHANNELS.AGENT_DELETE, async (_event, id: string) => {
    return agentQueries.delete(id)
  })
}

// Message IPC handlers
export function registerMessageHandlers() {
  ipcMain.handle(IPC_CHANNELS.MESSAGE_CREATE, async (_event, data: Omit<Message, 'id' | 'createdAt'>) => {
    const message: Omit<Message, 'createdAt'> = {
      ...data,
      id: uuidv4(),
    }
    return messageQueries.create(message)
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_UPDATE, async (_event, id: string, updates: { content?: string; toolCalls?: any[] }) => {
    return messageQueries.update(id, updates)
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_GET_BY_AGENT, async (_event, agentId: string) => {
    return messageQueries.getByAgent(agentId)
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_GET_FIRST_USER, async (_event, agentId: string) => {
    return messageQueries.getFirstUserMessage(agentId)
  })

  ipcMain.handle(IPC_CHANNELS.MESSAGE_DELETE, async (_event, id: string) => {
    return messageQueries.delete(id)
  })
}

// Import tab handlers
import { registerTabHandlers } from './tabs'
// Import file handlers
import { registerFileHandlers } from './files'
// Import document handlers
import { registerDocumentHandlers } from './documents'

export function registerAllHandlers() {
  registerAgentHandlers()
  registerMessageHandlers()
  registerTabHandlers()
  registerFileHandlers()
  registerDocumentHandlers()
  // LLM handlers are registered separately in main/index.ts after app is ready
}

