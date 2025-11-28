import React, { useState } from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'
import { ipc } from '../../lib/ipc'

const ViewToggle: React.FC = () => {
  const { tabs, activeTabId, switchTab, createTab, getActiveTabType, loadTabs } = useTabStore()
  const { activeAgentId } = useAgentStore()
  const [isSwitching, setIsSwitching] = useState(false)

  const currentViewType = getActiveTabType()
  const isBrowserView = currentViewType === 'browser'
  const isDocumentView = currentViewType === 'document'

  const handleToggle = async () => {
    if (!activeAgentId || isSwitching) {
      return
    }

    setIsSwitching(true)

    try {
      const targetType: 'browser' | 'document' = isBrowserView ? 'document' : 'browser'

      // Check if there's already a tab of the target type
      const existingTab = tabs.find(tab => tab.type === targetType && tab.agentId === activeAgentId)

      if (existingTab) {
        // Switch to existing tab
        await switchTab(existingTab.id)
      } else {
        // Create new tab of target type
        if (targetType === 'browser') {
          // Create browser tab (default to Google)
          await createTab(activeAgentId, 'https://www.google.com', true)
        } else {
          // For document view, check if there are any documents for this agent
          try {
            const documentsResult = await ipc.document.getByAgent(activeAgentId)
            if (documentsResult.success && documentsResult.documents && documentsResult.documents.length > 0) {
              // Open the first document
              const firstDoc = documentsResult.documents[0]
              const createTabResult = await ipc.document.createTab({
                agentId: activeAgentId,
                dataUri: '', // Will be loaded from file
                filename: firstDoc.name,
                mimeType: firstDoc.mimeType,
                size: firstDoc.fileSize,
                makeActive: true,
              })
              if (!createTabResult.success) {
                console.warn('Failed to create document tab:', createTabResult.error)
                // Reload tabs to see current state
                await loadTabs(activeAgentId)
              }
            } else {
              // No documents available - show message in console and don't switch
              console.info('No documents available. Open a file first to use Document Editor.')
              // Could show a toast notification here instead of alert
            }
          } catch (error) {
            console.error('Error switching to document view:', error)
          }
        }
      }
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div className="p-4 border-b border-dark-border">
      <button
        onClick={handleToggle}
        disabled={isSwitching || !activeAgentId}
        className="w-full px-4 py-2.5 bg-dark-bg hover:bg-dark-border border border-dark-border rounded text-dark-text text-sm font-medium transition-colors flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
        title={isBrowserView ? 'Switch to Document Editor' : 'Switch to Browser'}
      >
        {isBrowserView ? (
          // Show document icon when in browser view (clicking will switch to document)
          <>
            <svg 
              className="w-5 h-5 text-dark-text-secondary group-hover:text-dark-text transition-colors" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
              />
            </svg>
            <span>Document Editor</span>
          </>
        ) : (
          // Show browser icon when in document view (clicking will switch to browser)
          <>
            <svg 
              className="w-5 h-5 text-dark-text-secondary group-hover:text-dark-text transition-colors" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" 
              />
            </svg>
            <span>Browser</span>
          </>
        )}
      </button>
    </div>
  )
}

export default ViewToggle

