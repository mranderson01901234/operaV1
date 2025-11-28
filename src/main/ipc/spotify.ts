import { ipcMain } from 'electron'
import * as spotifyAuth from '../spotify/auth'
import * as spotifyApi from '../spotify/api'

export function registerSpotifyHandlers() {
  // ============ Auth Handlers ============

  // Set Client ID
  ipcMain.handle('spotify:setClientId', async (_event, clientId: string) => {
    try {
      await spotifyAuth.setClientId(clientId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Get Client ID
  ipcMain.handle('spotify:getClientId', async () => {
    const clientId = await spotifyAuth.getClientId()
    return { success: true, clientId }
  })

  // Check if authenticated
  ipcMain.handle('spotify:isAuthenticated', async () => {
    const authenticated = await spotifyAuth.isAuthenticated()
    return { success: true, authenticated }
  })

  // Initialize auth - load persisted credentials
  ipcMain.handle('spotify:initializeAuth', async () => {
    try {
      const result = await spotifyAuth.initializeAuth()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Start auth flow
  ipcMain.handle('spotify:login', async () => {
    try {
      const result = await spotifyAuth.startAuthFlow()
      return result
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Logout
  ipcMain.handle('spotify:logout', async () => {
    try {
      await spotifyAuth.logout()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Get user profile
  ipcMain.handle('spotify:getProfile', async () => {
    try {
      const profile = await spotifyAuth.getUserProfile()
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Get access token (for Web Playback SDK)
  ipcMain.handle('spotify:getAccessToken', async () => {
    try {
      const token = await spotifyAuth.getAccessToken()
      return { success: true, token }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Playback Handlers ============

  ipcMain.handle('spotify:getPlaybackState', async () => {
    try {
      const state = await spotifyApi.getPlaybackState()
      return { success: true, state }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getCurrentlyPlaying', async () => {
    try {
      const track = await spotifyApi.getCurrentlyPlaying()
      return { success: true, track }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:play', async (_event, options?: {
    deviceId?: string
    contextUri?: string
    uris?: string[]
    positionMs?: number
  }) => {
    try {
      await spotifyApi.play(options)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:pause', async (_event, deviceId?: string) => {
    try {
      await spotifyApi.pause(deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:next', async (_event, deviceId?: string) => {
    try {
      await spotifyApi.skipToNext(deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:previous', async (_event, deviceId?: string) => {
    try {
      await spotifyApi.skipToPrevious(deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:seek', async (_event, positionMs: number, deviceId?: string) => {
    try {
      await spotifyApi.seek(positionMs, deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:setVolume', async (_event, volumePercent: number, deviceId?: string) => {
    try {
      await spotifyApi.setVolume(volumePercent, deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:setShuffle', async (_event, state: boolean, deviceId?: string) => {
    try {
      await spotifyApi.setShuffle(state, deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:setRepeat', async (_event, state: 'track' | 'context' | 'off', deviceId?: string) => {
    try {
      await spotifyApi.setRepeat(state, deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getDevices', async () => {
    try {
      const devices = await spotifyApi.getDevices()
      return { success: true, devices }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:transferPlayback', async (_event, deviceId: string, play?: boolean) => {
    try {
      await spotifyApi.transferPlayback(deviceId, play)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Queue Handlers ============

  ipcMain.handle('spotify:getQueue', async () => {
    try {
      const queue = await spotifyApi.getQueue()
      return { success: true, queue }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:addToQueue', async (_event, uri: string, deviceId?: string) => {
    try {
      await spotifyApi.addToQueue(uri, deviceId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Library Handlers ============

  ipcMain.handle('spotify:getSavedTracks', async (_event, limit?: number, offset?: number) => {
    try {
      const tracks = await spotifyApi.getSavedTracks(limit, offset)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getSavedAlbums', async (_event, limit?: number, offset?: number) => {
    try {
      const albums = await spotifyApi.getSavedAlbums(limit, offset)
      return { success: true, albums }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:saveTrack', async (_event, trackId: string) => {
    try {
      await spotifyApi.saveTrack(trackId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:removeTrack', async (_event, trackId: string) => {
    try {
      await spotifyApi.removeTrack(trackId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:checkSavedTracks', async (_event, trackIds: string[]) => {
    try {
      const saved = await spotifyApi.checkSavedTracks(trackIds)
      return { success: true, saved }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Playlist Handlers ============

  ipcMain.handle('spotify:getUserPlaylists', async (_event, limit?: number, offset?: number) => {
    try {
      const playlists = await spotifyApi.getUserPlaylists(limit, offset)
      return { success: true, playlists }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getPlaylist', async (_event, playlistId: string) => {
    try {
      const playlist = await spotifyApi.getPlaylist(playlistId)
      return { success: true, playlist }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getPlaylistTracks', async (_event, playlistId: string, limit?: number, offset?: number) => {
    try {
      const tracks = await spotifyApi.getPlaylistTracks(playlistId, limit, offset)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Browse Handlers ============

  ipcMain.handle('spotify:getFeaturedPlaylists', async (_event, limit?: number) => {
    try {
      const playlists = await spotifyApi.getFeaturedPlaylists(limit)
      return { success: true, playlists }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getNewReleases', async (_event, limit?: number) => {
    try {
      const albums = await spotifyApi.getNewReleases(limit)
      return { success: true, albums }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getCategories', async (_event, limit?: number) => {
    try {
      const categories = await spotifyApi.getCategories(limit)
      return { success: true, categories }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Search Handler ============

  ipcMain.handle('spotify:search', async (_event, query: string, types?: string[], limit?: number) => {
    try {
      const results = await spotifyApi.search(query, types as any, limit)
      return { success: true, results }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Artist Handlers ============

  ipcMain.handle('spotify:getArtist', async (_event, artistId: string) => {
    try {
      const artist = await spotifyApi.getArtist(artistId)
      return { success: true, artist }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getArtistTopTracks', async (_event, artistId: string, market?: string) => {
    try {
      const tracks = await spotifyApi.getArtistTopTracks(artistId, market)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getArtistAlbums', async (_event, artistId: string, limit?: number) => {
    try {
      const albums = await spotifyApi.getArtistAlbums(artistId, limit)
      return { success: true, albums }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ Album Handlers ============

  ipcMain.handle('spotify:getAlbum', async (_event, albumId: string) => {
    try {
      const album = await spotifyApi.getAlbum(albumId)
      return { success: true, album }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getAlbumTracks', async (_event, albumId: string, limit?: number) => {
    try {
      const tracks = await spotifyApi.getAlbumTracks(albumId, limit)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ============ History & Personalization ============

  ipcMain.handle('spotify:getRecentlyPlayed', async (_event, limit?: number) => {
    try {
      const tracks = await spotifyApi.getRecentlyPlayed(limit)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getTopTracks', async (_event, timeRange?: string, limit?: number) => {
    try {
      const tracks = await spotifyApi.getTopTracks(timeRange as any, limit)
      return { success: true, tracks }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getTopArtists', async (_event, timeRange?: string, limit?: number) => {
    try {
      const artists = await spotifyApi.getTopArtists(timeRange as any, limit)
      return { success: true, artists }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('spotify:getRecommendations', async (_event, options: {
    seedArtists?: string[]
    seedTracks?: string[]
    seedGenres?: string[]
    limit?: number
  }) => {
    try {
      const recommendations = await spotifyApi.getRecommendations(options)
      return { success: true, recommendations }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}

// Export the auth callback handler for use in main process
export { handleAuthCallback } from '../spotify/auth'
