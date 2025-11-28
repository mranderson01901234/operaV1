import React, { useEffect } from 'react'
import URLBar from './URLBar'
import { useBrowserStore } from '../../stores/browserStore'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'

const BrowserPanel: React.FC = () => {
  const { url, navigate, syncState } = useBrowserStore()
  const { tabs, loadTabs, activeTabId } = useTabStore()
  const { activeAgentId } = useAgentStore()

  // Load tabs when agent changes
  useEffect(() => {
    if (activeAgentId) {
      loadTabs(activeAgentId)
    }
  }, [activeAgentId, loadTabs])

  // Sync browser state on mount and when active tab changes
  useEffect(() => {
    syncState()
  }, [syncState, activeTabId])

  const handleUrlChange = (newUrl: string) => {
    // Update local state immediately for UI responsiveness
    useBrowserStore.getState().updateState({ url: newUrl })
  }

  const handleUrlSubmit = (newUrl: string) => {
    if (newUrl.trim()) {
      navigate(newUrl)
    }
  }

  const hasTabs = tabs.length > 0

  return (
    <div className="h-full w-full bg-dark-bg flex flex-col min-w-0 min-h-0">
      {/* URL Bar */}
      <URLBar url={url} onUrlChange={handleUrlChange} onUrlSubmit={handleUrlSubmit} />

      {/* Browser view */}
      <div className="flex-1 overflow-hidden bg-dark-bg min-w-0 min-h-0">
        {!hasTabs ? (
          <div className="h-full flex flex-col items-center justify-center text-dark-text-secondary">
            <svg className="w-24 h-24 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-2xl font-semibold mb-2 text-dark-text">Browser</h2>
            <p className="text-sm">Enter a URL above, or instruct the Agent to navigate and use the browser</p>
          </div>
        ) : (
          <div className="h-full w-full min-w-0 min-h-0">
            {/* BrowserView is embedded by main process - this div is just a placeholder */}
            <div className="h-full w-full bg-dark-bg min-w-0 min-h-0">
              {/* BrowserView renders here via Electron BrowserView */}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BrowserPanel

