import React from 'react'
import TabItem from './TabItem'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'

const TabBar: React.FC = () => {
  const { tabs, activeTabId, tabStates, createTab, closeTab, switchTab } = useTabStore()
  const { activeAgentId } = useAgentStore()

  const handleNewTab = async () => {
    if (activeAgentId) {
      await createTab(activeAgentId)
    }
  }

  const handleSelectTab = async (tabId: string) => {
    await switchTab(tabId)
  }

  const handleCloseTab = async (tabId: string) => {
    await closeTab(tabId)
  }

  return (
    <div className="bg-dark-panel border-b border-dark-border px-2 py-1.5 flex items-center gap-1">
      {/* Tabs */}
      <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-dark-premium">
        {tabs.map((tab) => {
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

      {/* New Tab button */}
      <button
        onClick={handleNewTab}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-dark-bg text-dark-text-secondary hover:text-dark-text transition-colors flex-shrink-0"
        title="New Tab"
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
  )
}

export default TabBar
