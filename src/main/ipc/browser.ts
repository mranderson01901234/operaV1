import { ipcMain } from 'electron'
import {
  navigateToUrl,
  goBack,
  goForward,
  refresh,
  getBrowserState,
  getBrowserView,
  executeCDPCommand,
  isCDPAttached,
} from '../browser/controller'
import { captureScreenshot, captureElementScreenshot } from '../browser/screenshot'
import type { ScreenshotOptions } from '../browser/screenshot'
import { formatAccessibilityTree } from '../browser/a11y-extractor'
import { getAccessibilityTreeCached, invalidateA11yCache } from '../browser/a11y-cache'
import { executeBrowserTool, executeBrowserTools, getBrowserContext } from '../browser/tool-executor'
import type { A11yNode, ToolCall } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

/**
 * Registers all browser-related IPC handlers
 * All handlers now support optional tabId parameter for tab-aware operations
 */
export function registerBrowserHandlers(): void {
  // Navigate to URL (supports optional tabId)
  ipcMain.handle(IPC_CHANNELS.BROWSER_NAVIGATE, (_event, url: string, tabId?: string) => {
    try {
      navigateToUrl(url, tabId)
      invalidateA11yCache() // Page will change, invalidate cache
      return { success: true }
    } catch (error) {
      console.error('Error navigating:', error)
      return { success: false, error: String(error) }
    }
  })

  // Go back (supports optional tabId)
  ipcMain.handle(IPC_CHANNELS.BROWSER_GO_BACK, (_event, tabId?: string) => {
    try {
      goBack(tabId)
      return { success: true }
    } catch (error) {
      console.error('Error going back:', error)
      return { success: false, error: String(error) }
    }
  })

  // Go forward (supports optional tabId)
  ipcMain.handle(IPC_CHANNELS.BROWSER_GO_FORWARD, (_event, tabId?: string) => {
    try {
      goForward(tabId)
      return { success: true }
    } catch (error) {
      console.error('Error going forward:', error)
      return { success: false, error: String(error) }
    }
  })

  // Refresh (supports optional tabId)
  ipcMain.handle(IPC_CHANNELS.BROWSER_REFRESH, (_event, tabId?: string) => {
    try {
      refresh(tabId)
      return { success: true }
    } catch (error) {
      console.error('Error refreshing:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get browser state (supports optional tabId)
  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_STATE, (_event, tabId?: string) => {
    try {
      return { success: true, state: getBrowserState(tabId) }
    } catch (error) {
      console.error('Error getting browser state:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get browser context (for LLM integration)
  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_CONTEXT, async (_event, includeScreenshot: boolean = false) => {
    try {
      const state = getBrowserState()
      
      // Only capture screenshot if explicitly requested (cost optimization)
      // Screenshots cost ~1500-2500 tokens, so we avoid capturing unless needed
      let screenshot: string | null = null
      if (includeScreenshot) {
        try {
          screenshot = await captureScreenshot({ fullPage: false, format: 'png' })
        } catch (error) {
          console.warn('Failed to capture screenshot for context:', error)
          // Continue without screenshot
        }
      }
      
      // Extract accessibility tree for LLM context (with caching)
      let accessibilityTree: A11yNode[] = []
      try {
        accessibilityTree = await getAccessibilityTreeCached()
      } catch (error) {
        console.warn('Failed to extract accessibility tree for context:', error)
        // Continue without accessibility tree
      }
      
      return {
        success: true,
        context: {
          url: state.url,
          title: state.title,
          isLoading: state.isLoading,
          screenshot,
          accessibilityTree,
        },
      }
    } catch (error) {
      console.error('Error getting browser context:', error)
      return { success: false, error: String(error) }
    }
  })

  // Capture screenshot
  ipcMain.handle(IPC_CHANNELS.BROWSER_CAPTURE_SCREENSHOT, async (_event, options?: ScreenshotOptions) => {
    try {
      const screenshot = await captureScreenshot(options || {})
      return { success: true, screenshot }
    } catch (error) {
      console.error('Error capturing screenshot:', error)
      return { success: false, error: String(error) }
    }
  })

  // Test CDP connection
  ipcMain.handle(IPC_CHANNELS.BROWSER_TEST_CDP, async () => {
    try {
      const attached = isCDPAttached()
      if (!attached) {
        return { success: false, error: 'CDP debugger not attached' }
      }

      // Test CDP by getting the document
      const result = await executeCDPCommand('DOM.getDocument')
      return {
        success: true,
        attached,
        testResult: result ? 'CDP working correctly' : 'CDP test failed',
      }
    } catch (error) {
      console.error('CDP test failed:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get accessibility tree (with caching)
  ipcMain.handle(IPC_CHANNELS.BROWSER_GET_ACCESSIBILITY_TREE, async () => {
    try {
      const tree = await getAccessibilityTreeCached()
      return { success: true, tree }
    } catch (error) {
      console.error('Error getting accessibility tree:', error)
      return { success: false, error: String(error) }
    }
  })

  // Execute a single browser tool
  ipcMain.handle(IPC_CHANNELS.BROWSER_EXECUTE_TOOL, async (_event, toolCall: ToolCall) => {
    try {
      console.log('Executing browser tool:', toolCall.name, toolCall.arguments)
      const result = await executeBrowserTool(toolCall)
      console.log('Tool execution result:', result)
      return { ...result, success: result.success }
    } catch (error) {
      console.error('Error executing browser tool:', error)
      return { success: false, error: String(error) }
    }
  })

  // Execute multiple browser tools in sequence
  ipcMain.handle(IPC_CHANNELS.BROWSER_EXECUTE_TOOLS, async (_event, toolCalls: ToolCall[]) => {
    try {
      console.log('Executing browser tools:', toolCalls.map(t => t.name))
      const results = await executeBrowserTools(toolCalls)
      console.log('Tools execution results:', results)
      return { success: true, results }
    } catch (error) {
      console.error('Error executing browser tools:', error)
      return { success: false, error: String(error) }
    }
  })
}

