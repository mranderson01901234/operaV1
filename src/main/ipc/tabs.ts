import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { getTabManager } from '../browser/tab-manager'
import { tabQueries, tabHistoryQueries } from '../db/queries'
import type { CreateTabParams } from '../../shared/types'

/**
 * Registers all tab-related IPC handlers
 */
export function registerTabHandlers(): void {
  // Create a new tab
  ipcMain.handle(
    IPC_CHANNELS.TAB_CREATE,
    async (_event, params: CreateTabParams) => {
      try {
        const tabManager = getTabManager()
        if (!tabManager) {
          return { success: false, error: 'TabManager not initialized' }
        }

        const tab = tabManager.createTab(
          params.agentId,
          params.url,
          params.makeActive ?? true,
          params.type || 'browser',
          params.documentId
        )

        return { success: true, tab }
      } catch (error) {
        console.error('Error creating tab:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Close a tab
  ipcMain.handle(IPC_CHANNELS.TAB_CLOSE, async (_event, tabId: string) => {
    try {
      const tabManager = getTabManager()
      if (!tabManager) {
        return { success: false, error: 'TabManager not initialized' }
      }

      tabManager.closeTab(tabId)
      return { success: true }
    } catch (error) {
      console.error('Error closing tab:', error)
      return { success: false, error: String(error) }
    }
  })

  // Switch to a tab
  ipcMain.handle(IPC_CHANNELS.TAB_SWITCH, async (_event, tabId: string) => {
    try {
      const tabManager = getTabManager()
      if (!tabManager) {
        return { success: false, error: 'TabManager not initialized' }
      }

      tabManager.switchToTab(tabId)
      return { success: true }
    } catch (error) {
      console.error('Error switching tab:', error)
      return { success: false, error: String(error) }
    }
  })

  // Update a tab
  ipcMain.handle(
    IPC_CHANNELS.TAB_UPDATE,
    async (
      _event,
      tabId: string,
      updates: { title?: string; url?: string; isPinned?: boolean }
    ) => {
      try {
        const tab = tabQueries.update(tabId, updates)
        if (!tab) {
          return { success: false, error: 'Tab not found' }
        }
        return { success: true, tab }
      } catch (error) {
        console.error('Error updating tab:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Get tabs for an agent
  ipcMain.handle(
    IPC_CHANNELS.TAB_GET_BY_AGENT,
    async (_event, agentId: string) => {
      try {
        const tabManager = getTabManager()
        if (!tabManager) {
          // Fall back to database query
          const tabs = tabQueries.getByAgent(agentId)
          return { success: true, tabs }
        }

        // Load tabs and ensure BrowserViews are created
        const tabs = await tabManager.loadAgentTabs(agentId)
        return { success: true, tabs }
      } catch (error) {
        console.error('Error getting tabs for agent:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Get active tab
  ipcMain.handle(IPC_CHANNELS.TAB_GET_ACTIVE, async (_event, agentId: string) => {
    try {
      const tab = tabQueries.getActiveByAgent(agentId)
      return { success: true, tab }
    } catch (error) {
      console.error('Error getting active tab:', error)
      return { success: false, error: String(error) }
    }
  })

  // Reorder tabs
  ipcMain.handle(
    IPC_CHANNELS.TAB_REORDER,
    async (_event, tabIds: string[]) => {
      try {
        tabQueries.reorder(tabIds)
        return { success: true }
      } catch (error) {
        console.error('Error reordering tabs:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Get tab history
  ipcMain.handle(
    IPC_CHANNELS.TAB_HISTORY_GET,
    async (_event, tabId: string, limit?: number) => {
      try {
        const history = tabHistoryQueries.getByTab(tabId, limit)
        return { success: true, history }
      } catch (error) {
        console.error('Error getting tab history:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Clear tab history
  ipcMain.handle(
    IPC_CHANNELS.TAB_HISTORY_CLEAR,
    async (_event, tabId: string) => {
      try {
        const deleted = tabHistoryQueries.clearByTab(tabId)
        return { success: true, deleted }
      } catch (error) {
        console.error('Error clearing tab history:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  // Delete individual history entry
  ipcMain.handle(
    IPC_CHANNELS.TAB_HISTORY_DELETE,
    async (_event, entryId: string) => {
      try {
        const deleted = tabHistoryQueries.delete(entryId)
        return { success: true, deleted }
      } catch (error) {
        console.error('Error deleting history entry:', error)
        return { success: false, error: String(error) }
      }
    }
  )
}
