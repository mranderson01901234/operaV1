import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type {
  Agent,
  Message,
  ChatParams,
  ChatChunk,
  ToolCall,
  Tab,
  TabHistoryEntry,
  CreateTabParams,
  Document,
  DocumentEditRequest,
  DocumentEditResult,
  PendingDocumentEdit,
} from '../../shared/types'

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      invoke: (channel: string, ...args: any[]) => Promise<any>
      on: (channel: string, callback: (...args: any[]) => void) => void
      removeListener: (channel: string, callback: (...args: any[]) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}

// Spotify types
export interface SpotifyDevice {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number
}

export interface SpotifyTrack {
  id: string
  name: string
  uri: string
  duration_ms: number
  artists: { id: string; name: string; uri: string }[]
  album: {
    id: string
    name: string
    uri: string
    images: { url: string; height: number; width: number }[]
  }
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice
  shuffle_state: boolean
  repeat_state: 'off' | 'track' | 'context'
  timestamp: number
  context: { type: string; uri: string } | null
  progress_ms: number
  is_playing: boolean
  item: SpotifyTrack | null
}

export interface SpotifyUserProfile {
  id: string
  display_name: string
  email: string
  images: { url: string; height: number; width: number }[]
  product: string
  country: string
}

// IPC client wrapper for renderer process
export const ipc = {
  // Agent operations
  agent: {
    create: async (data: { name?: string; model?: string; provider?: Agent['provider'] }): Promise<Agent> => {
      return window.electronAPI.invoke(IPC_CHANNELS.AGENT_CREATE, data)
    },
    getAll: async (): Promise<Agent[]> => {
      return window.electronAPI.invoke(IPC_CHANNELS.AGENT_GET_ALL)
    },
    getById: async (id: string): Promise<Agent | null> => {
      return window.electronAPI.invoke(IPC_CHANNELS.AGENT_GET_BY_ID, id)
    },
    update: async (id: string, updates: Partial<Agent>): Promise<Agent | null> => {
      return window.electronAPI.invoke(IPC_CHANNELS.AGENT_UPDATE, id, updates)
    },
    delete: async (id: string): Promise<boolean> => {
      return window.electronAPI.invoke(IPC_CHANNELS.AGENT_DELETE, id)
    },
  },

  // Message operations
  message: {
    create: async (data: Omit<Message, 'id' | 'createdAt'>): Promise<Message> => {
      return window.electronAPI.invoke(IPC_CHANNELS.MESSAGE_CREATE, data)
    },
    update: async (id: string, updates: { content?: string; toolCalls?: any[] }): Promise<boolean> => {
      return window.electronAPI.invoke(IPC_CHANNELS.MESSAGE_UPDATE, id, updates)
    },
    getByAgent: async (agentId: string): Promise<Message[]> => {
      return window.electronAPI.invoke(IPC_CHANNELS.MESSAGE_GET_BY_AGENT, agentId)
    },
    getFirstUser: async (agentId: string): Promise<Message | null> => {
      return window.electronAPI.invoke(IPC_CHANNELS.MESSAGE_GET_FIRST_USER, agentId)
    },
    delete: async (id: string): Promise<boolean> => {
      return window.electronAPI.invoke(IPC_CHANNELS.MESSAGE_DELETE, id)
    },
  },

  // File operations
  file: {
    process: async (params: {
      dataUri: string
      filename: string
      mimeType: string
      size: number
      provider?: string
    }): Promise<{ success: boolean; error?: string; attachment?: any }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.FILE_PROCESS, params)
    },
    validate: async (params: {
      dataUri: string
      filename: string
      mimeType: string
      size: number
      provider?: string
    }): Promise<{ valid: boolean; error?: string; mimeType?: string; category?: string; size?: number }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.FILE_VALIDATE, params)
    },
  },

  // LLM operations
  llm: {
    stream: async (params: ChatParams & { provider: string }): Promise<ChatChunk[]> => {
      return window.electronAPI.invoke(IPC_CHANNELS.LLM_STREAM, params)
    },
    getProviders: async (): Promise<string[]> => {
      return window.electronAPI.invoke('llm:getProviders')
    },
    getModels: async (provider: string): Promise<string[]> => {
      return window.electronAPI.invoke('llm:getModels', provider)
    },
    getModelCapabilities: async (provider: string, model: string): Promise<{ supportsVision: boolean; supportsTools: boolean } | null> => {
      return window.electronAPI.invoke('llm:getModelCapabilities', provider, model)
    },
  },

  // API Key management
  apiKey: {
    set: async (provider: string, key: string): Promise<boolean> => {
      return window.electronAPI.invoke('apiKey:set', provider, key)
    },
    get: async (provider: string): Promise<string | null> => {
      return window.electronAPI.invoke('apiKey:get', provider)
    },
    has: async (provider: string): Promise<boolean> => {
      return window.electronAPI.invoke('apiKey:has', provider)
    },
    delete: async (provider: string): Promise<boolean> => {
      return window.electronAPI.invoke('apiKey:delete', provider)
    },
  },

  // Browser operations (now tab-aware)
  browser: {
    navigate: async (url: string, tabId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_NAVIGATE, url, tabId)
    },
    goBack: async (tabId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GO_BACK, tabId)
    },
    goForward: async (tabId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GO_FORWARD, tabId)
    },
    refresh: async (tabId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_REFRESH, tabId)
    },
    getState: async (tabId?: string): Promise<{ success: boolean; state?: any; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GET_STATE, tabId)
    },
    getContext: async (includeScreenshot: boolean = false): Promise<{ success: boolean; context?: any; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GET_CONTEXT, includeScreenshot)
    },
    captureScreenshot: async (options?: { fullPage?: boolean; format?: 'png' | 'jpeg'; quality?: number }): Promise<{ success: boolean; screenshot?: string; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_CAPTURE_SCREENSHOT, options)
    },
    getAccessibilityTree: async (): Promise<{ success: boolean; tree?: any[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GET_ACCESSIBILITY_TREE)
    },
    executeTool: async (toolCall: ToolCall): Promise<{ success: boolean; result?: any; error?: string; screenshot?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_EXECUTE_TOOL, toolCall)
    },
    executeTools: async (toolCalls: ToolCall[]): Promise<{ success: boolean; results?: any[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_EXECUTE_TOOLS, toolCalls)
    },
  },

  // Tab operations
  tab: {
    create: async (params: CreateTabParams): Promise<{ success: boolean; tab?: Tab; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_CREATE, params)
    },
    close: async (tabId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_CLOSE, tabId)
    },
    switch: async (tabId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_SWITCH, tabId)
    },
    update: async (tabId: string, updates: { title?: string; url?: string; isPinned?: boolean }): Promise<{ success: boolean; tab?: Tab; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_UPDATE, tabId, updates)
    },
    getByAgent: async (agentId: string): Promise<{ success: boolean; tabs?: Tab[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_GET_BY_AGENT, agentId)
    },
    getActive: async (agentId: string): Promise<{ success: boolean; tab?: Tab | null; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_GET_ACTIVE, agentId)
    },
    reorder: async (tabIds: string[]): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_REORDER, tabIds)
    },
  },

  // Tab history operations
  tabHistory: {
    get: async (tabId: string, limit?: number): Promise<{ success: boolean; history?: TabHistoryEntry[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_HISTORY_GET, tabId, limit)
    },
    clear: async (tabId: string): Promise<{ success: boolean; deleted?: number; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_HISTORY_CLEAR, tabId)
    },
    delete: async (entryId: string): Promise<{ success: boolean; deleted?: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.TAB_HISTORY_DELETE, entryId)
    },
  },

  // Local model operations (for cost optimization)
  localModel: {
    checkAvailable: async (): Promise<{ success: boolean; available?: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.LOCAL_MODEL_CHECK_AVAILABLE)
    },
    classifySearchIntent: async (userMessage: string): Promise<{ success: boolean; intent?: any; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.LOCAL_MODEL_CLASSIFY_SEARCH_INTENT, userMessage)
    },
    extractSearchResults: async (pageText: string, query: string): Promise<{ success: boolean; results?: any[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.LOCAL_MODEL_EXTRACT_SEARCH_RESULTS, pageText, query)
    },
    planSearch: async (userMessage: string, conversationHistory: Message[]): Promise<{ success: boolean; plan?: any; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.LOCAL_MODEL_PLAN_SEARCH, userMessage, conversationHistory)
    },
  },

  // Deep research operations
  research: {
    async deepResearch(userPrompt: string, agentId: string): Promise<{ success: boolean; result?: any; error?: string }> {
      return window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_DEEP, userPrompt, agentId)
    },
    configure: async (config: Partial<any>): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.RESEARCH_CONFIGURE, config)
    },
  },

  // Document operations
  document: {
    createTab: async (params: {
      agentId: string
      dataUri: string
      filename: string
      mimeType: string
      size: number
      provider?: string
      makeActive?: boolean
    }): Promise<{ success: boolean; document?: Document; tab?: Tab; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_CREATE_TAB, params)
    },
    getById: async (id: string): Promise<{ success: boolean; document?: Document; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_GET_BY_ID, id)
    },
    getByAgent: async (agentId: string): Promise<{ success: boolean; documents?: Document[]; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_GET_BY_AGENT, agentId)
    },
    update: async (id: string, updates: { name?: string; extractedText?: string }): Promise<{ success: boolean; document?: Document; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_UPDATE, id, updates)
    },
    delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_DELETE, id)
    },
    readFile: async (id: string): Promise<{ success: boolean; dataUri?: string; mimeType?: string; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_READ_FILE, id)
    },
    extractDocText: async (id: string): Promise<{ success: boolean; text?: string; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_EXTRACT_DOC_TEXT, id)
    },
    checkDependencies: async (): Promise<{
      success: boolean
      available?: boolean
      error?: string
      installInstructions?: string
    }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_CHECK_DEPENDENCIES)
    },
    saveFile: async (
      id: string,
      content: string,
      options?: { isDataUri?: boolean; extractText?: boolean }
    ): Promise<{ success: boolean; document?: Document; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_SAVE_FILE, id, content, options)
    },
  },

  // Document tool operations (LLM-triggered document editing)
  documentTool: {
    list: async (agentId: string): Promise<{
      success: boolean
      result?: {
        documents: Array<{
          id: string
          name: string
          mimeType: string
          size: number
          sizeFormatted: string
          updatedAt: string
        }>
        count: number
      }
      error?: string
    }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_TOOL_LIST, agentId)
    },
    read: async (args: { documentId: string }): Promise<{
      success: boolean
      result?: {
        documentId: string
        name: string
        mimeType: string
        content: string
        lineCount: number
        size: number
        sizeFormatted: string
      }
      error?: string
    }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_TOOL_READ, args)
    },
    create: async (
      args: { filename: string; content: string; mimeType?: string },
      agentId: string
    ): Promise<{
      success: boolean
      result?: {
        documentId: string
        name: string
        tabId: string
        mimeType: string
        size: number
        sizeFormatted: string
        lineCount: number
        message: string
      }
      error?: string
    }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_TOOL_CREATE, args, agentId)
    },
    edit: async (args: DocumentEditRequest, agentId: string): Promise<DocumentEditResult> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_TOOL_EDIT, args, agentId)
    },
  },

  // Document edit confirmation operations
  documentEdit: {
    getPending: async (agentId: string): Promise<{
      success: boolean
      edits: PendingDocumentEdit[]
      count: number
    }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_EDIT_GET_PENDING, agentId)
    },
    approve: async (pendingEditId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_EDIT_APPROVE, pendingEditId)
    },
    reject: async (pendingEditId: string): Promise<{ success: boolean; message?: string }> => {
      return window.electronAPI.invoke(IPC_CHANNELS.DOCUMENT_EDIT_REJECT, pendingEditId)
    },
  },

  // Spotify operations
  spotify: {
    // Auth
    setClientId: async (clientId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:setClientId', clientId)
    },
    getClientId: async (): Promise<{ success: boolean; clientId: string | null }> => {
      return window.electronAPI.invoke('spotify:getClientId')
    },
    isAuthenticated: async (): Promise<{ success: boolean; authenticated: boolean }> => {
      return window.electronAPI.invoke('spotify:isAuthenticated')
    },
    initializeAuth: async (): Promise<{ success: boolean; authenticated: boolean; hasClientId: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:initializeAuth')
    },
    login: async (): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:login')
    },
    logout: async (): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:logout')
    },
    getProfile: async (): Promise<{ success: boolean; profile?: SpotifyUserProfile; error?: string }> => {
      return window.electronAPI.invoke('spotify:getProfile')
    },
    getAccessToken: async (): Promise<{ success: boolean; token?: string; error?: string }> => {
      return window.electronAPI.invoke('spotify:getAccessToken')
    },

    // Playback
    getPlaybackState: async (): Promise<{ success: boolean; state?: SpotifyPlaybackState; error?: string }> => {
      return window.electronAPI.invoke('spotify:getPlaybackState')
    },
    getCurrentlyPlaying: async (): Promise<{ success: boolean; track?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getCurrentlyPlaying')
    },
    play: async (options?: { deviceId?: string; contextUri?: string; uris?: string[]; positionMs?: number }): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:play', options)
    },
    pause: async (deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:pause', deviceId)
    },
    next: async (deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:next', deviceId)
    },
    previous: async (deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:previous', deviceId)
    },
    seek: async (positionMs: number, deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:seek', positionMs, deviceId)
    },
    setVolume: async (volumePercent: number, deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:setVolume', volumePercent, deviceId)
    },
    setShuffle: async (state: boolean, deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:setShuffle', state, deviceId)
    },
    setRepeat: async (state: 'track' | 'context' | 'off', deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:setRepeat', state, deviceId)
    },
    getDevices: async (): Promise<{ success: boolean; devices?: { devices: SpotifyDevice[] }; error?: string }> => {
      return window.electronAPI.invoke('spotify:getDevices')
    },
    transferPlayback: async (deviceId: string, play?: boolean): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:transferPlayback', deviceId, play)
    },

    // Queue
    getQueue: async (): Promise<{ success: boolean; queue?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getQueue')
    },
    addToQueue: async (uri: string, deviceId?: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:addToQueue', uri, deviceId)
    },

    // Library
    getSavedTracks: async (limit?: number, offset?: number): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getSavedTracks', limit, offset)
    },
    getSavedAlbums: async (limit?: number, offset?: number): Promise<{ success: boolean; albums?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getSavedAlbums', limit, offset)
    },
    saveTrack: async (trackId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:saveTrack', trackId)
    },
    removeTrack: async (trackId: string): Promise<{ success: boolean; error?: string }> => {
      return window.electronAPI.invoke('spotify:removeTrack', trackId)
    },
    checkSavedTracks: async (trackIds: string[]): Promise<{ success: boolean; saved?: boolean[]; error?: string }> => {
      return window.electronAPI.invoke('spotify:checkSavedTracks', trackIds)
    },

    // Playlists
    getUserPlaylists: async (limit?: number, offset?: number): Promise<{ success: boolean; playlists?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getUserPlaylists', limit, offset)
    },
    getPlaylist: async (playlistId: string): Promise<{ success: boolean; playlist?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getPlaylist', playlistId)
    },
    getPlaylistTracks: async (playlistId: string, limit?: number, offset?: number): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getPlaylistTracks', playlistId, limit, offset)
    },

    // Browse
    getFeaturedPlaylists: async (limit?: number): Promise<{ success: boolean; playlists?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getFeaturedPlaylists', limit)
    },
    getNewReleases: async (limit?: number): Promise<{ success: boolean; albums?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getNewReleases', limit)
    },
    getCategories: async (limit?: number): Promise<{ success: boolean; categories?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getCategories', limit)
    },

    // Search
    search: async (query: string, types?: string[], limit?: number): Promise<{ success: boolean; results?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:search', query, types, limit)
    },

    // Artist
    getArtist: async (artistId: string): Promise<{ success: boolean; artist?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getArtist', artistId)
    },
    getArtistTopTracks: async (artistId: string, market?: string): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getArtistTopTracks', artistId, market)
    },
    getArtistAlbums: async (artistId: string, limit?: number): Promise<{ success: boolean; albums?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getArtistAlbums', artistId, limit)
    },

    // Album
    getAlbum: async (albumId: string): Promise<{ success: boolean; album?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getAlbum', albumId)
    },
    getAlbumTracks: async (albumId: string, limit?: number): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getAlbumTracks', albumId, limit)
    },

    // History & Personalization
    getRecentlyPlayed: async (limit?: number): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getRecentlyPlayed', limit)
    },
    getTopTracks: async (timeRange?: string, limit?: number): Promise<{ success: boolean; tracks?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getTopTracks', timeRange, limit)
    },
    getTopArtists: async (timeRange?: string, limit?: number): Promise<{ success: boolean; artists?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getTopArtists', timeRange, limit)
    },
    getRecommendations: async (options: { seedArtists?: string[]; seedTracks?: string[]; seedGenres?: string[]; limit?: number }): Promise<{ success: boolean; recommendations?: any; error?: string }> => {
      return window.electronAPI.invoke('spotify:getRecommendations', options)
    },

    // Event listeners
    onAuthCallback: (callback: (result: { success: boolean; error?: string }) => void) => {
      window.electronAPI.on('spotify:authCallback', callback)
    },
    removeAuthCallbackListener: (callback: (result: { success: boolean; error?: string }) => void) => {
      window.electronAPI.removeListener('spotify:authCallback', callback)
    },
  },
}

