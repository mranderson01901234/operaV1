import React, { useState } from 'react'
import AgentList from './AgentList'
import SearchBar from './SearchBar'
import ViewToggle from './ViewToggle'
import { useAgentStore } from '../../stores/agentStore'
import SettingsModal from '../Settings/SettingsModal'
import SpotifyWidget from '../Spotify/SpotifyWidget'

const Sidebar: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const { createAgent, isLoading, getActiveAgent } = useAgentStore()

  const handleNewChat = async () => {
    // Use the current active agent's model/provider, or fall back to defaults
    const activeAgent = getActiveAgent()
    if (activeAgent) {
      // Create new agent with the same model/provider as the current active agent
      await createAgent(undefined, activeAgent.model, activeAgent.provider)
    } else {
      // No active agent, use defaults from localStorage
      await createAgent()
    }
  }

  return (
    <div className="w-60 h-full bg-dark-panel border-r border-dark-border flex flex-col min-w-0 min-h-0 overflow-hidden">
      {/* View Toggle - Browser/Document */}
      <ViewToggle />

      {/* Search Bar */}
      <div className="p-4 border-b border-dark-border flex-shrink-0 min-w-0">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-b border-dark-border flex-shrink-0 min-w-0">
        <button 
          onClick={handleNewChat}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded text-dark-text text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Creating...' : 'New Chat'}
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-dark-premium min-w-0 min-h-0">
        <AgentList searchQuery={searchQuery} />
      </div>

      {/* Spotify Widget */}
      <SpotifyWidget />

      {/* Settings Section - Icon only, on same line conceptually with Spotify toggle above */}
      <div className="px-4 py-3 border-t border-dark-border flex-shrink-0 min-w-0 flex items-center justify-between">
        <span className="text-[10px] text-dark-text-secondary/50 uppercase tracking-wider">Settings</span>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-dark-text-secondary hover:text-dark-text hover:bg-dark-border/50 rounded-lg transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default Sidebar

