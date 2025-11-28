import { BrowserView, BrowserWindow } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_BROWSER_URL } from '../../shared/constants'
import { tabQueries, tabHistoryQueries, documentQueries } from '../db/queries'
import type { Tab, TabState } from '../../shared/types'

interface TabManagerConfig {
  sidebarWidth: number
  headerHeight: number
  splitRatio: number
}

interface TabBrowserViewInfo {
  tabId: string
  agentId: string
  browserView: BrowserView
  isActive: boolean
}

class TabManager {
  private tabs: Map<string, TabBrowserViewInfo> = new Map()
  private activeTabId: string | null = null
  private currentAgentId: string | null = null
  private window: BrowserWindow | null = null
  private config: TabManagerConfig
  private debounceTimer: NodeJS.Timeout | null = null

  constructor(window: BrowserWindow, config: TabManagerConfig) {
    this.window = window
    this.config = config
    this.setupWindowEventListeners()
  }

  private setupWindowEventListeners(): void {
    if (!this.window) return

    // Window resize - use debounced update
    this.window.on('resize', () => this.debouncedBoundsUpdate())

    // DevTools state changes
    this.window.webContents.on('devtools-opened', () => this.debouncedBoundsUpdate())
    this.window.webContents.on('devtools-closed', () => this.debouncedBoundsUpdate())

    // Track content bounds changes
    this.window.on('moved', () => this.debouncedBoundsUpdate())
    this.window.on('maximize', () => this.debouncedBoundsUpdate())
    this.window.on('unmaximize', () => this.debouncedBoundsUpdate())
  }

  private debouncedBoundsUpdate = (): void => {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.updateAllBounds()
      this.debounceTimer = null
    }, 100)
  }

  /**
   * Create a new tab for an agent
   */
  public createTab(
    agentId: string,
    url?: string,
    makeActive: boolean = true,
    type: 'browser' | 'document' = 'browser',
    documentId?: string,
    partition?: string
  ): Tab {
    if (!this.window) {
      throw new Error('TabManager: Window not initialized')
    }

    const tabId = uuidv4()
    const position = tabQueries.getNextPosition(agentId)

    // Create database entry
    const tab = tabQueries.create({
      id: tabId,
      agentId,
      title: 'New Tab',
      url: url || DEFAULT_BROWSER_URL,
      type,
      documentId,
      isActive: makeActive,
      isPinned: false,
      position,
    })

    // Only create BrowserView for browser tabs
    if (type === 'browser') {
      // Create BrowserView
      const browserView = this.createBrowserView(tabId, agentId, partition)

      // Store in our map
      this.tabs.set(tabId, {
        tabId,
        agentId,
        browserView,
        isActive: false,
      })

      // Navigate to URL
      if (url || DEFAULT_BROWSER_URL) {
        this.navigateTab(tabId, url || DEFAULT_BROWSER_URL)
      }

      // Switch to this tab if makeActive
      if (makeActive) {
        this.switchToTab(tabId)
      } else {
        // Position off-screen
        this.hideTab(tabId)
      }
    } else {
      // For document tabs, just notify renderer
      // The renderer will handle displaying the document
      if (makeActive) {
        this.activeTabId = tabId
        this.currentAgentId = agentId
        tabQueries.setActiveTab(agentId, tabId)
      }
    }

    // Notify renderer
    this.window.webContents.send('tab:created', { tabId, tab })

    return tab
  }

  /**
   * Create BrowserView for a tab
   */
  private createBrowserView(tabId: string, _agentId: string, partition?: string): BrowserView {
    const webPreferences: any = {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    }

    // Use partition if provided
    if (partition) {
      webPreferences.partition = partition
    }

    const view = new BrowserView({
      webPreferences,
    })

    view.setBackgroundColor('#1a1a1a')

    // Apply resource blocking if using research partition
    if (partition === 'persist:research') {
      const session = view.webContents.session

      // Block heavy resources
      const filter = {
        urls: ['*://*/*']
      }

      session.webRequest.onBeforeRequest(filter, (details, callback) => {
        const resourceType = details.resourceType.toLowerCase()
        const blockedTypes = ['image', 'media', 'font', 'stylesheet', 'websocket', 'manifest']

        if (blockedTypes.includes(resourceType)) {
          callback({ cancel: true })
        } else {
          callback({ cancel: false })
        }
      })
    }

    if (this.window) {
      this.window.addBrowserView(view)
    }

    this.setupBrowserViewListeners(view, tabId)
    this.attachCDPDebugger(view, tabId)

    return view
  }

  /**
   * Set up event listeners for a BrowserView
   */
  private setupBrowserViewListeners(view: BrowserView, tabId: string): void {
    if (!this.window) return

    const webContents = view.webContents

    // Crash detection
    webContents.on('render-process-gone', (_event, details) => {
      console.error(`[TabManager] Tab ${tabId} render process crashed:`, details)
      this.handleTabCrash(tabId)
    })

    webContents.on('unresponsive', () => {
      console.warn(`[TabManager] Tab ${tabId} became unresponsive`)
    })

    webContents.on('responsive', () => {
      console.log(`[TabManager] Tab ${tabId} became responsive again`)
    })

    // Suppress harmless errors
    webContents.on('console-message', (_event, _level, message) => {
      if (
        message.includes('service_worker_storage') ||
        message.includes('Failed to delete the database')
      ) {
        return
      }
    })

    // Navigation events - include tabId in all events
    webContents.on('did-start-loading', () => {
      this.window?.webContents.send('browser:loading', { tabId, isLoading: true })
    })

    webContents.on('did-stop-loading', () => {
      this.window?.webContents.send('browser:loading', { tabId, isLoading: false })
    })

    webContents.on('did-navigate', (_event, url) => {
      this.window?.webContents.send('browser:navigated', { tabId, url })
      // Update database
      tabQueries.update(tabId, { url })
      // Add to history
      const tab = tabQueries.getById(tabId)
      if (tab) {
        tabHistoryQueries.add({
          id: uuidv4(),
          tabId,
          url,
          title: tab.title,
          position: 0, // Will be calculated in query
        })
      }
    })

    webContents.on('did-navigate-in-page', (_event, url) => {
      this.window?.webContents.send('browser:navigated', { tabId, url })
      tabQueries.update(tabId, { url })
    })

    webContents.on('page-title-updated', (_event, title) => {
      this.window?.webContents.send('browser:title-updated', { tabId, title })
      tabQueries.update(tabId, { title })
    })

    webContents.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        // Store first favicon URL
        tabQueries.update(tabId, { favicon: favicons[0] })
        this.window?.webContents.send('tab:favicon-updated', { tabId, favicon: favicons[0] })
      }
    })

    webContents.on('did-finish-load', () => {
      const canGoBack = webContents.canGoBack()
      const canGoForward = webContents.canGoForward()
      this.window?.webContents.send('browser:navigation-state', {
        tabId,
        canGoBack,
        canGoForward,
      })
    })
  }

  /**
   * Attach CDP debugger to a BrowserView
   */
  private attachCDPDebugger(view: BrowserView, tabId: string): void {
    const cdpDebugger = view.webContents.debugger

    try {
      if (cdpDebugger.isAttached()) {
        return
      }

      cdpDebugger.attach('1.3')
      console.log(`[TabManager] CDP debugger attached for tab ${tabId}`)

      cdpDebugger.on('detach', (_event, reason: string) => {
        console.warn(`[TabManager] CDP debugger detached for tab ${tabId}:`, reason)
        setTimeout(() => {
          if (view && !cdpDebugger.isAttached()) {
            try {
              cdpDebugger.attach('1.3')
              console.log(`[TabManager] CDP debugger reattached for tab ${tabId}`)
            } catch (error) {
              console.error(`[TabManager] Failed to reattach CDP debugger for tab ${tabId}:`, error)
            }
          }
        }, 1000)
      })
    } catch (error) {
      console.error(`[TabManager] Failed to attach CDP debugger for tab ${tabId}:`, error)
    }
  }

  /**
   * Handle tab crash
   */
  private handleTabCrash(tabId: string): void {
    console.log(`[TabManager] Attempting to recover tab ${tabId}...`)

    const tabInfo = this.tabs.get(tabId)
    if (!tabInfo || !this.window) return

    try {
      // Remove crashed view
      this.window.removeBrowserView(tabInfo.browserView)

      // Create new BrowserView
      const newView = this.createBrowserView(tabId, tabInfo.agentId)
      tabInfo.browserView = newView

      // Reload last known URL
      const tab = tabQueries.getById(tabId)
      if (tab) {
        this.navigateTab(tabId, tab.url)
      }

      // Update bounds if this was active tab
      if (tabInfo.isActive) {
        this.updateActiveBounds()
      }

      console.log(`[TabManager] Tab ${tabId} recovered successfully`)
      this.window.webContents.send('tab:recovered', { tabId })
    } catch (error) {
      console.error(`[TabManager] Failed to recover tab ${tabId}:`, error)
    }
  }

  /**
   * Switch to a tab
   */
  public switchToTab(tabId: string): void {
    const tab = tabQueries.getById(tabId)
    if (!tab || !this.window) return

    // Handle browser tabs (with BrowserView)
    const tabInfo = this.tabs.get(tabId)
    if (tabInfo) {
      // Hide current active tab
      if (this.activeTabId && this.activeTabId !== tabId) {
        this.hideTab(this.activeTabId)
      }

      // Show new tab
      tabInfo.isActive = true
      this.activeTabId = tabId
      this.currentAgentId = tabInfo.agentId

      // Update database
      tabQueries.setActiveTab(tabInfo.agentId, tabId)

      // Update bounds to show tab
      this.updateActiveBounds()
    } else {
      // Handle document tabs (no BrowserView)
      // Hide current active browser tab if any
      if (this.activeTabId) {
        const activeTabInfo = this.tabs.get(this.activeTabId)
        if (activeTabInfo) {
          this.hideTab(this.activeTabId)
        }
      }

      this.activeTabId = tabId
      this.currentAgentId = tab.agentId

      // Update database
      tabQueries.setActiveTab(tab.agentId, tabId)
    }

    // Notify renderer
    this.window.webContents.send('tab:switched', { tabId })
  }

  /**
   * Hide a tab (position off-screen)
   */
  private hideTab(tabId: string): void {
    const tabInfo = this.tabs.get(tabId)
    if (!tabInfo) return

    tabInfo.isActive = false
    tabInfo.browserView.setBounds({ x: -10000, y: 0, width: 100, height: 100 })
  }

  /**
   * Close a tab
   */
  public closeTab(tabId: string): void {
    const tab = tabQueries.getById(tabId)
    if (!tab || !this.window) return

    const agentId = tab.agentId
    const tabInfo = this.tabs.get(tabId)
    const wasActive = tabInfo?.isActive || tab.isActive

    // Remove BrowserView if it exists (browser tabs only)
    if (tabInfo) {
      this.window.removeBrowserView(tabInfo.browserView)
      this.tabs.delete(tabId)
    }

    // Delete from database
    tabQueries.delete(tabId)

    // If this was active, switch to another tab
    if (wasActive) {
      const remainingTabs = this.getTabsForAgent(agentId)
      if (remainingTabs.length > 0) {
        this.switchToTab(remainingTabs[0].tabId)
      } else {
        this.activeTabId = null
      }
    }

    // Notify renderer
    this.window.webContents.send('tab:closed', { tabId })
  }

  /**
   * Navigate a tab to a URL (browser tabs only)
   */
  public navigateTab(tabId: string, url: string): void {
    const tabInfo = this.tabs.get(tabId)
    if (!tabInfo) return // Document tabs don't have BrowserView

    try {
      let normalizedUrl = url.trim()
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl
      }

      tabInfo.browserView.webContents.loadURL(normalizedUrl)
    } catch (error) {
      console.error(`[TabManager] Navigation failed for tab ${tabId}:`, error)
      this.handleTabCrash(tabId)
    }
  }

  /**
   * Go back in a tab (browser tabs only)
   */
  public goBack(tabId?: string): void {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) return

    const tabInfo = this.tabs.get(targetTabId)
    if (!tabInfo) return // Document tabs don't have BrowserView

    try {
      if (tabInfo.browserView.webContents.canGoBack()) {
        tabInfo.browserView.webContents.goBack()
      }
    } catch (error) {
      console.error(`[TabManager] Go back failed for tab ${targetTabId}:`, error)
    }
  }

  /**
   * Go forward in a tab (browser tabs only)
   */
  public goForward(tabId?: string): void {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) return

    const tabInfo = this.tabs.get(targetTabId)
    if (!tabInfo) return // Document tabs don't have BrowserView

    try {
      if (tabInfo.browserView.webContents.canGoForward()) {
        tabInfo.browserView.webContents.goForward()
      }
    } catch (error) {
      console.error(`[TabManager] Go forward failed for tab ${targetTabId}:`, error)
    }
  }

  /**
   * Refresh a tab
   */
  public refresh(tabId?: string): void {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) return

    const tabInfo = this.tabs.get(targetTabId)
    if (!tabInfo) return

    try {
      tabInfo.browserView.webContents.reload()
    } catch (error) {
      console.error(`[TabManager] Refresh failed for tab ${targetTabId}:`, error)
    }
  }

  /**
   * Get state for a tab
   */
  public getTabState(tabId?: string): TabState | null {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) return null

    const tabInfo = this.tabs.get(targetTabId)
    const tab = tabQueries.getById(targetTabId)
    if (!tabInfo || !tab) return null

    try {
      const webContents = tabInfo.browserView.webContents
      return {
        ...tab,
        isLoading: webContents.isLoading(),
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward(),
      }
    } catch (error) {
      return {
        ...tab,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }
    }
  }

  /**
   * Get tabs for an agent
   */
  public getTabsForAgent(agentId: string): TabBrowserViewInfo[] {
    const result: TabBrowserViewInfo[] = []
    for (const [_, tabInfo] of this.tabs) {
      if (tabInfo.agentId === agentId) {
        result.push(tabInfo)
      }
    }
    return result
  }

  /**
   * Load tabs for an agent (when switching agents)
   */
  public async loadAgentTabs(agentId: string): Promise<Tab[]> {
    // Hide all current tabs
    for (const [_, tabInfo] of this.tabs) {
      this.hideTab(tabInfo.tabId)
    }

    // Get tabs from database
    let tabs = tabQueries.getByAgent(agentId)

    // Clean up any tabs with invalid documentId references
    tabs = tabs.map((tab) => {
      if (tab.documentId) {
        // Verify document exists
        const doc = documentQueries.getById(tab.documentId)
        if (!doc) {
          // Document doesn't exist, convert to browser tab
          console.warn(`Tab ${tab.id} references non-existent document ${tab.documentId}, converting to browser tab`)
          tabQueries.update(tab.id, {
            type: 'browser',
            documentId: undefined,
            url: DEFAULT_BROWSER_URL,
          })
          return {
            ...tab,
            type: 'browser' as const,
            documentId: undefined,
            url: DEFAULT_BROWSER_URL,
          }
        }
      }
      return tab
    })

    // If no tabs exist for this agent, create a default one
    if (tabs.length === 0) {
      try {
        const defaultTab = this.createTab(agentId, DEFAULT_BROWSER_URL, true)
        tabs = [defaultTab]
      } catch (error) {
        console.error(`Failed to create default tab for agent ${agentId}:`, error)
        // Return empty array if we can't create a tab (agent might not exist)
        return []
      }
    } else {
      // Load BrowserViews for browser tabs that don't have one
      for (const tab of tabs) {
        if (tab.type === 'browser' && !this.tabs.has(tab.id)) {
          const browserView = this.createBrowserView(tab.id, agentId)
          this.tabs.set(tab.id, {
            tabId: tab.id,
            agentId,
            browserView,
            isActive: false,
          })
          // Load the URL
          this.navigateTab(tab.id, tab.url)
        }
        // Document tabs don't need BrowserView - renderer will handle them
      }

      // Switch to active tab
      const activeTab = tabs.find((t) => t.isActive) || tabs[0]
      this.switchToTab(activeTab.id)
    }

    this.currentAgentId = agentId
    return tabs
  }

  /**
   * Get active tab
   */
  public getActiveTab(): TabBrowserViewInfo | null {
    if (!this.activeTabId) return null
    return this.tabs.get(this.activeTabId) || null
  }

  /**
   * Get active tab's BrowserView
   */
  public getActiveBrowserView(): BrowserView | null {
    const activeTab = this.getActiveTab()
    return activeTab?.browserView || null
  }

  /**
   * Execute CDP command on a tab
   */
  public async executeCDPCommand(method: string, params?: any, tabId?: string): Promise<any> {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) {
      throw new Error('No active tab')
    }

    const tabInfo = this.tabs.get(targetTabId)
    if (!tabInfo) {
      throw new Error(`Tab ${targetTabId} not found`)
    }

    const cdpDebugger = tabInfo.browserView.webContents.debugger

    if (!cdpDebugger.isAttached()) {
      this.attachCDPDebugger(tabInfo.browserView, targetTabId)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return await cdpDebugger.sendCommand(method, params)
  }

  /**
   * Check if CDP is attached to a tab
   */
  public isCDPAttached(tabId?: string): boolean {
    const targetTabId = tabId || this.activeTabId
    if (!targetTabId) return false

    const tabInfo = this.tabs.get(targetTabId)
    if (!tabInfo) return false

    return tabInfo.browserView.webContents.debugger.isAttached()
  }

  /**
   * Update bounds for the active tab
   */
  private updateActiveBounds(): void {
    if (!this.activeTabId || !this.window) return

    const tabInfo = this.tabs.get(this.activeTabId)
    if (!tabInfo) return

    const [contentWidth, contentHeight] = this.window.getContentSize()

    if (contentWidth <= 0 || contentHeight <= 0) {
      return
    }

    const availableWidth = contentWidth - this.config.sidebarWidth
    const chatPanelWidth = Math.floor(availableWidth * this.config.splitRatio)
    const browserPanelWidth = availableWidth - chatPanelWidth
    const browserPanelX = this.config.sidebarWidth + chatPanelWidth

    const bounds = {
      x: Math.max(browserPanelX, this.config.sidebarWidth),
      y: this.config.headerHeight,
      width: Math.max(browserPanelWidth, 100),
      height: Math.max(contentHeight - this.config.headerHeight, 100),
    }

    tabInfo.browserView.setBounds(bounds)
    tabInfo.browserView.setAutoResize({
      width: false,
      height: true,
      horizontal: false,
      vertical: true,
    })
  }

  /**
   * Update bounds for all tabs
   */
  public updateAllBounds(): void {
    // Only update bounds for active tab (others are off-screen)
    this.updateActiveBounds()
  }

  /**
   * Update config
   */
  public setConfig(config: Partial<TabManagerConfig>): void {
    this.config = { ...this.config, ...config }
    this.updateAllBounds()
  }

  /**
   * List all tabs for current agent
   */
  public listTabs(): Tab[] {
    if (!this.currentAgentId) return []
    return tabQueries.getByAgent(this.currentAgentId)
  }

  /**
   * Destroy all tabs and cleanup
   */
  public destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    for (const [_, tabInfo] of this.tabs) {
      if (this.window) {
        this.window.removeBrowserView(tabInfo.browserView)
      }
    }

    this.tabs.clear()
    this.activeTabId = null
    this.currentAgentId = null
  }
}

// Singleton instance
let tabManager: TabManager | null = null

// Layout constants
const SIDEBAR_WIDTH = 240
const TITLE_BAR_HEIGHT = 32
const BROWSER_TAB_BAR_HEIGHT = 44
const URL_BAR_HEIGHT = 50
const TOTAL_HEADER_HEIGHT = TITLE_BAR_HEIGHT + BROWSER_TAB_BAR_HEIGHT + URL_BAR_HEIGHT + 1

export function initTabManager(window: BrowserWindow): TabManager {
  if (!tabManager) {
    tabManager = new TabManager(window, {
      sidebarWidth: SIDEBAR_WIDTH,
      headerHeight: TOTAL_HEADER_HEIGHT,
      splitRatio: 0.5,
    })
  }
  return tabManager
}

export function getTabManager(): TabManager | null {
  return tabManager
}

export function destroyTabManager(): void {
  if (tabManager) {
    tabManager.destroy()
    tabManager = null
  }
}

export { TabManager }
