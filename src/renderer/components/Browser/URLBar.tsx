import React, { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { useBrowserStore } from '../../stores/browserStore'
import HistoryModal from './HistoryModal'

interface URLBarProps {
  url: string
  onUrlChange: (url: string) => void
  onUrlSubmit: (url: string) => void
}

const URLBar: React.FC<URLBarProps> = ({ url, onUrlChange, onUrlSubmit }) => {
  const { canGoBack, canGoForward, goBack, goForward, refresh, isLoading } = useBrowserStore()
  const [inputValue, setInputValue] = useState(url)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  // Sync input value when URL changes externally
  React.useEffect(() => {
    setInputValue(url)
  }, [url])



  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onUrlSubmit(inputValue)
    }
  }

  const handleBackClick = () => {
    goBack()
  }

  const handleForwardClick = () => {
    goForward()
  }

  const handleRefreshClick = () => {
    refresh()
  }

  return (
    <div className="bg-dark-panel border-b border-dark-border px-4 py-2 flex items-center gap-2 relative z-40">
      <button
        onClick={handleBackClick}
        disabled={!canGoBack}
        className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors disabled:opacity-30"
        title="Back"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={handleForwardClick}
        disabled={!canGoForward}
        className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors disabled:opacity-30"
        title="Forward"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        onClick={handleRefreshClick}
        disabled={isLoading}
        className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors disabled:opacity-30"
        title="Refresh"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      
      <div className="flex-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            onUrlChange(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or search..."
          className="w-full px-4 py-1.5 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors text-sm"
        />
      </div>
      
      <div className="flex items-center gap-1">
        <button className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors" title="Open in external browser">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            console.log('[URLBar] 3-dot button clicked - opening history modal')
            setShowHistoryModal(true)
          }}
          className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors rounded"
          title="Browser History"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* History Modal */}
      <HistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
    </div>
  )
}

export default URLBar

