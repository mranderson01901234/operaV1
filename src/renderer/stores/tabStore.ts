import { create } from 'zustand'
import type { Tab, TabState } from '../../shared/types'
import { ipc } from '../lib/ipc'

interface TabStore {
  // State
  tabs: Tab[]
  activeTabId: string | null
  tabStates: Map<string, { isLoading: boolean; canGoBack: boolean; canGoForward: boolean }>
  isLoading: boolean

  // Actions
  loadTabs: (agentId: string) => Promise<void>
  createTab: (agentId: string, url?: string, makeActive?: boolean) => Promise<Tab | null>
  closeTab: (tabId: string) => Promise<void>
  switchTab: (tabId: string) => Promise<void>
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  updateTabState: (tabId: string, state: { isLoading?: boolean; canGoBack?: boolean; canGoForward?: boolean }) => void
  getActiveTab: () => Tab | null
  getActiveTabType: () => 'browser' | 'document' | null
  clearTabs: () => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  tabStates: new Map(),
  isLoading: false,

  loadTabs: async (agentId: string) => {
    set({ isLoading: true })
    try {
      const result = await ipc.tab.getByAgent(agentId)
      if (result.success && result.tabs) {
        const activeTab = result.tabs.find((t) => t.isActive) || result.tabs[0]
        set({
          tabs: result.tabs,
          activeTabId: activeTab?.id || null,
          isLoading: false,
        })
      } else {
        set({ tabs: [], activeTabId: null, isLoading: false })
      }
    } catch (error) {
      console.error('Failed to load tabs:', error)
      set({ tabs: [], activeTabId: null, isLoading: false })
    }
  },

  createTab: async (agentId: string, url?: string, makeActive: boolean = true) => {
    try {
      const result = await ipc.tab.create({ agentId, url, makeActive })
      if (result.success && result.tab) {
        set((state) => ({
          tabs: [...state.tabs, result.tab!],
          activeTabId: makeActive ? result.tab!.id : state.activeTabId,
        }))
        return result.tab
      }
      return null
    } catch (error) {
      console.error('Failed to create tab:', error)
      return null
    }
  },

  closeTab: async (tabId: string) => {
    try {
      const result = await ipc.tab.close(tabId)
      if (result.success) {
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId)
          let newActiveTabId = state.activeTabId

          // If we closed the active tab, switch to another one
          if (state.activeTabId === tabId && newTabs.length > 0) {
            newActiveTabId = newTabs[0].id
          } else if (newTabs.length === 0) {
            newActiveTabId = null
          }

          // Clean up tab states
          const newTabStates = new Map(state.tabStates)
          newTabStates.delete(tabId)

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
            tabStates: newTabStates,
          }
        })
      }
    } catch (error) {
      console.error('Failed to close tab:', error)
    }
  },

  switchTab: async (tabId: string) => {
    try {
      const result = await ipc.tab.switch(tabId)
      if (result.success) {
        set((state) => ({
          tabs: state.tabs.map((t) => ({
            ...t,
            isActive: t.id === tabId,
          })),
          activeTabId: tabId,
        }))
      }
    } catch (error) {
      console.error('Failed to switch tab:', error)
    }
  },

  updateTab: (tabId: string, updates: Partial<Tab>) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
    }))
  },

  updateTabState: (
    tabId: string,
    stateUpdate: { isLoading?: boolean; canGoBack?: boolean; canGoForward?: boolean }
  ) => {
    set((state) => {
      const newTabStates = new Map(state.tabStates)
      const currentState = newTabStates.get(tabId) || {
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }
      newTabStates.set(tabId, { ...currentState, ...stateUpdate })
      return { tabStates: newTabStates }
    })
  },

  getActiveTab: () => {
    const state = get()
    return state.tabs.find((t) => t.id === state.activeTabId) || null
  },

  getActiveTabType: () => {
    const state = get()
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
    return activeTab?.type || null
  },

  clearTabs: () => {
    set({ tabs: [], activeTabId: null, tabStates: new Map() })
  },
}))

// Set up IPC event listeners for tab updates
if (typeof window !== 'undefined' && window.electronAPI) {
  // Listen for tab created events
  window.electronAPI.on('tab:created', (data: { tabId: string; tab: Tab }) => {
    const state = useTabStore.getState()
    // Only add if not already present
    if (!state.tabs.find((t) => t.id === data.tabId)) {
      useTabStore.setState((state) => ({
        tabs: [...state.tabs, data.tab],
      }))
    }
  })

  // Listen for tab closed events
  window.electronAPI.on('tab:closed', (data: { tabId: string }) => {
    useTabStore.setState((state) => ({
      tabs: state.tabs.filter((t) => t.id !== data.tabId),
      activeTabId: state.activeTabId === data.tabId ? state.tabs[0]?.id || null : state.activeTabId,
    }))
  })

  // Listen for tab switched events
  window.electronAPI.on('tab:switched', (data: { tabId: string }) => {
    useTabStore.setState((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === data.tabId })),
      activeTabId: data.tabId,
    }))
  })

  // Listen for tab favicon updates
  window.electronAPI.on('tab:favicon-updated', (data: { tabId: string; favicon: string }) => {
    useTabStore.getState().updateTab(data.tabId, { favicon: data.favicon })
  })

  // Listen for browser navigation events (now include tabId)
  window.electronAPI.on('browser:navigated', (data: { tabId: string; url: string }) => {
    useTabStore.getState().updateTab(data.tabId, { url: data.url })
  })

  // Listen for browser title updates
  window.electronAPI.on('browser:title-updated', (data: { tabId: string; title: string }) => {
    useTabStore.getState().updateTab(data.tabId, { title: data.title })
  })

  // Listen for browser loading state
  window.electronAPI.on('browser:loading', (data: { tabId: string; isLoading: boolean }) => {
    useTabStore.getState().updateTabState(data.tabId, { isLoading: data.isLoading })
  })

  // Listen for browser navigation state
  window.electronAPI.on(
    'browser:navigation-state',
    (data: { tabId: string; canGoBack: boolean; canGoForward: boolean }) => {
      useTabStore.getState().updateTabState(data.tabId, {
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward,
      })
    }
  )
}
