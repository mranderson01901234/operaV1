import React from 'react'
import type { Tab } from '../../../shared/types'

interface TabItemProps {
  tab: Tab
  isActive: boolean
  isLoading?: boolean
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, isLoading, onSelect, onClose }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect(tab.id)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(tab.id)
  }

  // Get domain from URL for display (browser tabs only)
  const getDomain = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return url
    }
  }

  const isDocumentTab = tab.type === 'document'
  const displayTitle = tab.title || (isDocumentTab ? 'Document' : getDomain(tab.url)) || 'New Tab'

  return (
    <div
      onClick={handleClick}
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-t border border-b-0 cursor-pointer
        min-w-[120px] max-w-[200px] transition-colors
        ${
          isActive
            ? 'bg-dark-bg border-dark-border text-dark-text'
            : 'bg-dark-panel border-transparent text-dark-text-secondary hover:bg-dark-bg/50 hover:text-dark-text'
        }
      `}
    >
      {/* Favicon or Loading indicator */}
      <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
        {isLoading ? (
          <svg
            className="w-4 h-4 animate-spin text-dark-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : isDocumentTab ? (
          // Document icon for document tabs - with subtle blue tint
          <svg
            className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-blue-400/70'}`}
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
        ) : tab.favicon ? (
          <img
            src={tab.favicon}
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={(e) => {
              // Hide broken favicon images
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          // Browser icon for browser tabs
          <svg
            className="w-4 h-4 text-dark-text-secondary"
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
        )}
      </div>

      {/* Title */}
      <span className="flex-1 truncate text-sm">{displayTitle}</span>

      {/* Pin indicator */}
      {tab.isPinned && (
        <svg
          className="w-3 h-3 text-dark-text-secondary flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
        </svg>
      )}

      {/* Close button */}
      <button
        onClick={handleClose}
        className={`
          w-4 h-4 flex-shrink-0 flex items-center justify-center rounded
          transition-colors hover:bg-dark-border
          ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
        `}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

export default TabItem
