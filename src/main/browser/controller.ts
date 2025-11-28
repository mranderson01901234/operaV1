import { BrowserView, BrowserWindow } from 'electron'
import { DEFAULT_BROWSER_URL } from '../../shared/constants'

interface BrowserControllerConfig {
  sidebarWidth: number
  headerHeight: number      // URL bar height within browser panel
  splitRatio: number        // 0.5 for 50/50
}

class BrowserController {
  private browserView: BrowserView | null = null
  private window: BrowserWindow | null = null
  private config: BrowserControllerConfig
  private devToolsOpen: boolean = false
  private devToolsMode: 'bottom' | 'right' | 'detach' = 'bottom'
  private devToolsSizeRatio: number = 0.3 // DevTools takes 30% when docked

  constructor(window: BrowserWindow, config: BrowserControllerConfig) {
    this.window = window
    this.config = config
    this.browserView = this.createBrowserView()
    this.setupEventListeners()
    this.updateBounds()
  }

  private createBrowserView(): BrowserView {
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      }
    })
    
    // Set background color to match the app theme
    view.setBackgroundColor('#1a1a1a')
    
    if (this.window) {
      this.window.addBrowserView(view)
      // Set initial bounds immediately to prevent covering the entire window
      // CRITICAL: BrowserView must be positioned correctly or it will cover React UI
      this.updateBounds()
    }
    
    // Set up event listeners for BrowserView
    this.setupBrowserViewListeners(view)
    
    // Attach CDP debugger
    this.attachCDPDebugger(view)
    
    // Load default landing page
    setTimeout(() => {
      if (view) {
        this.navigateToUrl(DEFAULT_BROWSER_URL)
      }
    }, 300)
    
    return view
  }

  private debounceTimer: NodeJS.Timeout | null = null

  /**
   * Debounced bounds update - only fires 100ms after last call
   * This eliminates the need for continuous polling
   */
  private debouncedBoundsUpdate = (): void => {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    
    this.debounceTimer = setTimeout(() => {
      if (this.window && this.browserView) {
        this.updateBounds()
      }
      this.debounceTimer = null
    }, 100) // Debounce to 100ms
  }

  private setupEventListeners(): void {
    if (!this.window) return

    // Window resize - use debounced update
    this.window.on('resize', () => this.debouncedBoundsUpdate())
    
    // DevTools state changes - use single debounced update instead of multiple timeouts
    this.window.webContents.on('devtools-opened', () => {
      this.devToolsOpen = true
      this.debouncedBoundsUpdate()
    })

    this.window.webContents.on('devtools-closed', () => {
      this.devToolsOpen = false
      this.debouncedBoundsUpdate()
    })

    // Track content bounds changes
    this.window.on('moved', () => this.debouncedBoundsUpdate())
    
    // Maximize/restore - use debounced update
    this.window.on('maximize', () => this.debouncedBoundsUpdate())
    this.window.on('unmaximize', () => this.debouncedBoundsUpdate())
    
    // REMOVED: setInterval polling (was checking every 50ms even when idle)
    // Event-driven updates are sufficient and much more efficient
  }

  private setupBrowserViewListeners(view: BrowserView): void {
    if (!this.window) return

    const webContents = view.webContents

    // Crash detection - critical for handling BrowserView crashes
    webContents.on('render-process-gone', (_event, details) => {
      console.error('[BrowserController] Render process crashed:', details)
      this.handleBrowserViewCrash()
    })

    webContents.on('unresponsive', () => {
      console.warn('[BrowserController] BrowserView became unresponsive')
    })

    webContents.on('responsive', () => {
      console.log('[BrowserController] BrowserView became responsive again')
    })

    // Suppress harmless service worker storage errors
    webContents.on('console-message', (event, level, message) => {
      // Filter out service worker storage database errors (harmless Chromium warnings)
      if (message.includes('service_worker_storage') || 
          message.includes('Failed to delete the database')) {
        return // Suppress this message
      }
      // Allow other console messages through
    })

    // Navigation events
    webContents.on('did-start-loading', () => {
      this.window?.webContents.send('browser:loading', true)
    })

    webContents.on('did-stop-loading', () => {
      this.window?.webContents.send('browser:loading', false)
    })

    webContents.on('did-navigate', (_event, url) => {
      this.window?.webContents.send('browser:navigated', url)
    })

    webContents.on('did-navigate-in-page', (_event, url) => {
      this.window?.webContents.send('browser:navigated', url)
    })

    webContents.on('page-title-updated', (_event, title) => {
      this.window?.webContents.send('browser:title-updated', title)
    })

    // Update navigation state
    webContents.on('did-finish-load', () => {
      const canGoBack = webContents.canGoBack()
      const canGoForward = webContents.canGoForward()
      this.window?.webContents.send('browser:navigation-state', {
        canGoBack,
        canGoForward,
      })
    })
  }

  /**
   * Handle BrowserView crash by recreating it
   */
  private handleBrowserViewCrash(): void {
    console.log('[BrowserController] Attempting to recover from BrowserView crash...')
    
    if (!this.window) return

    try {
      // Destroy the crashed BrowserView
      if (this.browserView) {
        try {
          if (this.window) {
            this.window.removeBrowserView(this.browserView)
          }
        } catch (error) {
          console.warn('[BrowserController] Error removing crashed BrowserView:', error)
        }
        this.browserView = null
      }

      // Recreate BrowserView
      this.browserView = this.createBrowserView()
      this.updateBounds()
      
      console.log('[BrowserController] BrowserView recovered successfully')
      this.window.webContents.send('browser:recovered')
    } catch (error) {
      console.error('[BrowserController] Failed to recover BrowserView:', error)
    }
  }

  /**
   * Check if BrowserView and webContents are valid
   */
  private isValidBrowserView(): boolean {
    if (!this.browserView) return false
    
    try {
      const webContents = this.browserView.webContents
      if (!webContents || webContents.isDestroyed()) {
        return false
      }
      return true
    } catch (error) {
      return false
    }
  }

  private attachCDPDebugger(view: BrowserView): void {
    const cdpDebugger = view.webContents.debugger

    try {
      if (cdpDebugger.isAttached()) {
        return
      }

      cdpDebugger.attach('1.3')
      console.log('CDP debugger attached successfully')

      cdpDebugger.on('detach', (_event, reason: string) => {
        console.warn('CDP debugger detached:', reason)
        setTimeout(() => {
          if (view && !cdpDebugger.isAttached()) {
            try {
              cdpDebugger.attach('1.3')
              console.log('CDP debugger reattached')
            } catch (error) {
              console.error('Failed to reattach CDP debugger:', error)
            }
          }
        }, 1000)
      })

      cdpDebugger.on('message', (_event, method: string, params: any) => {
        if (method === 'Runtime.exceptionThrown') {
          console.error('CDP Runtime exception:', params)
        }
      })
    } catch (error) {
      console.error('Failed to attach CDP debugger:', error)
    }
  }

  public updateBounds(): void {
    if (!this.browserView || !this.window) return

    // Get window and content dimensions
    const [contentWidth, contentHeight] = this.window.getContentSize()
    
    // Ensure we have valid dimensions
    if (contentWidth <= 0 || contentHeight <= 0) {
      console.warn('Invalid content size, skipping bounds update:', { contentWidth, contentHeight })
      return
    }
    
    // Calculate browser panel position
    const availableWidth = contentWidth - this.config.sidebarWidth
    const chatPanelWidth = Math.floor(availableWidth * this.config.splitRatio)
    const browserPanelWidth = availableWidth - chatPanelWidth
    const browserPanelX = this.config.sidebarWidth + chatPanelWidth
    
    // Calculate BrowserView height
    // Since DevTools always opens detached, it doesn't affect content size
    // getContentSize() returns the full content area height
    const browserViewHeight = Math.max(100, contentHeight - this.config.headerHeight)
    const browserViewWidth = browserPanelWidth
    const browserViewY = this.config.headerHeight

    // Ensure BrowserView is positioned correctly - it should NOT start at x=0
    // BrowserView must start AFTER the sidebar and chat panel
    const bounds = {
      x: browserPanelX, // This should be sidebarWidth + chatPanelWidth
      y: browserViewY,  // This should be headerHeight
      width: Math.max(browserViewWidth, 100),  // Minimum width
      height: Math.max(browserViewHeight, 100) // Minimum height
    }

    // CRITICAL SAFETY CHECK: BrowserView should NEVER start at x=0 or y=0
    // If it does, it will cover the entire React UI (sidebar, chat, titlebar)
    if (bounds.x < this.config.sidebarWidth) {
      console.error('❌ BrowserView bounds CRITICAL ERROR: x position would cover sidebar and React UI!', {
        calculatedX: browserPanelX,
        sidebarWidth: this.config.sidebarWidth,
        chatPanelWidth,
        contentWidth,
        bounds
      })
      // Force correct position - BrowserView MUST start after sidebar + chat panel
      bounds.x = this.config.sidebarWidth + chatPanelWidth
    }
    
    if (bounds.y < this.config.headerHeight) {
      console.error('❌ BrowserView bounds CRITICAL ERROR: y position would cover titlebar!', {
        calculatedY: browserViewY,
        headerHeight: this.config.headerHeight,
        bounds
      })
      bounds.y = this.config.headerHeight
    }

    // Log final bounds for debugging
    console.log('✅ BrowserView final bounds:', bounds, {
      shouldNotCoverSidebar: bounds.x >= this.config.sidebarWidth,
      shouldNotCoverTitlebar: bounds.y >= this.config.headerHeight,
    })

    this.browserView.setBounds(bounds)

    // Enable auto-resize for height to handle dynamic changes
    this.browserView.setAutoResize({
      width: false,
      height: true,
      horizontal: false,
      vertical: true,
    })

    // Debug logging - always log in dev mode to help debug layout issues
    if (process.env.NODE_ENV === 'development') {
      const windowBounds = this.window.getBounds()
      const isDevToolsOpen = this.window.webContents.isDevToolsOpened()
      console.log('BrowserView bounds update:', {
        windowBounds: { width: windowBounds.width, height: windowBounds.height },
        contentSize: { width: contentWidth, height: contentHeight },
        devToolsOpen: isDevToolsOpen,
        devToolsMode: this.devToolsMode,
        config: {
          sidebarWidth: this.config.sidebarWidth,
          headerHeight: this.config.headerHeight,
          splitRatio: this.config.splitRatio,
        },
        calculations: {
          availableWidth,
          chatPanelWidth,
          browserPanelWidth,
          browserPanelX,
        },
        finalBounds: bounds,
      })
    }
  }

  // Method to open DevTools with tracking
  public openDevTools(mode: 'bottom' | 'right' | 'detach' = 'detach'): void {
    if (!this.browserView) return
    this.devToolsMode = mode
    this.browserView.webContents.openDevTools({ mode })
  }

  public closeDevTools(): void {
    if (!this.browserView) return
    this.browserView.webContents.closeDevTools()
  }

  public toggleDevTools(mode: 'bottom' | 'right' | 'detach' = 'detach'): void {
    if (!this.browserView) return
    if (this.browserView.webContents.isDevToolsOpened()) {
      this.closeDevTools()
    } else {
      this.openDevTools(mode)
    }
  }

  // Call this when layout config changes (e.g., sidebar collapse)
  public setConfig(config: Partial<BrowserControllerConfig>): void {
    this.config = { ...this.config, ...config }
    this.updateBounds()
  }

  // Navigation methods
  public navigateToUrl(url: string): void {
    if (!this.isValidBrowserView()) {
      console.warn('[BrowserController] Cannot navigate: BrowserView is not valid')
      if (this.browserView) {
        this.handleBrowserViewCrash()
      }
      return
    }

    try {
      let normalizedUrl = url.trim()
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl
      }

      this.browserView!.webContents.loadURL(normalizedUrl)
    } catch (error) {
      console.error('[BrowserController] Navigation failed:', error)
      this.handleBrowserViewCrash()
    }
  }

  public goBack(): void {
    if (!this.isValidBrowserView()) {
      console.warn('[BrowserController] Cannot go back: BrowserView is not valid')
      if (this.browserView) {
        this.handleBrowserViewCrash()
      }
      return
    }

    try {
      if (this.browserView!.webContents.canGoBack()) {
        this.browserView!.webContents.goBack()
      }
    } catch (error) {
      console.error('[BrowserController] Go back failed:', error)
      this.handleBrowserViewCrash()
    }
  }

  public goForward(): void {
    if (!this.isValidBrowserView()) {
      console.warn('[BrowserController] Cannot go forward: BrowserView is not valid')
      if (this.browserView) {
        this.handleBrowserViewCrash()
      }
      return
    }

    try {
      if (this.browserView!.webContents.canGoForward()) {
        this.browserView!.webContents.goForward()
      }
    } catch (error) {
      console.error('[BrowserController] Go forward failed:', error)
      this.handleBrowserViewCrash()
    }
  }

  public refresh(): void {
    if (!this.isValidBrowserView()) {
      console.warn('[BrowserController] Cannot refresh: BrowserView is not valid')
      // Attempt recovery if BrowserView exists but is invalid
      if (this.browserView) {
        this.handleBrowserViewCrash()
      }
      return
    }

    try {
      this.browserView!.webContents.reload()
    } catch (error) {
      console.error('[BrowserController] Refresh failed:', error)
      // Attempt recovery on error
      this.handleBrowserViewCrash()
    }
  }

  public getBrowserState(): {
    url: string
    title: string
    isLoading: boolean
    canGoBack: boolean
    canGoForward: boolean
  } {
    if (!this.isValidBrowserView()) {
      return {
        url: '',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }
    }

    try {
      const webContents = this.browserView!.webContents
      return {
        url: webContents.getURL(),
        title: webContents.getTitle(),
        isLoading: webContents.isLoading(),
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward(),
      }
    } catch (error) {
      console.error('[BrowserController] Error getting browser state:', error)
      return {
        url: '',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      }
    }
  }

  public async executeCDPCommand(method: string, params?: any): Promise<any> {
    if (!this.isValidBrowserView()) {
      throw new Error('BrowserView not initialized or crashed')
    }

    try {
      const cdpDebugger = this.browserView!.webContents.debugger

      if (!cdpDebugger.isAttached()) {
        this.attachCDPDebugger(this.browserView!)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return await cdpDebugger.sendCommand(method, params)
    } catch (error: any) {
      // Check if error is due to target crash
      if (error?.message?.includes('Target crashed') || 
          error?.message?.includes('target closed') ||
          error?.code === 'ECONNRESET') {
        console.error(`[BrowserController] CDP command failed due to crash: ${method}`, error)
        this.handleBrowserViewCrash()
        throw new Error(`BrowserView crashed during CDP command: ${method}`)
      }
      console.error(`[BrowserController] CDP command failed: ${method}`, error)
      throw error
    }
  }

  public isCDPAttached(): boolean {
    if (!this.browserView) return false
    return this.browserView.webContents.debugger.isAttached()
  }

  // Getter for external access
  public get webContents() {
    return this.browserView?.webContents || null
  }

  public get view() {
    return this.browserView
  }

  public destroy(): void {
    // Cancel any pending debounced updates
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    
    if (this.browserView && this.window) {
      this.window.removeBrowserView(this.browserView)
      this.browserView = null
    }
  }
}

// Singleton instance (deprecated - use TabManager instead)
let browserController: BrowserController | null = null

// Constants for layout calculation
const SIDEBAR_WIDTH = 240
const TITLE_BAR_HEIGHT = 32 // h-8 = 32px (TitleBar component)
const BROWSER_TAB_BAR_HEIGHT = 44 // Tab bar: py-2 (16px padding) + content height (~28px) = ~44px
const URL_BAR_HEIGHT = 50 // URL bar: py-2 (16px padding) + input field (~34px with py-1.5) = ~50px
const TOTAL_HEADER_HEIGHT = TITLE_BAR_HEIGHT + BROWSER_TAB_BAR_HEIGHT + URL_BAR_HEIGHT + 1 // +1 for border

// Import TabManager for delegation
import { getTabManager } from './tab-manager'

// Legacy exports for backward compatibility - now delegate to TabManager
export function createBrowserView(window: BrowserWindow): BrowserView | null {
  // For backward compatibility, create a controller if TabManager is not initialized
  const tabManager = getTabManager()
  if (tabManager) {
    return tabManager.getActiveBrowserView()
  }

  if (!browserController) {
    browserController = new BrowserController(window, {
      sidebarWidth: SIDEBAR_WIDTH,
      headerHeight: TOTAL_HEADER_HEIGHT,
      splitRatio: 0.5,
    })
  }
  return browserController.view
}

export function updateBrowserViewBounds(_window: BrowserWindow): void {
  const tabManager = getTabManager()
  if (tabManager) {
    tabManager.updateAllBounds()
    return
  }

  if (browserController) {
    browserController.updateBounds()
  }
}

export function destroyBrowserView(): void {
  if (browserController) {
    browserController.destroy()
    browserController = null
  }
}

export function getBrowserView(): BrowserView | null {
  const tabManager = getTabManager()
  if (tabManager) {
    return tabManager.getActiveBrowserView()
  }
  return browserController?.view || null
}

export function navigateToUrl(url: string, tabId?: string): void {
  const tabManager = getTabManager()
  if (tabManager) {
    if (tabId) {
      tabManager.navigateTab(tabId, url)
    } else {
      const activeTab = tabManager.getActiveTab()
      if (activeTab) {
        tabManager.navigateTab(activeTab.tabId, url)
      }
    }
    return
  }
  browserController?.navigateToUrl(url)
}

export function goBack(tabId?: string): void {
  const tabManager = getTabManager()
  if (tabManager) {
    tabManager.goBack(tabId)
    return
  }
  browserController?.goBack()
}

export function goForward(tabId?: string): void {
  const tabManager = getTabManager()
  if (tabManager) {
    tabManager.goForward(tabId)
    return
  }
  browserController?.goForward()
}

export function refresh(tabId?: string): void {
  const tabManager = getTabManager()
  if (tabManager) {
    tabManager.refresh(tabId)
    return
  }
  browserController?.refresh()
}

export function getBrowserState(tabId?: string): {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
} {
  const tabManager = getTabManager()
  if (tabManager) {
    const tabState = tabManager.getTabState(tabId)
    if (tabState) {
      return {
        url: tabState.url,
        title: tabState.title,
        isLoading: tabState.isLoading,
        canGoBack: tabState.canGoBack,
        canGoForward: tabState.canGoForward,
      }
    }
  }

  return browserController?.getBrowserState() || {
    url: '',
    title: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  }
}

export function executeCDPCommand(method: string, params?: any, tabId?: string): Promise<any> {
  const tabManager = getTabManager()
  if (tabManager) {
    return tabManager.executeCDPCommand(method, params, tabId)
  }

  if (!browserController) {
    throw new Error('BrowserController not initialized')
  }
  return browserController.executeCDPCommand(method, params)
}

export function isCDPAttached(tabId?: string): boolean {
  const tabManager = getTabManager()
  if (tabManager) {
    return tabManager.isCDPAttached(tabId)
  }
  return browserController?.isCDPAttached() || false
}

// Export the controller class for advanced usage
export { BrowserController }
