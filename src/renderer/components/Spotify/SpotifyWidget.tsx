import React, { useEffect, useRef } from 'react'
import { useSpotifyStore } from '../../stores/spotifyStore'
import { ipc } from '../../lib/ipc'

// Format milliseconds to mm:ss
const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Spotify icon
const SpotifyIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
)

// Chevron icon
const ChevronIcon: React.FC<{ expanded: boolean; className?: string }> = ({ expanded, className = 'w-4 h-4' }) => (
  <svg className={`${className} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

// Play icon
const PlayIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z"/>
  </svg>
)

// Pause icon
const PauseIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
  </svg>
)

// Skip next icon
const SkipNextIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
  </svg>
)

// Skip previous icon
const SkipPrevIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
  </svg>
)

// Shuffle icon
const ShuffleIcon: React.FC<{ className?: string; active?: boolean }> = ({ className = 'w-4 h-4', active }) => (
  <svg className={`${className} ${active ? 'text-[#1DB954]' : ''}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
  </svg>
)

// Repeat icon
const RepeatIcon: React.FC<{ className?: string; state?: 'off' | 'context' | 'track' }> = ({ className = 'w-4 h-4', state = 'off' }) => (
  <svg className={`${className} ${state !== 'off' ? 'text-[#1DB954]' : ''}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
    {state === 'track' && <text x="12" y="14" textAnchor="middle" fontSize="8" fill="currentColor">1</text>}
  </svg>
)

// Search icon
const SearchIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)

// Library icon
const LibraryIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
  </svg>
)

// Connect Button Component (when not authenticated)
const ConnectButton: React.FC = () => {
  const { clientId, login, setClientId, isLoading } = useSpotifyStore()
  const [showClientIdInput, setShowClientIdInput] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(clientId || '')

  const handleConnect = async () => {
    if (!clientId) {
      setShowClientIdInput(true)
      return
    }
    await login()
  }

  const handleSaveClientId = async () => {
    if (inputValue.trim()) {
      await setClientId(inputValue.trim())
      setShowClientIdInput(false)
    }
  }

  if (showClientIdInput) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs text-dark-text-secondary">Enter your Spotify Client ID:</p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Spotify Client ID"
          className="w-full px-3 py-2 text-xs bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-[#1DB954]"
          onKeyDown={(e) => e.key === 'Enter' && handleSaveClientId()}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSaveClientId}
            disabled={!inputValue.trim()}
            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-50 rounded transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => setShowClientIdInput(false)}
            className="px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text bg-dark-bg hover:bg-dark-border rounded transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-[10px] text-dark-text-secondary">
          Get your Client ID from the{' '}
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-[#1DB954] hover:underline">
            Spotify Developer Dashboard
          </a>
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isLoading}
      className="w-full p-4 flex flex-col items-center gap-2 text-dark-text-secondary hover:text-dark-text transition-colors group"
    >
      <SpotifyIcon className="w-10 h-10 text-[#1DB954] opacity-75 group-hover:opacity-100" />
      <span className="text-sm font-medium">
        {isLoading ? 'Connecting...' : 'Connect Spotify'}
      </span>
      <span className="text-[10px] text-dark-text-secondary">
        {clientId ? 'Click to login' : 'Add Client ID to connect'}
      </span>
    </button>
  )
}

// Device icon
const DeviceIcon: React.FC<{ type: string; className?: string }> = ({ type, className = 'w-4 h-4' }) => {
  if (type === 'Computer') {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
      </svg>
    )
  }
  if (type === 'Smartphone') {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24">
        <path d="M15.5 1h-8C6.12 1 5 2.12 5 3.5v17C5 21.88 6.12 23 7.5 23h8c1.38 0 2.5-1.12 2.5-2.5v-17C18 2.12 16.88 1 15.5 1zm-4 21c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5-4H7V4h9v14z"/>
      </svg>
    )
  }
  // Speaker/other
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  )
}

// Device Selector Component
const DeviceSelector: React.FC = () => {
  const { devices, refreshDevices, selectDevice, activeDeviceId } = useSpotifyStore()
  const [isOpen, setIsOpen] = React.useState(false)

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  if (devices.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-dark-bg rounded-lg flex items-center justify-center mb-3">
          <DeviceIcon type="Speaker" className="w-8 h-8 text-dark-text-secondary" />
        </div>
        <p className="text-sm text-dark-text-secondary">No devices available</p>
        <p className="text-[10px] text-dark-text-secondary mt-1 mb-3">
          Open Spotify on your phone, computer, or speaker
        </p>
        <button
          onClick={() => refreshDevices()}
          className="px-3 py-1.5 text-xs text-[#1DB954] hover:text-[#1ed760] bg-dark-bg hover:bg-dark-border rounded transition-colors"
        >
          Refresh devices
        </button>
      </div>
    )
  }

  const activeDevice = devices.find(d => d.id === activeDeviceId) || devices.find(d => d.is_active)

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-dark-text-secondary uppercase tracking-wider">Playing on</span>
        <button
          onClick={() => refreshDevices()}
          className="text-[10px] text-dark-text-secondary hover:text-dark-text transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="space-y-1">
        {devices.map((device) => (
          <button
            key={device.id}
            onClick={() => {
              selectDevice(device.id)
              setIsOpen(false)
            }}
            className={`w-full p-2 flex items-center gap-2 rounded transition-colors text-left ${
              device.id === activeDeviceId || device.is_active
                ? 'bg-[#1DB954]/20 text-[#1DB954]'
                : 'hover:bg-dark-border/50 text-dark-text-secondary hover:text-dark-text'
            }`}
          >
            <DeviceIcon type={device.type} className="w-5 h-5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{device.name}</p>
              <p className="text-[10px] opacity-70">{device.type}</p>
            </div>
            {(device.id === activeDeviceId || device.is_active) && (
              <div className="w-2 h-2 bg-[#1DB954] rounded-full" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// Now Playing Component
const NowPlaying: React.FC = () => {
  const { playbackState, devices, play, pause, next, previous, toggleShuffle, cycleRepeat, seek, refreshPlaybackState, refreshDevices } = useSpotifyStore()
  const progressRef = useRef<HTMLDivElement>(null)
  const [localProgress, setLocalProgress] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const [showDevices, setShowDevices] = React.useState(false)

  const track = playbackState?.item
  const isPlaying = playbackState?.is_playing
  const progress = playbackState?.progress_ms || 0
  const duration = track?.duration_ms || 0
  const albumArt = track?.album?.images?.[0]?.url
  const activeDevice = playbackState?.device

  // Update local progress
  useEffect(() => {
    if (!isDragging) {
      setLocalProgress(progress)
    }
  }, [progress, isDragging])

  // Auto-refresh playback state
  useEffect(() => {
    const interval = setInterval(() => {
      refreshPlaybackState()
    }, 3000)
    return () => clearInterval(interval)
  }, [refreshPlaybackState])

  // Progress bar interaction
  const handleProgressClick = (e: React.MouseEvent) => {
    if (!progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const newPosition = Math.floor(percent * duration)
    seek(newPosition)
    setLocalProgress(newPosition)
  }

  // Show device selector if no track and no active device
  if (!track && !activeDevice) {
    return <DeviceSelector />
  }

  if (!track) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-dark-bg rounded-lg flex items-center justify-center mb-3">
          <SpotifyIcon className="w-8 h-8 text-dark-text-secondary" />
        </div>
        <p className="text-sm text-dark-text-secondary">No track playing</p>
        <p className="text-[10px] text-dark-text-secondary mt-1 mb-2">
          {activeDevice ? `Connected to ${activeDevice.name}` : 'Select a device to start playing'}
        </p>
        {activeDevice && (
          <button
            onClick={() => setShowDevices(!showDevices)}
            className="text-[10px] text-[#1DB954] hover:underline"
          >
            Change device
          </button>
        )}
        {showDevices && (
          <div className="mt-3 w-full">
            <DeviceSelector />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      {/* Album Art & Track Info */}
      <div className="flex gap-3">
        {albumArt ? (
          <img src={albumArt} alt={track.album?.name} className="w-14 h-14 rounded-md shadow-lg" />
        ) : (
          <div className="w-14 h-14 bg-dark-bg rounded-md flex items-center justify-center">
            <SpotifyIcon className="w-6 h-6 text-dark-text-secondary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-text truncate">{track.name}</p>
          <p className="text-xs text-dark-text-secondary truncate">
            {track.artists?.map(a => a.name).join(', ')}
          </p>
          <p className="text-[10px] text-dark-text-secondary/70 truncate">{track.album?.name}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div
          ref={progressRef}
          className="h-1 bg-dark-bg rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-dark-text-secondary group-hover:bg-[#1DB954] rounded-full transition-colors relative"
            style={{ width: `${duration ? (localProgress / duration) * 100 : 0}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-dark-text-secondary">
          <span>{formatTime(localProgress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={toggleShuffle}
          className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
          title="Shuffle"
        >
          <ShuffleIcon className="w-4 h-4" active={playbackState?.shuffle_state} />
        </button>

        <button
          onClick={previous}
          className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
          title="Previous"
        >
          <SkipPrevIcon className="w-5 h-5" />
        </button>

        <button
          onClick={isPlaying ? pause : () => play()}
          className="p-2 bg-white text-black rounded-full hover:scale-105 transition-transform"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>

        <button
          onClick={next}
          className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
          title="Next"
        >
          <SkipNextIcon className="w-5 h-5" />
        </button>

        <button
          onClick={cycleRepeat}
          className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
          title="Repeat"
        >
          <RepeatIcon className="w-4 h-4" state={playbackState?.repeat_state} />
        </button>
      </div>

      {/* Device indicator */}
      {activeDevice && (
        <div className="pt-2 border-t border-dark-border/50">
          <button
            onClick={() => setShowDevices(!showDevices)}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] text-dark-text-secondary hover:text-[#1DB954] transition-colors"
          >
            <DeviceIcon type={activeDevice.type} className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{activeDevice.name}</span>
          </button>
          {showDevices && (
            <div className="mt-2">
              <DeviceSelector />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Search View
const SearchView: React.FC = () => {
  const { searchQuery, searchResults, setSearchQuery, search, play, addToQueue } = useSpotifyStore()
  const [localQuery, setLocalQuery] = React.useState(searchQuery)
  const debounceRef = useRef<NodeJS.Timeout>()

  const handleSearch = (query: string) => {
    setLocalQuery(query)
    setSearchQuery(query)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      search(query)
    }, 300)
  }

  const handlePlayTrack = (uri: string) => {
    play({ uris: [uri] })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b border-dark-border">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-text-secondary" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search tracks, artists, albums..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-dark-bg border border-dark-border rounded-lg text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-[#1DB954]"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto scrollbar-dark-premium p-2">
        {searchResults?.tracks?.items?.map((track: any) => (
          <button
            key={track.id}
            onClick={() => handlePlayTrack(track.uri)}
            className="w-full p-2 flex items-center gap-2 rounded hover:bg-dark-border/50 transition-colors text-left group"
          >
            {track.album?.images?.[2]?.url ? (
              <img src={track.album.images[2].url} alt="" className="w-10 h-10 rounded" />
            ) : (
              <div className="w-10 h-10 bg-dark-bg rounded flex items-center justify-center">
                <SpotifyIcon className="w-4 h-4 text-dark-text-secondary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-dark-text truncate">{track.name}</p>
              <p className="text-[10px] text-dark-text-secondary truncate">
                {track.artists?.map((a: any) => a.name).join(', ')}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                addToQueue(track.uri)
              }}
              className="p-1 opacity-0 group-hover:opacity-100 text-dark-text-secondary hover:text-dark-text transition-opacity"
              title="Add to queue"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </button>
        ))}

        {!searchResults && !localQuery && (
          <div className="text-center py-8">
            <SearchIcon className="w-8 h-8 mx-auto text-dark-text-secondary/50 mb-2" />
            <p className="text-xs text-dark-text-secondary">Search for music</p>
          </div>
        )}

        {localQuery && searchResults?.tracks?.items?.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-dark-text-secondary">No results found</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Back arrow icon
const BackIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

// Playlists View
const PlaylistsView: React.FC = () => {
  const { playlists, play, loadPlaylists, addToQueue } = useSpotifyStore()
  const [selectedPlaylist, setSelectedPlaylist] = React.useState<any>(null)
  const [playlistTracks, setPlaylistTracks] = React.useState<any[]>([])
  const [loadingTracks, setLoadingTracks] = React.useState(false)

  useEffect(() => {
    loadPlaylists()
  }, [loadPlaylists])

  const handleSelectPlaylist = async (playlist: any) => {
    setSelectedPlaylist(playlist)
    setLoadingTracks(true)
    try {
      const result = await ipc.spotify.getPlaylistTracks(playlist.id, 100)
      if (result.success && result.tracks) {
        setPlaylistTracks(result.tracks.items || [])
      }
    } catch (error) {
      console.error('Failed to load playlist tracks:', error)
    } finally {
      setLoadingTracks(false)
    }
  }

  const handleBack = () => {
    setSelectedPlaylist(null)
    setPlaylistTracks([])
  }

  const handlePlayPlaylist = (uri: string) => {
    play({ contextUri: uri })
  }

  const handlePlayTrack = (trackUri: string, playlistUri: string, offset: number) => {
    // Play track within playlist context
    play({ contextUri: playlistUri, uris: undefined })
    // Small delay then seek to the specific track by playing it directly
    setTimeout(() => {
      play({ uris: [trackUri] })
    }, 100)
  }

  // Show playlist tracks view
  if (selectedPlaylist) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with back button */}
        <div className="p-2 border-b border-dark-border flex items-center gap-2">
          <button
            onClick={handleBack}
            className="p-1 text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedPlaylist.images?.[0]?.url ? (
              <img src={selectedPlaylist.images[0].url} alt="" className="w-8 h-8 rounded" />
            ) : (
              <div className="w-8 h-8 bg-dark-bg rounded flex items-center justify-center">
                <LibraryIcon className="w-4 h-4 text-dark-text-secondary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-dark-text truncate font-medium">{selectedPlaylist.name}</p>
              <p className="text-[10px] text-dark-text-secondary">{selectedPlaylist.tracks?.total} tracks</p>
            </div>
          </div>
          <button
            onClick={() => handlePlayPlaylist(selectedPlaylist.uri)}
            className="px-3 py-1 text-[10px] font-medium text-white bg-[#1DB954] hover:bg-[#1ed760] rounded-full transition-colors"
          >
            Play All
          </button>
        </div>

        {/* Tracks list */}
        <div className="flex-1 overflow-y-auto scrollbar-dark-premium">
          {loadingTracks ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            playlistTracks.map((item: any, index: number) => {
              const track = item.track
              if (!track) return null
              return (
                <button
                  key={`${track.id}-${index}`}
                  onClick={() => play({ uris: [track.uri] })}
                  className="w-full p-2 flex items-center gap-2 hover:bg-dark-border/50 transition-colors text-left group"
                >
                  <span className="w-5 text-[10px] text-dark-text-secondary text-right">{index + 1}</span>
                  {track.album?.images?.[2]?.url ? (
                    <img src={track.album.images[2].url} alt="" className="w-8 h-8 rounded" />
                  ) : (
                    <div className="w-8 h-8 bg-dark-bg rounded flex items-center justify-center">
                      <SpotifyIcon className="w-3 h-3 text-dark-text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-dark-text truncate">{track.name}</p>
                    <p className="text-[10px] text-dark-text-secondary truncate">
                      {track.artists?.map((a: any) => a.name).join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      addToQueue(track.uri)
                    }}
                    className="p-1 opacity-0 group-hover:opacity-100 text-dark-text-secondary hover:text-dark-text transition-opacity"
                    title="Add to queue"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Show playlists list
  return (
    <div className="flex-1 overflow-y-auto scrollbar-dark-premium p-2">
      {playlists.map((playlist: any) => (
        <button
          key={playlist.id}
          onClick={() => handleSelectPlaylist(playlist)}
          className="w-full p-2 flex items-center gap-2 rounded hover:bg-dark-border/50 transition-colors text-left group"
        >
          {playlist.images?.[0]?.url ? (
            <img src={playlist.images[0].url} alt="" className="w-10 h-10 rounded" />
          ) : (
            <div className="w-10 h-10 bg-dark-bg rounded flex items-center justify-center">
              <LibraryIcon className="w-4 h-4 text-dark-text-secondary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-dark-text truncate">{playlist.name}</p>
            <p className="text-[10px] text-dark-text-secondary truncate">
              {playlist.tracks?.total || 0} tracks
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePlayPlaylist(playlist.uri)
            }}
            className="p-1.5 opacity-0 group-hover:opacity-100 text-dark-text-secondary hover:text-[#1DB954] transition-all"
            title="Play playlist"
          >
            <PlayIcon className="w-4 h-4" />
          </button>
        </button>
      ))}

      {playlists.length === 0 && (
        <div className="text-center py-8">
          <LibraryIcon className="w-8 h-8 mx-auto text-dark-text-secondary/50 mb-2" />
          <p className="text-xs text-dark-text-secondary">No playlists found</p>
        </div>
      )}
    </div>
  )
}

// Mini Player Bar (shown when collapsed and playing)
const MiniPlayer: React.FC = () => {
  const { playbackState, play, pause, next, previous } = useSpotifyStore()

  const track = playbackState?.item
  const isPlaying = playbackState?.is_playing
  const albumArt = track?.album?.images?.[2]?.url || track?.album?.images?.[0]?.url

  if (!track) return null

  return (
    <div className="px-3 py-2 border-t border-dark-border bg-dark-panel/50">
      <div className="flex items-center gap-2">
        {/* Album art */}
        {albumArt ? (
          <img src={albumArt} alt="" className="w-10 h-10 rounded shadow" />
        ) : (
          <div className="w-10 h-10 bg-dark-bg rounded flex items-center justify-center">
            <SpotifyIcon className="w-4 h-4 text-dark-text-secondary" />
          </div>
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-dark-text truncate">{track.name}</p>
          <p className="text-[10px] text-dark-text-secondary truncate">
            {track.artists?.map((a: any) => a.name).join(', ')}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              previous()
            }}
            className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Previous"
          >
            <SkipPrevIcon className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              isPlaying ? pause() : play()
            }}
            className="p-1.5 bg-white text-black rounded-full hover:scale-105 transition-transform"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors"
            title="Next"
          >
            <SkipNextIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Main SpotifyWidget Component
const SpotifyWidget: React.FC = () => {
  const {
    isExpanded,
    toggleExpanded,
    isAuthenticated,
    activeView,
    setActiveView,
    profile,
    logout,
    initialize,
    handleAuthCallback,
    playerReady,
    sdkError,
    playbackState,
  } = useSpotifyStore()

  // Initialize on mount
  useEffect(() => {
    initialize()

    // Listen for auth callback
    const handleCallback = (result: { success: boolean; error?: string }) => {
      handleAuthCallback(result)
    }

    ipc.spotify.onAuthCallback(handleCallback)

    return () => {
      ipc.spotify.removeAuthCallbackListener(handleCallback)
    }
  }, [initialize, handleAuthCallback])

  const hasTrackPlaying = playbackState?.item != null

  return (
    <div className="border-t border-dark-border flex-shrink-0">
      {/* Header Bar */}
      <button
        onClick={toggleExpanded}
        className="w-full px-3 py-2 flex items-center justify-between text-dark-text-secondary hover:text-dark-text transition-colors group"
      >
        <div className="flex items-center gap-2">
          <SpotifyIcon className="w-5 h-5 text-[#1DB954] group-hover:text-[#1ed760]" />
          <span className="text-sm font-medium">Spotify</span>
          {isAuthenticated && !hasTrackPlaying && profile && (
            <span className="text-[10px] text-dark-text-secondary/70 truncate max-w-[80px]">
              {profile.display_name}
            </span>
          )}
        </div>
        <ChevronIcon expanded={isExpanded} className="w-4 h-4" />
      </button>

      {/* Mini Player (shown when collapsed and has track) */}
      {!isExpanded && isAuthenticated && hasTrackPlaying && (
        <MiniPlayer />
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-dark-border" style={{ height: '320px' }}>
          {!isAuthenticated ? (
            <ConnectButton />
          ) : (
            <div className="flex flex-col h-full">
              {/* Navigation Tabs */}
              <div className="flex border-b border-dark-border">
                <button
                  onClick={() => setActiveView('player')}
                  className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
                    activeView === 'player'
                      ? 'text-[#1DB954] border-b-2 border-[#1DB954]'
                      : 'text-dark-text-secondary hover:text-dark-text'
                  }`}
                >
                  Now Playing
                </button>
                <button
                  onClick={() => setActiveView('search')}
                  className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
                    activeView === 'search'
                      ? 'text-[#1DB954] border-b-2 border-[#1DB954]'
                      : 'text-dark-text-secondary hover:text-dark-text'
                  }`}
                >
                  Search
                </button>
                <button
                  onClick={() => setActiveView('playlists')}
                  className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
                    activeView === 'playlists'
                      ? 'text-[#1DB954] border-b-2 border-[#1DB954]'
                      : 'text-dark-text-secondary hover:text-dark-text'
                  }`}
                >
                  Playlists
                </button>
              </div>

              {/* Active View Content */}
              <div className="flex-1 overflow-hidden">
                {activeView === 'player' && <NowPlaying />}
                {activeView === 'search' && <SearchView />}
                {activeView === 'playlists' && <PlaylistsView />}
              </div>

              {/* SDK Error Alert */}
              {sdkError && (
                <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20">
                  <p className="text-[10px] text-red-400">{sdkError}</p>
                </div>
              )}

              {/* Footer with Logout */}
              <div className="px-3 py-2 border-t border-dark-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {profile?.images?.[0]?.url && (
                    <img src={profile.images[0].url} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-[10px] text-dark-text-secondary truncate max-w-[100px]">
                      {profile?.display_name}
                    </span>
                    {playerReady && (
                      <span className="text-[8px] text-[#1DB954] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-[#1DB954] rounded-full animate-pulse" />
                        Playing in app
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="text-[10px] text-dark-text-secondary hover:text-red-400 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SpotifyWidget
