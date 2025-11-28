import { create } from 'zustand'
import type { BrowserState } from '../../shared/types'
import { ipc } from '../lib/ipc'
import { DEFAULT_BROWSER_URL } from '../../shared/constants'
import { useTabStore } from './tabStore'

interface BrowserStore {
  // Current active tab state (derived from tabStore)
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  screenshot?: string
  accessibilityTree?: any[]

  // Actions (now operate on active tab)
  navigate: (url: string, tabId?: string) => Promise<void>
  goBack: (tabId?: string) => Promise<void>
  goForward: (tabId?: string) => Promise<void>
  refresh: (tabId?: string) => Promise<void>
  updateState: (state: Partial<BrowserState>) => void
  getContext: () => Promise<BrowserState>
  syncState: (tabId?: string) => Promise<void>
  syncFromActiveTab: () => void
}

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  url: DEFAULT_BROWSER_URL,
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  screenshot: undefined,

  navigate: async (url: string, tabId?: string) => {
    const result = await ipc.browser.navigate(url, tabId)
    if (result.success) {
      set({ isLoading: true })
    } else {
      console.error('Navigation failed:', result.error)
    }
  },

  goBack: async (tabId?: string) => {
    const result = await ipc.browser.goBack(tabId)
    if (result.success) {
      set({ isLoading: true })
    } else {
      console.error('Go back failed:', result.error)
    }
  },

  goForward: async (tabId?: string) => {
    const result = await ipc.browser.goForward(tabId)
    if (result.success) {
      set({ isLoading: true })
    } else {
      console.error('Go forward failed:', result.error)
    }
  },

  refresh: async (tabId?: string) => {
    const result = await ipc.browser.refresh(tabId)
    if (result.success) {
      set({ isLoading: true })
    } else {
      console.error('Refresh failed:', result.error)
    }
  },

  updateState: (state: Partial<BrowserState>) => {
    set(state)
  },

  getContext: async (): Promise<BrowserState> => {
    const result = await ipc.browser.getContext()
    if (result.success && result.context) {
      const updates: Partial<BrowserState> = {}
      if (result.context.screenshot) {
        updates.screenshot = result.context.screenshot
      }
      if (result.context.accessibilityTree) {
        updates.accessibilityTree = result.context.accessibilityTree
      }
      if (Object.keys(updates).length > 0) {
        set(updates)
      }
      return result.context
    }

    const state = get()
    return {
      url: state.url,
      title: state.title,
      isLoading: state.isLoading,
      screenshot: state.screenshot,
      accessibilityTree: state.accessibilityTree,
    }
  },

  syncState: async (tabId?: string) => {
    const result = await ipc.browser.getState(tabId)
    if (result.success && result.state) {
      set(result.state)
    }
  },

  // Sync browser store state from the currently active tab
  syncFromActiveTab: () => {
    const tabStore = useTabStore.getState()
    const activeTab = tabStore.getActiveTab()
    if (activeTab) {
      const tabState = tabStore.tabStates.get(activeTab.id)
      set({
        url: activeTab.url,
        title: activeTab.title,
        isLoading: tabState?.isLoading ?? false,
        canGoBack: tabState?.canGoBack ?? false,
        canGoForward: tabState?.canGoForward ?? false,
      })
    }
  },
}))

// Set up IPC event listeners for browser state updates
// These now handle both tab-aware (with tabId) and legacy (without tabId) events
if (typeof window !== 'undefined' && window.electronAPI) {
  // Listen for browser navigation events
  window.electronAPI.on('browser:navigated', (data: string | { tabId: string; url: string }) => {
    // Handle both old format (string) and new format (object with tabId)
    if (typeof data === 'string') {
      useBrowserStore.getState().updateState({ url: data })
    } else {
      // Tab-aware event - update if this is the active tab
      const tabStore = useTabStore.getState()
      if (data.tabId === tabStore.activeTabId) {
        useBrowserStore.getState().updateState({ url: data.url })
      }
    }
  })

  // Listen for title updates
  window.electronAPI.on('browser:title-updated', (data: string | { tabId: string; title: string }) => {
    if (typeof data === 'string') {
      useBrowserStore.getState().updateState({ title: data })
    } else {
      const tabStore = useTabStore.getState()
      if (data.tabId === tabStore.activeTabId) {
        useBrowserStore.getState().updateState({ title: data.title })
      }
    }
  })

  // Listen for loading state
  window.electronAPI.on('browser:loading', (data: boolean | { tabId: string; isLoading: boolean }) => {
    if (typeof data === 'boolean') {
      useBrowserStore.getState().updateState({ isLoading: data })
    } else {
      const tabStore = useTabStore.getState()
      if (data.tabId === tabStore.activeTabId) {
        useBrowserStore.getState().updateState({ isLoading: data.isLoading })
      }
    }
  })

  // Listen for navigation state (back/forward)
  window.electronAPI.on(
    'browser:navigation-state',
    (data: { canGoBack: boolean; canGoForward: boolean } | { tabId: string; canGoBack: boolean; canGoForward: boolean }) => {
      if ('tabId' in data) {
        const tabStore = useTabStore.getState()
        if (data.tabId === tabStore.activeTabId) {
          useBrowserStore.getState().updateState({
            canGoBack: data.canGoBack,
            canGoForward: data.canGoForward,
          })
        }
      } else {
        useBrowserStore.getState().updateState({
          canGoBack: data.canGoBack,
          canGoForward: data.canGoForward,
        })
      }
    }
  )

  // Listen for tab switched events - sync browser store when active tab changes
  window.electronAPI.on('tab:switched', (_data: { tabId: string }) => {
    // Give a small delay to let tabStore update first
    setTimeout(() => {
      useBrowserStore.getState().syncFromActiveTab()
    }, 50)
  })
}

