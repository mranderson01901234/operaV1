import { create } from 'zustand'
import { ipc, SpotifyPlaybackState, SpotifyUserProfile, SpotifyDevice } from '../lib/ipc'

// Declare Spotify SDK types
declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume?: number
      }) => SpotifyPlayer
    }
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>
  disconnect: () => void
  addListener: (event: string, callback: (state: any) => void) => void
  removeListener: (event: string, callback?: (state: any) => void) => void
  getCurrentState: () => Promise<any>
  setName: (name: string) => Promise<void>
  getVolume: () => Promise<number>
  setVolume: (volume: number) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  togglePlay: () => Promise<void>
  seek: (position_ms: number) => Promise<void>
  previousTrack: () => Promise<void>
  nextTrack: () => Promise<void>
  activateElement: () => Promise<void>
  _options: { id: string }
}

interface SpotifyStore {
  // UI State
  isExpanded: boolean
  activeView: 'player' | 'search' | 'library' | 'playlists' | 'browse'

  // Auth State
  isAuthenticated: boolean
  isLoading: boolean
  profile: SpotifyUserProfile | null
  clientId: string | null

  // Web Playback SDK
  player: SpotifyPlayer | null
  playerDeviceId: string | null
  playerReady: boolean
  sdkError: string | null

  // Playback State
  playbackState: SpotifyPlaybackState | null
  localPlaybackState: any | null  // State from Web Playback SDK
  devices: SpotifyDevice[]
  activeDeviceId: string | null
  volume: number

  // Library Data
  playlists: any[]
  savedTracks: any[]
  recentlyPlayed: any[]

  // Search
  searchQuery: string
  searchResults: any | null

  // Actions - UI
  toggleExpanded: () => void
  setExpanded: (expanded: boolean) => void
  setActiveView: (view: 'player' | 'search' | 'library' | 'playlists' | 'browse') => void

  // Actions - Auth
  initialize: () => Promise<void>
  initializePlayer: () => Promise<void>
  setClientId: (clientId: string) => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  handleAuthCallback: (result: { success: boolean; error?: string }) => Promise<void>

  // Actions - Playback
  refreshPlaybackState: () => Promise<void>
  play: (options?: { contextUri?: string; uris?: string[] }) => Promise<void>
  pause: () => Promise<void>
  next: () => Promise<void>
  previous: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  setVolume: (percent: number) => Promise<void>
  toggleShuffle: () => Promise<void>
  cycleRepeat: () => Promise<void>
  selectDevice: (deviceId: string) => Promise<void>
  refreshDevices: () => Promise<void>
  transferToApp: () => Promise<void>

  // Actions - Library
  loadPlaylists: () => Promise<void>
  loadSavedTracks: () => Promise<void>
  loadRecentlyPlayed: () => Promise<void>

  // Actions - Search
  setSearchQuery: (query: string) => void
  search: (query: string) => Promise<void>

  // Actions - Track
  saveTrack: (trackId: string) => Promise<void>
  removeTrack: (trackId: string) => Promise<void>
  addToQueue: (uri: string) => Promise<void>
}

export const useSpotifyStore = create<SpotifyStore>((set, get) => ({
  // Initial UI State
  isExpanded: false,
  activeView: 'player',

  // Initial Auth State
  isAuthenticated: false,
  isLoading: false,
  profile: null,
  clientId: null,

  // Web Playback SDK
  player: null,
  playerDeviceId: null,
  playerReady: false,
  sdkError: null,

  // Initial Playback State
  playbackState: null,
  localPlaybackState: null,
  devices: [],
  activeDeviceId: null,
  volume: 50,

  // Initial Library Data
  playlists: [],
  savedTracks: [],
  recentlyPlayed: [],

  // Initial Search
  searchQuery: '',
  searchResults: null,

  // UI Actions
  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }))
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded })
  },

  setActiveView: (view) => {
    set({ activeView: view })
  },

  // Auth Actions
  initialize: async () => {
    set({ isLoading: true })
    try {
      // Initialize auth from persistent storage (loads saved tokens and client ID)
      const initResult = await ipc.spotify.initializeAuth()

      if (initResult.success) {
        // If we have a client ID from persistent storage, update state
        if (initResult.hasClientId) {
          const clientIdResult = await ipc.spotify.getClientId()
          if (clientIdResult.success && clientIdResult.clientId) {
            set({ clientId: clientIdResult.clientId })
            // Also store in localStorage for backwards compatibility
            localStorage.setItem('spotify_client_id', clientIdResult.clientId)
          }
        } else {
          // Fall back to localStorage if no persisted client ID (migration path)
          const storedClientId = localStorage.getItem('spotify_client_id')
          if (storedClientId) {
            await ipc.spotify.setClientId(storedClientId)
            set({ clientId: storedClientId })
          }
        }

        // If authenticated (tokens valid or refreshed), load user data
        if (initResult.authenticated) {
          set({ isAuthenticated: true })

          // Load profile
          const profileResult = await ipc.spotify.getProfile()
          if (profileResult.success && profileResult.profile) {
            set({ profile: profileResult.profile })
          }

          // Initialize Web Playback SDK player
          await get().initializePlayer()

          // Load initial data
          await get().refreshPlaybackState()
          await get().refreshDevices()
          await get().loadPlaylists()
        }
      }
    } catch (error) {
      console.error('Failed to initialize Spotify:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  // Initialize Web Playback SDK Player
  initializePlayer: async () => {
    // Wait for SDK to be ready
    const waitForSDK = (): Promise<void> => {
      return new Promise((resolve) => {
        if (window.Spotify) {
          resolve()
        } else {
          // Listen for the custom event dispatched from index.html
          window.addEventListener('SpotifySDKReady', () => resolve(), { once: true })
        }
      })
    }

    try {
      await waitForSDK()

      const player = new window.Spotify.Player({
        name: 'Opera Studio',
        getOAuthToken: async (cb) => {
          const result = await ipc.spotify.getAccessToken()
          if (result.success && result.token) {
            cb(result.token)
          }
        },
        volume: get().volume / 100,
      })

      // Error handling
      player.addListener('initialization_error', ({ message }) => {
        console.error('Spotify SDK initialization error:', message)
        // Check for Widevine/EME errors
        if (message.includes('keysystem') || message.includes('EME') || message.includes('initialize')) {
          set({ sdkError: 'Playback in app not supported. Using remote control mode.' })
        } else {
          set({ sdkError: message })
        }
      })

      player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify SDK authentication error:', message)
        set({ sdkError: 'Authentication error. Try reconnecting.' })
      })

      player.addListener('account_error', ({ message }) => {
        console.error('Spotify SDK account error:', message)
        set({ sdkError: 'Spotify Premium required for in-app playback' })
      })

      player.addListener('playback_error', ({ message }) => {
        console.error('Spotify SDK playback error:', message)
      })

      // Ready
      player.addListener('ready', ({ device_id }) => {
        console.log('Spotify player ready with device ID:', device_id)
        set({
          playerDeviceId: device_id,
          playerReady: true,
          activeDeviceId: device_id,
          sdkError: null,
        })

        // Auto-transfer playback to this app
        get().transferToApp()
      })

      // Not Ready
      player.addListener('not_ready', ({ device_id }) => {
        console.log('Spotify player not ready:', device_id)
        set({ playerReady: false })
      })

      // Playback state changes
      player.addListener('player_state_changed', (state) => {
        if (state) {
          set({ localPlaybackState: state })

          // Convert to our playback state format
          const track = state.track_window?.current_track
          if (track) {
            set({
              playbackState: {
                is_playing: !state.paused,
                progress_ms: state.position,
                item: {
                  id: track.id,
                  name: track.name,
                  uri: track.uri,
                  duration_ms: track.duration_ms,
                  artists: track.artists,
                  album: {
                    id: track.album?.uri?.split(':')[2] || '',
                    name: track.album?.name || '',
                    uri: track.album?.uri || '',
                    images: track.album?.images || [],
                  },
                },
                shuffle_state: state.shuffle,
                repeat_state: state.repeat_mode === 0 ? 'off' : state.repeat_mode === 1 ? 'context' : 'track',
                device: {
                  id: get().playerDeviceId || '',
                  is_active: true,
                  is_private_session: false,
                  is_restricted: false,
                  name: 'Opera Studio',
                  type: 'Computer',
                  volume_percent: get().volume,
                },
                timestamp: Date.now(),
                context: state.context ? { type: state.context.type, uri: state.context.uri } : null,
              } as any,
            })
          }
        }
      })

      // Connect the player
      const connected = await player.connect()
      if (connected) {
        console.log('Spotify player connected successfully')
        set({ player })
      } else {
        console.error('Failed to connect Spotify player')
        set({ sdkError: 'Failed to connect player' })
      }
    } catch (error) {
      console.error('Failed to initialize Spotify player:', error)
      set({ sdkError: String(error) })
    }
  },

  setClientId: async (clientId) => {
    try {
      await ipc.spotify.setClientId(clientId)
      localStorage.setItem('spotify_client_id', clientId)
      set({ clientId })
    } catch (error) {
      console.error('Failed to set client ID:', error)
    }
  },

  login: async () => {
    set({ isLoading: true })
    try {
      const result = await ipc.spotify.login()
      if (result.success) {
        // Login succeeded - load profile and data
        set({ isAuthenticated: true })

        const profileResult = await ipc.spotify.getProfile()
        if (profileResult.success && profileResult.profile) {
          set({ profile: profileResult.profile })
        }

        // Initialize Web Playback SDK player
        await get().initializePlayer()

        // Load initial data
        await get().refreshPlaybackState()
        await get().refreshDevices()
        await get().loadPlaylists()
      } else {
        console.error('Login failed:', result.error)
      }
    } catch (error) {
      console.error('Login error:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try {
      // Disconnect player
      const { player } = get()
      if (player) {
        player.disconnect()
      }

      await ipc.spotify.logout()
      set({
        isAuthenticated: false,
        profile: null,
        playbackState: null,
        localPlaybackState: null,
        devices: [],
        playlists: [],
        savedTracks: [],
        recentlyPlayed: [],
        searchResults: null,
        player: null,
        playerDeviceId: null,
        playerReady: false,
        sdkError: null,
      })
    } catch (error) {
      console.error('Logout error:', error)
    }
  },

  handleAuthCallback: async (result) => {
    if (result.success) {
      set({ isAuthenticated: true })

      // Load profile
      const profileResult = await ipc.spotify.getProfile()
      if (profileResult.success && profileResult.profile) {
        set({ profile: profileResult.profile })
      }

      // Load initial data
      await get().refreshPlaybackState()
      await get().refreshDevices()
      await get().loadPlaylists()
    } else {
      console.error('Auth callback failed:', result.error)
    }
    set({ isLoading: false })
  },

  // Playback Actions
  refreshPlaybackState: async () => {
    try {
      const result = await ipc.spotify.getPlaybackState()
      if (result.success) {
        set({
          playbackState: result.state || null,
          activeDeviceId: result.state?.device?.id || null,
        })
      }
    } catch (error) {
      console.error('Failed to refresh playback state:', error)
    }
  },

  play: async (options) => {
    try {
      const { playerDeviceId, playerReady } = get()
      // Use the app's player device if ready
      const deviceId = playerReady && playerDeviceId ? playerDeviceId : get().activeDeviceId
      await ipc.spotify.play({ ...options, deviceId: deviceId || undefined })
      // Small delay then refresh state
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Play error:', error)
    }
  },

  pause: async () => {
    try {
      const { player, playerReady } = get()
      // Use local player if available
      if (playerReady && player) {
        await player.pause()
      } else {
        const { activeDeviceId } = get()
        await ipc.spotify.pause(activeDeviceId || undefined)
      }
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Pause error:', error)
    }
  },

  next: async () => {
    try {
      const { player, playerReady } = get()
      if (playerReady && player) {
        await player.nextTrack()
      } else {
        const { activeDeviceId } = get()
        await ipc.spotify.next(activeDeviceId || undefined)
      }
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Next error:', error)
    }
  },

  previous: async () => {
    try {
      const { player, playerReady } = get()
      if (playerReady && player) {
        await player.previousTrack()
      } else {
        const { activeDeviceId } = get()
        await ipc.spotify.previous(activeDeviceId || undefined)
      }
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Previous error:', error)
    }
  },

  seek: async (positionMs) => {
    try {
      const { player, playerReady } = get()
      if (playerReady && player) {
        await player.seek(positionMs)
      } else {
        const { activeDeviceId } = get()
        await ipc.spotify.seek(positionMs, activeDeviceId || undefined)
      }
    } catch (error) {
      console.error('Seek error:', error)
    }
  },

  setVolume: async (percent) => {
    try {
      const { player, playerReady } = get()
      set({ volume: percent })
      if (playerReady && player) {
        await player.setVolume(percent / 100)
      } else {
        const { activeDeviceId } = get()
        await ipc.spotify.setVolume(percent, activeDeviceId || undefined)
      }
    } catch (error) {
      console.error('Volume error:', error)
    }
  },

  toggleShuffle: async () => {
    try {
      const { playbackState, activeDeviceId } = get()
      const newState = !playbackState?.shuffle_state
      await ipc.spotify.setShuffle(newState, activeDeviceId || undefined)
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Shuffle error:', error)
    }
  },

  cycleRepeat: async () => {
    try {
      const { playbackState, activeDeviceId } = get()
      const currentState = playbackState?.repeat_state || 'off'
      const nextState = currentState === 'off' ? 'context' : currentState === 'context' ? 'track' : 'off'
      await ipc.spotify.setRepeat(nextState, activeDeviceId || undefined)
      setTimeout(() => get().refreshPlaybackState(), 300)
    } catch (error) {
      console.error('Repeat error:', error)
    }
  },

  selectDevice: async (deviceId) => {
    try {
      await ipc.spotify.transferPlayback(deviceId, true)
      set({ activeDeviceId: deviceId })
      setTimeout(() => get().refreshPlaybackState(), 500)
    } catch (error) {
      console.error('Device select error:', error)
    }
  },

  refreshDevices: async () => {
    try {
      const result = await ipc.spotify.getDevices()
      if (result.success && result.devices) {
        set({ devices: result.devices.devices || [] })
      }
    } catch (error) {
      console.error('Failed to refresh devices:', error)
    }
  },

  // Transfer playback to this app
  transferToApp: async () => {
    try {
      const { playerDeviceId, playerReady } = get()
      if (playerReady && playerDeviceId) {
        console.log('Transferring playback to Opera Studio...')
        await ipc.spotify.transferPlayback(playerDeviceId, false)
        set({ activeDeviceId: playerDeviceId })
      }
    } catch (error) {
      console.error('Failed to transfer playback to app:', error)
    }
  },

  // Library Actions
  loadPlaylists: async () => {
    try {
      const result = await ipc.spotify.getUserPlaylists(50)
      if (result.success && result.playlists) {
        set({ playlists: result.playlists.items || [] })
      }
    } catch (error) {
      console.error('Failed to load playlists:', error)
    }
  },

  loadSavedTracks: async () => {
    try {
      const result = await ipc.spotify.getSavedTracks(50)
      if (result.success && result.tracks) {
        set({ savedTracks: result.tracks.items || [] })
      }
    } catch (error) {
      console.error('Failed to load saved tracks:', error)
    }
  },

  loadRecentlyPlayed: async () => {
    try {
      const result = await ipc.spotify.getRecentlyPlayed(50)
      if (result.success && result.tracks) {
        set({ recentlyPlayed: result.tracks.items || [] })
      }
    } catch (error) {
      console.error('Failed to load recently played:', error)
    }
  },

  // Search Actions
  setSearchQuery: (query) => {
    set({ searchQuery: query })
  },

  search: async (query) => {
    if (!query.trim()) {
      set({ searchResults: null })
      return
    }

    try {
      const result = await ipc.spotify.search(query, ['track', 'artist', 'album', 'playlist'], 20)
      if (result.success && result.results) {
        set({ searchResults: result.results })
      }
    } catch (error) {
      console.error('Search error:', error)
    }
  },

  // Track Actions
  saveTrack: async (trackId) => {
    try {
      await ipc.spotify.saveTrack(trackId)
    } catch (error) {
      console.error('Save track error:', error)
    }
  },

  removeTrack: async (trackId) => {
    try {
      await ipc.spotify.removeTrack(trackId)
    } catch (error) {
      console.error('Remove track error:', error)
    }
  },

  addToQueue: async (uri) => {
    try {
      const { activeDeviceId } = get()
      await ipc.spotify.addToQueue(uri, activeDeviceId || undefined)
    } catch (error) {
      console.error('Add to queue error:', error)
    }
  },
}))
