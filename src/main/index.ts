import { app, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerAllHandlers } from './ipc/handlers'
import { registerLLMHandlers } from './ipc/llm'
import { registerBrowserHandlers } from './ipc/browser'
import { registerLocalModelHandlers } from './ipc/local-model'
import { registerResearchHandlers } from './ipc/research'
import { registerDocumentToolHandlers } from './ipc/document-tools'
import { registerSpotifyHandlers, handleAuthCallback as handleSpotifyCallback } from './ipc/spotify'
import { getDatabase } from './db/schema'
import { updateBrowserViewBounds, destroyBrowserView, getBrowserView } from './browser/controller'
import { initTabManager, getTabManager, destroyTabManager } from './browser/tab-manager'

// Register custom protocol for OAuth callbacks
const PROTOCOL_NAME = 'operastudio'

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME)
}

// Handle custom protocol URLs (operastudio://)
// This handles OAuth callbacks from Spotify
let pendingProtocolUrl: string | null = null

const handleProtocolUrl = async (url: string) => {
  console.log('Received protocol URL:', url)

  // Handle Spotify OAuth callback
  if (url.includes('spotify/callback')) {
    const result = await handleSpotifyCallback(url)
    if (mainWindow) {
      // Notify renderer of auth result
      mainWindow.webContents.send('spotify:authCallback', result)
      // Bring window to front
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  }
}

// Windows/Linux: Single instance lock and protocol handling
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', (_event, commandLine) => {
  // Find the URL in command line args
  const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`))
  if (url) {
    handleProtocolUrl(url)
  }

  // Focus window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// macOS: Handle protocol via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault()
  // If app isn't ready yet, store the URL for later
  if (!mainWindow) {
    pendingProtocolUrl = url
  } else {
    handleProtocolUrl(url)
  }
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

// Filter out harmless Chromium warnings that clutter the console
const originalConsoleError = console.error
console.error = (...args: any[]) => {
  const message = args.join(' ')
  // Filter out known harmless Chromium warnings
  if (
    message.includes('SharedImageManager::ProduceSkia') ||
    message.includes('Trying to Produce a Skia representation from a non-existent mailbox')
  ) {
    // Suppress these harmless graphics warnings
    return
  }
  // Log all other errors normally
  originalConsoleError.apply(console, args)
}

let mainWindow: BrowserWindow | null = null

// Enable Widevine CDM for Spotify playback
// This allows DRM-protected content to play
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')

function createWindow() {
  // Determine preload path - electron-vite outputs .mjs in dev mode
  const preloadPath = isDev
    ? path.join(__dirname, '../preload/index.mjs')
    : path.join(__dirname, '../preload/index.js')

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Disable sandbox for development
      plugins: true, // Enable plugins for Widevine
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // DevTools can be opened manually with F12 or Cmd+Option+I
    // Auto-opening disabled for better UX
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // IPC handlers for window controls
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  // Initialize TabManager AFTER React UI has fully loaded and rendered
  // BrowserViews are native overlays - if created too early, they cover everything
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow) {
      // Wait longer for React to fully mount and render
      setTimeout(() => {
        if (mainWindow) {
          console.log('Initializing TabManager after React UI is ready...')
          initTabManager(mainWindow)
          // Force multiple bounds updates to ensure correct positioning
          setTimeout(() => {
            if (mainWindow) {
              updateBrowserViewBounds(mainWindow)
            }
          }, 100)
          setTimeout(() => {
            if (mainWindow) {
              updateBrowserViewBounds(mainWindow)
            }
          }, 300)
        }
      }, 1000) // Wait 1 second for React to fully render
    }
  })

  // Also handle ready-to-show event
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      setTimeout(() => {
        if (mainWindow && !getTabManager()) {
          console.log('Initializing TabManager on ready-to-show...')
          initTabManager(mainWindow)
          setTimeout(() => {
            if (mainWindow) {
              updateBrowserViewBounds(mainWindow)
            }
          }, 200)
        }
      }, 1000)
    }
  })

  // BrowserController handles most bounds updates automatically
  // We just need to trigger updates on window events
  mainWindow.on('resize', () => {
    if (mainWindow) {
      updateBrowserViewBounds(mainWindow)
    }
  })
  
  // REMOVED: setInterval polling (was checking every 50ms even when idle)
  // BrowserController now handles bounds updates via event-driven debounced updates
  // This eliminates unnecessary CPU usage when idle
  
  // Handle DevTools open/close
  // Since DevTools opens detached, it doesn't affect BrowserView bounds
  // No need to update bounds when DevTools opens/closes in detached mode
  // The content size doesn't change when DevTools is detached

  // Handle window maximize/restore
  mainWindow.on('maximize', () => {
    if (mainWindow) {
      setTimeout(() => {
        if (mainWindow) {
          updateBrowserViewBounds(mainWindow)
        }
      }, 0)
    }
  })

  mainWindow.on('unmaximize', () => {
    if (mainWindow) {
      setTimeout(() => {
        if (mainWindow) {
          updateBrowserViewBounds(mainWindow)
        }
      }, 0)
    }
  })
  
  // Listen for renderer ready to ensure BrowserView is positioned correctly
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (mainWindow) {
        updateBrowserViewBounds(mainWindow)
      }
    }, 100)
  })
}

app.whenReady().then(() => {
  // Initialize database
  getDatabase()
  
  // Register IPC handlers
  registerAllHandlers()
  registerLLMHandlers()
  registerBrowserHandlers()
  registerLocalModelHandlers()
  registerResearchHandlers()
  registerDocumentToolHandlers()
  registerSpotifyHandlers()
  
  // Register global keyboard shortcuts
  // F12 to toggle DevTools - always open in detached mode
  // Detached mode prevents divider lines and bounds issues
  globalShortcut.register('F12', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        // Always open in detached mode - no divider, no bounds issues
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })
  
  // Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) to toggle DevTools
  if (process.platform === 'darwin') {
    globalShortcut.register('Command+Option+I', () => {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools()
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' })
        }
      }
    })
  } else {
    globalShortcut.register('Control+Shift+I', () => {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools()
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' })
        }
      }
    })
  }
  
  createWindow()

  // Handle any pending protocol URL (macOS: app launched via protocol)
  if (pendingProtocolUrl) {
    handleProtocolUrl(pendingProtocolUrl)
    pendingProtocolUrl = null
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      // Ensure TabManager is initialized if window already exists
      mainWindow.show()
      setTimeout(() => {
        if (mainWindow && !getTabManager()) {
          initTabManager(mainWindow)
        }
      }, 100)
    }
  })
})

app.on('window-all-closed', () => {
  // Cleanup TabManager and BrowserViews
  destroyTabManager()
  destroyBrowserView()

  // Unregister all global shortcuts
  globalShortcut.unregisterAll()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Unregister all global shortcuts before quitting
  globalShortcut.unregisterAll()
})

