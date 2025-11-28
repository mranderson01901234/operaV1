import { getAccessToken } from './auth'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'

// Helper for authenticated API requests
async function spotifyFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new Error('Not authenticated with Spotify')
  }

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Handle 204 No Content
  if (response.status === 204) {
    return { success: true }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(error.error?.message || 'Spotify API request failed')
  }

  return response.json()
}

// ============ Playback Control ============

export async function getPlaybackState(): Promise<any> {
  try {
    return await spotifyFetch('/me/player')
  } catch (error) {
    // No active device returns empty
    return null
  }
}

export async function getCurrentlyPlaying(): Promise<any> {
  try {
    return await spotifyFetch('/me/player/currently-playing')
  } catch (error) {
    return null
  }
}

export async function play(options?: {
  deviceId?: string
  contextUri?: string
  uris?: string[]
  positionMs?: number
}): Promise<void> {
  const params = options?.deviceId ? `?device_id=${options.deviceId}` : ''
  const body: any = {}

  if (options?.contextUri) body.context_uri = options.contextUri
  if (options?.uris) body.uris = options.uris
  if (options?.positionMs !== undefined) body.position_ms = options.positionMs

  await spotifyFetch(`/me/player/play${params}`, {
    method: 'PUT',
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  })
}

export async function pause(deviceId?: string): Promise<void> {
  const params = deviceId ? `?device_id=${deviceId}` : ''
  await spotifyFetch(`/me/player/pause${params}`, { method: 'PUT' })
}

export async function skipToNext(deviceId?: string): Promise<void> {
  const params = deviceId ? `?device_id=${deviceId}` : ''
  await spotifyFetch(`/me/player/next${params}`, { method: 'POST' })
}

export async function skipToPrevious(deviceId?: string): Promise<void> {
  const params = deviceId ? `?device_id=${deviceId}` : ''
  await spotifyFetch(`/me/player/previous${params}`, { method: 'POST' })
}

export async function seek(positionMs: number, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ position_ms: positionMs.toString() })
  if (deviceId) params.append('device_id', deviceId)
  await spotifyFetch(`/me/player/seek?${params}`, { method: 'PUT' })
}

export async function setVolume(volumePercent: number, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ volume_percent: Math.round(volumePercent).toString() })
  if (deviceId) params.append('device_id', deviceId)
  await spotifyFetch(`/me/player/volume?${params}`, { method: 'PUT' })
}

export async function setShuffle(state: boolean, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ state: state.toString() })
  if (deviceId) params.append('device_id', deviceId)
  await spotifyFetch(`/me/player/shuffle?${params}`, { method: 'PUT' })
}

export async function setRepeat(state: 'track' | 'context' | 'off', deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ state })
  if (deviceId) params.append('device_id', deviceId)
  await spotifyFetch(`/me/player/repeat?${params}`, { method: 'PUT' })
}

export async function getDevices(): Promise<any> {
  return await spotifyFetch('/me/player/devices')
}

export async function transferPlayback(deviceId: string, play?: boolean): Promise<void> {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play: play ?? false,
    }),
  })
}

// ============ Queue ============

export async function getQueue(): Promise<any> {
  return await spotifyFetch('/me/player/queue')
}

export async function addToQueue(uri: string, deviceId?: string): Promise<void> {
  const params = new URLSearchParams({ uri })
  if (deviceId) params.append('device_id', deviceId)
  await spotifyFetch(`/me/player/queue?${params}`, { method: 'POST' })
}

// ============ Library ============

export async function getSavedTracks(limit = 50, offset = 0): Promise<any> {
  return await spotifyFetch(`/me/tracks?limit=${limit}&offset=${offset}`)
}

export async function getSavedAlbums(limit = 50, offset = 0): Promise<any> {
  return await spotifyFetch(`/me/albums?limit=${limit}&offset=${offset}`)
}

export async function getFollowedArtists(limit = 50, after?: string): Promise<any> {
  const params = new URLSearchParams({ type: 'artist', limit: limit.toString() })
  if (after) params.append('after', after)
  return await spotifyFetch(`/me/following?${params}`)
}

export async function saveTrack(trackId: string): Promise<void> {
  await spotifyFetch(`/me/tracks?ids=${trackId}`, { method: 'PUT' })
}

export async function removeTrack(trackId: string): Promise<void> {
  await spotifyFetch(`/me/tracks?ids=${trackId}`, { method: 'DELETE' })
}

export async function checkSavedTracks(trackIds: string[]): Promise<boolean[]> {
  return await spotifyFetch(`/me/tracks/contains?ids=${trackIds.join(',')}`)
}

// ============ Playlists ============

export async function getUserPlaylists(limit = 50, offset = 0): Promise<any> {
  return await spotifyFetch(`/me/playlists?limit=${limit}&offset=${offset}`)
}

export async function getPlaylist(playlistId: string): Promise<any> {
  return await spotifyFetch(`/playlists/${playlistId}`)
}

export async function getPlaylistTracks(playlistId: string, limit = 100, offset = 0): Promise<any> {
  return await spotifyFetch(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`)
}

// ============ Browse ============

export async function getFeaturedPlaylists(limit = 20): Promise<any> {
  return await spotifyFetch(`/browse/featured-playlists?limit=${limit}`)
}

export async function getNewReleases(limit = 20): Promise<any> {
  return await spotifyFetch(`/browse/new-releases?limit=${limit}`)
}

export async function getCategories(limit = 20): Promise<any> {
  return await spotifyFetch(`/browse/categories?limit=${limit}`)
}

export async function getCategoryPlaylists(categoryId: string, limit = 20): Promise<any> {
  return await spotifyFetch(`/browse/categories/${categoryId}/playlists?limit=${limit}`)
}

// ============ Search ============

export async function search(
  query: string,
  types: ('album' | 'artist' | 'playlist' | 'track' | 'show' | 'episode')[] = ['track', 'artist', 'album', 'playlist'],
  limit = 20
): Promise<any> {
  const params = new URLSearchParams({
    q: query,
    type: types.join(','),
    limit: limit.toString(),
  })
  return await spotifyFetch(`/search?${params}`)
}

// ============ Artists ============

export async function getArtist(artistId: string): Promise<any> {
  return await spotifyFetch(`/artists/${artistId}`)
}

export async function getArtistTopTracks(artistId: string, market = 'US'): Promise<any> {
  return await spotifyFetch(`/artists/${artistId}/top-tracks?market=${market}`)
}

export async function getArtistAlbums(artistId: string, limit = 20): Promise<any> {
  return await spotifyFetch(`/artists/${artistId}/albums?limit=${limit}`)
}

export async function getRelatedArtists(artistId: string): Promise<any> {
  return await spotifyFetch(`/artists/${artistId}/related-artists`)
}

// ============ Albums ============

export async function getAlbum(albumId: string): Promise<any> {
  return await spotifyFetch(`/albums/${albumId}`)
}

export async function getAlbumTracks(albumId: string, limit = 50): Promise<any> {
  return await spotifyFetch(`/albums/${albumId}/tracks?limit=${limit}`)
}

// ============ Tracks ============

export async function getTrack(trackId: string): Promise<any> {
  return await spotifyFetch(`/tracks/${trackId}`)
}

export async function getTrackAudioFeatures(trackId: string): Promise<any> {
  return await spotifyFetch(`/audio-features/${trackId}`)
}

// ============ Recently Played ============

export async function getRecentlyPlayed(limit = 50): Promise<any> {
  return await spotifyFetch(`/me/player/recently-played?limit=${limit}`)
}

// ============ Top Items ============

export async function getTopTracks(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit = 50): Promise<any> {
  return await spotifyFetch(`/me/top/tracks?time_range=${timeRange}&limit=${limit}`)
}

export async function getTopArtists(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit = 50): Promise<any> {
  return await spotifyFetch(`/me/top/artists?time_range=${timeRange}&limit=${limit}`)
}

// ============ Recommendations ============

export async function getRecommendations(options: {
  seedArtists?: string[]
  seedTracks?: string[]
  seedGenres?: string[]
  limit?: number
}): Promise<any> {
  const params = new URLSearchParams()
  if (options.seedArtists?.length) params.append('seed_artists', options.seedArtists.join(','))
  if (options.seedTracks?.length) params.append('seed_tracks', options.seedTracks.join(','))
  if (options.seedGenres?.length) params.append('seed_genres', options.seedGenres.join(','))
  if (options.limit) params.append('limit', options.limit.toString())

  return await spotifyFetch(`/recommendations?${params}`)
}
