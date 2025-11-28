import { safeStorage, app } from 'electron'

// Initialize electron-store for persistent storage
// Use dynamic import since electron-store v11+ is an ES Module
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
          name: 'api-keys',
          encryptionKey: 'api-keys-encryption-key',
          cwd: app.getPath('userData'),
        })
        return store
      } catch (error) {
        console.error('Failed to initialize electron-store:', error)
        // Fallback: create a simple in-memory store
        store = {
          _data: {},
          get: (key: string) => store._data[key],
          set: (key: string, value: any) => { store._data[key] = value },
          delete: (key: string) => { delete store._data[key] },
        }
        return store
      }
    })()
  }
  
  return storePromise
}

export const apiKeyManager = {
  store: async (provider: string, key: string): Promise<boolean> => {
    try {
      const storage = await getStore()
      // Check if safeStorage is available
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key)
        storage.set(`keys.${provider}`, encrypted.toString('base64'))
        return true
      } else {
        // Fallback: store as plain text (not ideal, but works)
        // In production, warn user about this
        storage.set(`keys.${provider}`, key)
        return true
      }
    } catch (error) {
      console.error(`Failed to store API key for ${provider}:`, error)
      return false
    }
  },

  get: async (provider: string): Promise<string | null> => {
    try {
      const storage = await getStore()
      const stored = storage.get(`keys.${provider}`) as string | undefined
      
      if (!stored) {
        return null
      }

      // Try to decrypt if it's encrypted
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(stored, 'base64')
          return safeStorage.decryptString(buffer)
        } catch {
          // If decryption fails, might be plain text (from fallback)
          return stored
        }
      } else {
        // Fallback: return as-is (plain text)
        return stored
      }
    } catch (error) {
      console.error(`Failed to get API key for ${provider}:`, error)
      return null
    }
  },

  delete: async (provider: string): Promise<boolean> => {
    try {
      const storage = await getStore()
      storage.delete(`keys.${provider}`)
      return true
    } catch (error) {
      console.error(`Failed to delete API key for ${provider}:`, error)
      return false
    }
  },

  has: async (provider: string): Promise<boolean> => {
    try {
      const storage = await getStore()
      const stored = storage.get(`keys.${provider}`)
      return stored !== undefined && stored !== null
    } catch (error) {
      console.error(`Failed to check API key for ${provider}:`, error)
      return false
    }
  },

  list: async (): Promise<string[]> => {
    try {
      const storage = await getStore()
      const keys = storage.get('keys') as Record<string, string> | undefined
      return keys ? Object.keys(keys) : []
    } catch (error) {
      console.error('Failed to list API keys:', error)
      return []
    }
  },
}

