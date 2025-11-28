import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Agent } from '../../shared/types'

interface AgentStore {
  agents: Agent[]
  activeAgentId: string | null
  isLoading: boolean
  error: string | null

  // Actions
  loadAgents: () => Promise<void>
  createAgent: (name?: string, model?: string, provider?: Agent['provider']) => Promise<Agent | null>
  deleteAgent: (id: string) => Promise<void>
  setActiveAgent: (id: string | null) => Promise<void>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>
  getActiveAgent: () => Agent | null
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  activeAgentId: null,
  isLoading: false,
  error: null,

  loadAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const agents = await ipc.agent.getAll()
      set({ agents, isLoading: false })
      
      // If no active agent but agents exist, select the first one
      const { activeAgentId } = get()
      if (!activeAgentId && agents.length > 0) {
        await get().setActiveAgent(agents[0].id)
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load agents',
        isLoading: false 
      })
    }
  },

  createAgent: async (name, model, provider) => {
    set({ isLoading: true, error: null })
    try {
      // Use defaults from localStorage if not provided
      // Default to gemini-2.5-flash for cost efficiency (~100x cheaper than opus)
      const defaultProvider = localStorage.getItem('defaultProvider') || 'gemini'
      const defaultModel = localStorage.getItem('defaultModel') || 'gemini-2.5-flash'

      const agent = await ipc.agent.create({
        name,
        model: model || defaultModel,
        provider: (provider || defaultProvider) as Agent['provider'],
      })
      const agents = await ipc.agent.getAll()
      set({ agents, isLoading: false })

      // Automatically select the newly created agent
      await get().setActiveAgent(agent.id)

      return agent
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create agent',
        isLoading: false
      })
      return null
    }
  },

  deleteAgent: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await ipc.agent.delete(id)
      const agents = await ipc.agent.getAll()
      
      // If deleted agent was active, select another or clear selection
      const { activeAgentId } = get()
      const newActiveId = activeAgentId === id 
        ? (agents.length > 0 ? agents[0].id : null)
        : activeAgentId
      
      set({ agents, activeAgentId: newActiveId, isLoading: false })
      
      if (newActiveId !== activeAgentId) {
        await get().setActiveAgent(newActiveId)
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete agent',
        isLoading: false 
      })
    }
  },

  setActiveAgent: async (id: string | null) => {
    set({ activeAgentId: id })

    // Load messages and tabs for the active agent
    if (id) {
      const { useChatStore } = await import('./chatStore')
      const { useTabStore } = await import('./tabStore')

      useChatStore.getState().loadMessages(id)
      useTabStore.getState().loadTabs(id)
    }
  },

  updateAgent: async (id: string, updates: Partial<Agent>) => {
    set({ isLoading: true, error: null })
    try {
      await ipc.agent.update(id, updates)
      const agents = await ipc.agent.getAll()
      set({ agents, isLoading: false })
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update agent',
        isLoading: false 
      })
    }
  },

  getActiveAgent: () => {
    const { agents, activeAgentId } = get()
    return agents.find(a => a.id === activeAgentId) || null
  },
}))

