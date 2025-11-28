import { shell, safeStorage, app } from 'electron'
import crypto from 'crypto'
import http from 'http'

// Spotify OAuth Configuration
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'

// Use localhost for development (works on all platforms without setup)
// For production, you'd use the custom protocol
const CALLBACK_PORT = 8888
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`

// Callback server instance
let callbackServer: http.Server | null = null
let authResolve: ((result: { success: boolean; error?: string }) => void) | null = null

// Scopes for full Spotify access
const SCOPES = [
  // Playback
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  // Library
  'user-library-read',
  'user-library-modify',
  // Playlists
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  // User
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  // Follow
  'user-follow-read',
  'user-follow-modify',
].join(' ')

// Store for PKCE code verifier (needed to complete auth flow)
let codeVerifier: string | null = null

// Token storage
interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

// In-memory cache (loaded from persistent storage on startup)
let tokens: SpotifyTokens | null = null
let clientId: string | null = null

// Persistent storage using electron-store
let store: any = null
let storePromise: Promise<any> | null = null

async function getStore() {
  if (store) {
    return store
  }

  if (!storePromise) {
    storePromise = (async () => {
      try {
        const Store = (await import('electron-store')).default
        store = new Store({
          name: 'spotify-auth',
          encryptionKey: 'spotify-auth-encryption-key',
          cwd: app.getPath('userData'),
        })
        return store
      } catch (error) {
        console.error('Failed to initialize electron-store for Spotify:', error)
        // Fallback: in-memory only (tokens won't persist)
        store = {
          _data: {} as Record<string, any>,
          get: (key: string) => store._data[key],
          set: (key: string, value: any) => {
            store._data[key] = value
          },
          delete: (key: string) => {
            delete store._data[key]
          },
        }
        return store
      }
    })()
  }

  return storePromise
}

// Generate cryptographically secure random string
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.randomBytes(length)
  return Array.from(values).map((x) => possible[x % possible.length]).join('')
}

// Generate PKCE code challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return hash.toString('base64url')
}

// Securely store tokens (both in memory and persistent storage)
async function saveTokens(newTokens: SpotifyTokens): Promise<void> {
  tokens = newTokens
  try {
    const storage = await getStore()
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(newTokens))
      storage.set('tokens', encrypted.toString('base64'))
    } else {
      // Fallback: store without OS-level encryption (still encrypted by electron-store)
      storage.set('tokens', JSON.stringify(newTokens))
    }
  } catch (error) {
    console.error('Failed to persist Spotify tokens:', error)
  }
}

// Load stored tokens from persistent storage
async function loadTokens(): Promise<SpotifyTokens | null> {
  // Return cached tokens if available
  if (tokens) {
    return tokens
  }

  try {
    const storage = await getStore()
    const stored = storage.get('tokens') as string | undefined

    if (!stored) {
      return null
    }

    // Try to decrypt if encrypted with safeStorage
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64')
        const decrypted = safeStorage.decryptString(buffer)
        tokens = JSON.parse(decrypted)
        return tokens
      } catch {
        // If decryption fails, might be plain JSON (from fallback)
        tokens = JSON.parse(stored)
        return tokens
      }
    } else {
      // Fallback: parse as plain JSON
      tokens = JSON.parse(stored)
      return tokens
    }
  } catch (error) {
    console.error('Failed to load Spotify tokens:', error)
    return null
  }
}

// Save client ID persistently
async function saveClientId(id: string): Promise<void> {
  clientId = id
  try {
    const storage = await getStore()
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(id)
      storage.set('clientId', encrypted.toString('base64'))
    } else {
      storage.set('clientId', id)
    }
  } catch (error) {
    console.error('Failed to persist Spotify client ID:', error)
  }
}

// Load client ID from persistent storage
async function loadClientId(): Promise<string | null> {
  if (clientId) {
    return clientId
  }

  try {
    const storage = await getStore()
    const stored = storage.get('clientId') as string | undefined

    if (!stored) {
      return null
    }

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64')
        clientId = safeStorage.decryptString(buffer)
        return clientId
      } catch {
        clientId = stored
        return clientId
      }
    } else {
      clientId = stored
      return clientId
    }
  } catch (error) {
    console.error('Failed to load Spotify client ID:', error)
    return null
  }
}

// Set the Spotify Client ID (now persists to storage)
export async function setClientId(id: string): Promise<void> {
  await saveClientId(id)
}

// Get the current Client ID
export async function getClientId(): Promise<string | null> {
  return loadClientId()
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const storedTokens = await loadTokens()
  if (!storedTokens) {
    return false
  }

  // If tokens exist but are expired, try to refresh
  if (storedTokens.expiresAt <= Date.now()) {
    try {
      await refreshAccessToken()
      return tokens !== null
    } catch {
      return false
    }
  }

  return true
}

// Initialize auth module - load persisted credentials on app startup
export async function initializeAuth(): Promise<{ authenticated: boolean; hasClientId: boolean }> {
  const storedClientId = await loadClientId()
  const storedTokens = await loadTokens()

  const hasClientId = storedClientId !== null
  let authenticated = false

  if (storedTokens) {
    // Check if tokens are still valid or can be refreshed
    if (storedTokens.expiresAt > Date.now()) {
      authenticated = true
    } else if (storedTokens.refreshToken && storedClientId) {
      // Try to refresh expired tokens
      try {
        await refreshAccessToken()
        authenticated = tokens !== null
        console.log('Spotify tokens refreshed successfully on startup')
      } catch (error) {
        console.error('Failed to refresh Spotify tokens on startup:', error)
        // Clear invalid tokens
        await clearTokens()
      }
    }
  }

  console.log(`Spotify auth initialized: hasClientId=${hasClientId}, authenticated=${authenticated}`)
  return { authenticated, hasClientId }
}

// Clear tokens from storage (used when refresh fails)
async function clearTokens(): Promise<void> {
  tokens = null
  try {
    const storage = await getStore()
    storage.delete('tokens')
  } catch (error) {
    console.error('Failed to clear Spotify tokens:', error)
  }
}

// Get current access token (refreshing if needed)
export async function getAccessToken(): Promise<string | null> {
  const storedTokens = await loadTokens()

  if (!storedTokens) {
    return null
  }

  // If token expires in less than 5 minutes, refresh it
  if (storedTokens.expiresAt < Date.now() + 5 * 60 * 1000) {
    try {
      await refreshAccessToken()
      return tokens?.accessToken || null
    } catch (error) {
      console.error('Failed to refresh token:', error)
      return null
    }
  }

  return storedTokens.accessToken
}

// Start OAuth flow - opens browser for user to login
export function startAuthFlow(): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    if (!clientId) {
      resolve({ success: false, error: 'Spotify Client ID not configured' })
      return
    }

    // Close any existing callback server
    if (callbackServer) {
      callbackServer.close()
      callbackServer = null
    }

    // Generate PKCE values
    codeVerifier = generateRandomString(64)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(16)

    // Start local callback server
    callbackServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://127.0.0.1:${CALLBACK_PORT}`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        // Send response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' })

        if (error) {
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                <div style="text-align: center;">
                  <h1 style="color: #ff4444;">Authorization Failed</h1>
                  <p>${error}</p>
                  <p style="color: #888;">You can close this window.</p>
                </div>
              </body>
            </html>
          `)

          // Cleanup
          callbackServer?.close()
          callbackServer = null
          codeVerifier = null

          if (authResolve) {
            authResolve({ success: false, error: `Spotify authorization failed: ${error}` })
            authResolve = null
          }
          return
        }

        if (!code) {
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                <div style="text-align: center;">
                  <h1 style="color: #ff4444;">Authorization Failed</h1>
                  <p>No authorization code received</p>
                  <p style="color: #888;">You can close this window.</p>
                </div>
              </body>
            </html>
          `)

          callbackServer?.close()
          callbackServer = null
          codeVerifier = null

          if (authResolve) {
            authResolve({ success: false, error: 'No authorization code received' })
            authResolve = null
          }
          return
        }

        // Exchange code for tokens
        try {
          const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: clientId!,
              grant_type: 'authorization_code',
              code: code,
              redirect_uri: REDIRECT_URI,
              code_verifier: codeVerifier!,
            }),
          })

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json()
            throw new Error(errorData.error_description || errorData.error)
          }

          const data = await tokenResponse.json()

          // Save tokens (persist to disk)
          await saveTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
          })

          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                <div style="text-align: center;">
                  <h1 style="color: #1DB954;">Connected to Spotify!</h1>
                  <p>You can close this window and return to the app.</p>
                </div>
              </body>
            </html>
          `)

          // Cleanup
          callbackServer?.close()
          callbackServer = null
          codeVerifier = null

          if (authResolve) {
            authResolve({ success: true })
            authResolve = null
          }
        } catch (err) {
          res.end(`
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff;">
                <div style="text-align: center;">
                  <h1 style="color: #ff4444;">Authorization Failed</h1>
                  <p>${err}</p>
                  <p style="color: #888;">You can close this window.</p>
                </div>
              </body>
            </html>
          `)

          callbackServer?.close()
          callbackServer = null
          codeVerifier = null

          if (authResolve) {
            authResolve({ success: false, error: `Token exchange failed: ${err}` })
            authResolve = null
          }
        }
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    callbackServer.listen(CALLBACK_PORT, '127.0.0.1', () => {
      console.log(`Spotify auth callback server listening on port ${CALLBACK_PORT}`)
    })

    callbackServer.on('error', (err) => {
      console.error('Callback server error:', err)
      resolve({ success: false, error: `Failed to start callback server: ${err.message}` })
    })

    // Store the resolve function to call when callback is received
    authResolve = resolve

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state: state,
    })

    const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`

    // Open in default browser
    await shell.openExternal(authUrl)

    // Set a timeout to cleanup if user doesn't complete auth
    setTimeout(() => {
      if (callbackServer) {
        callbackServer.close()
        callbackServer = null
        codeVerifier = null
        if (authResolve) {
          authResolve({ success: false, error: 'Authorization timed out' })
          authResolve = null
        }
      }
    }, 5 * 60 * 1000) // 5 minute timeout
  })
}

// Handle the callback from Spotify OAuth
export async function handleAuthCallback(url: string): Promise<{ success: boolean; error?: string }> {
  if (!clientId || !codeVerifier) {
    return { success: false, error: 'Auth flow not properly initialized' }
  }

  try {
    const urlObj = new URL(url)
    const code = urlObj.searchParams.get('code')
    const error = urlObj.searchParams.get('error')

    if (error) {
      return { success: false, error: `Spotify authorization failed: ${error}` }
    }

    if (!code) {
      return { success: false, error: 'No authorization code received' }
    }

    // Exchange code for tokens
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: `Token exchange failed: ${errorData.error_description || errorData.error}` }
    }

    const data = await response.json()

    // Save tokens (persist to disk)
    await saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    })

    // Clear code verifier
    codeVerifier = null

    return { success: true }
  } catch (error) {
    return { success: false, error: `Auth callback error: ${error}` }
  }
}

// Refresh the access token
async function refreshAccessToken(): Promise<void> {
  // Load client ID if not in memory
  const storedClientId = clientId || (await loadClientId())
  const storedTokens = tokens || (await loadTokens())

  if (!storedClientId || !storedTokens?.refreshToken) {
    throw new Error('Cannot refresh: missing client ID or refresh token')
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: storedClientId,
      grant_type: 'refresh_token',
      refresh_token: storedTokens.refreshToken,
    }),
  })

  if (!response.ok) {
    // If refresh fails, clear tokens (user needs to re-auth)
    await clearTokens()
    throw new Error('Token refresh failed')
  }

  const data = await response.json()

  await saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || storedTokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  })
}

// Logout - clear all tokens from memory and storage
export async function logout(): Promise<void> {
  tokens = null
  codeVerifier = null
  await clearTokens()
}

// Get user profile
export async function getUserProfile(): Promise<any> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new Error('Not authenticated')
  }

  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user profile')
  }

  return response.json()
}
