import React from 'react'
import TabItem from './TabItem'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'

const UnifiedTabBar: React.FC = () => {
  const { tabs, activeTabId, tabStates, createTab, closeTab, switchTab } = useTabStore()
  const { activeAgentId } = useAgentStore()

  // Filter tabs by active agent and type
  const agentTabs = tabs.filter(tab => tab.agentId === activeAgentId)
  const browserTabs = agentTabs.filter(tab => tab.type === 'browser' || !tab.type) // Include legacy tabs without type
  const documentTabs = agentTabs.filter(tab => tab.type === 'document')

  const handleNewBrowserTab = async () => {
    if (activeAgentId) {
      await createTab(activeAgentId, 'https://www.google.com', true)
    }
  }

  const handleSelectTab = async (tabId: string) => {
    await switchTab(tabId)
  }

  const handleCloseTab = async (tabId: string) => {
    await closeTab(tabId)
  }

  return (
    <div className="bg-dark-panel border-b border-dark-border px-2 py-1.5 flex items-center">
      {/* LEFT SIDE: Browser Tabs Section */}
      <div className="flex-1 flex items-center gap-1 min-w-0">
        <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
          <svg className="w-4 h-4 text-dark-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span className="text-xs text-dark-text-secondary font-medium">Browser</span>
        </div>
        {browserTabs.length > 0 ? (
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-dark-premium min-w-0 flex-1">
            {browserTabs.map((tab) => {
              const tabState = tabStates.get(tab.id)
              return (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isLoading={tabState?.isLoading}
                  onSelect={handleSelectTab}
                  onClose={handleCloseTab}
                />
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-dark-text-secondary/50 italic px-2">No browser tabs</span>
        )}
        <button
          onClick={handleNewBrowserTab}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-dark-bg text-dark-text-secondary hover:text-dark-text transition-colors flex-shrink-0"
          title="New Browser Tab"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* CENTER DIVIDER */}
      <div className="flex items-center flex-shrink-0 px-3">
        <div className="w-px h-8 bg-dark-border" />
        <div className="w-px h-6 bg-dark-text-secondary/20 mx-0.5" />
        <div className="w-px h-8 bg-dark-border" />
      </div>

      {/* RIGHT SIDE: Document Tabs Section */}
      <div className="flex-1 flex items-center gap-1 min-w-0 justify-end">
        <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
          <svg className="w-4 h-4 text-blue-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs text-dark-text-secondary font-medium">Documents</span>
        </div>
        {documentTabs.length > 0 ? (
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-dark-premium min-w-0 flex-1">
            {documentTabs.map((tab) => {
              const tabState = tabStates.get(tab.id)
              return (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isLoading={tabState?.isLoading}
                  onSelect={handleSelectTab}
                  onClose={handleCloseTab}
                />
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-dark-text-secondary/50 italic px-2">No documents</span>
        )}
      </div>
    </div>
  )
}

export default UnifiedTabBar

