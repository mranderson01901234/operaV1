import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useTabStore } from '../../stores/tabStore'
import { ipc } from '../../lib/ipc'
import type { TabHistoryEntry } from '../../../shared/types'
import { useBrowserStore } from '../../stores/browserStore'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
}

interface GroupedHistory {
  dateLabel: string
  entries: TabHistoryEntry[]
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const { getActiveTab, tabs, switchTab } = useTabStore()
  const { navigate } = useBrowserStore()
  const [history, setHistory] = useState<TabHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const modalRef = useRef<HTMLDivElement>(null)

  const activeTab = getActiveTab()

  useEffect(() => {
    if (isOpen && activeTab) {
      loadHistory()
      setSearchQuery('')
      setSelectedEntries(new Set())
      
      // Blur any active elements and focus the modal
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      // Focus the modal container to ensure it's the active element
      setTimeout(() => {
        modalRef.current?.focus()
      }, 100)
    }
  }, [isOpen, activeTab])

  const loadHistory = async () => {
    if (!activeTab) return

    setLoading(true)
    setError(null)
    try {
      const result = await ipc.tabHistory.get(activeTab.id, 100)
      if (result.success && result.history) {
        setHistory(result.history)
      } else {
        setError(result.error || 'Failed to load history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  const handleClearHistory = async () => {
    if (!activeTab) return

    if (!confirm('Are you sure you want to clear all history for this tab?')) {
      return
    }

    try {
      const result = await ipc.tabHistory.clear(activeTab.id)
      if (result.success) {
        setHistory([])
        setSelectedEntries(new Set())
      } else {
        setError(result.error || 'Failed to clear history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history')
    }
  }

  const handleNavigateTo = async (url: string) => {
    // Ensure we're on a browser tab (not document tab)
    let targetTabId: string | undefined
    const currentTab = getActiveTab()
    
    if (currentTab && currentTab.type === 'document') {
      // Find a browser tab for this agent, or create one
      const browserTab = tabs.find(t => t.agentId === currentTab.agentId && (t.type === 'browser' || !t.type))
      if (browserTab) {
        await switchTab(browserTab.id)
        targetTabId = browserTab.id
      } else {
        // Create a new browser tab if none exists
        const { createTab } = useTabStore.getState()
        const newTab = await createTab(currentTab.agentId, url, true)
        if (newTab) {
          targetTabId = newTab.id
        }
      }
    } else if (currentTab) {
      targetTabId = currentTab.id
    }
    
    await navigate(url, targetTabId)
    // Don't close modal - let user manually close it
  }

  const handleDeleteEntry = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const result = await ipc.tabHistory.delete(entryId)
      if (result.success) {
        setHistory(prev => prev.filter(entry => entry.id !== entryId))
        setSelectedEntries(prev => {
          const newSet = new Set(prev)
          newSet.delete(entryId)
          return newSet
        })
      } else {
        setError(result.error || 'Failed to delete history entry')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete history entry')
    }
  }

  const handleToggleSelect = (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEntries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(entryId)) {
        newSet.delete(entryId)
      } else {
        newSet.add(entryId)
      }
      return newSet
    })
  }

  const handleDeleteSelected = async () => {
    if (selectedEntries.size === 0) return

    for (const entryId of selectedEntries) {
      try {
        await ipc.tabHistory.delete(entryId)
      } catch (err) {
        console.error('Failed to delete entry:', entryId, err)
      }
    }
    setHistory(prev => prev.filter(entry => !selectedEntries.has(entry.id)))
    setSelectedEntries(new Set())
  }

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const formatDateHeader = (date: Date): string => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return `Today - ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    } else if (diffDays === 1) {
      return `Yesterday - ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  const getDomain = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return url
    }
  }

  const getFavicon = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`
    } catch {
      return ''
    }
  }

  // Filter and group history by date
  const filteredAndGroupedHistory = useMemo(() => {
    let filtered = history

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = history.filter(entry => 
        entry.title.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        getDomain(entry.url).toLowerCase().includes(query)
      )
    }

    // Group by date
    const grouped = new Map<string, TabHistoryEntry[]>()
    
    filtered.forEach(entry => {
      const dateKey = new Date(entry.visitedAt).toDateString()
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(entry)
    })

    // Convert to array and sort by date (newest first)
    const groupedArray: GroupedHistory[] = Array.from(grouped.entries())
      .map(([dateKey, entries]) => ({
        dateLabel: formatDateHeader(entries[0].visitedAt),
        entries: entries.sort((a, b) => b.visitedAt.getTime() - a.visitedAt.getTime())
      }))
      .sort((a, b) => b.entries[0].visitedAt.getTime() - a.entries[0].visitedAt.getTime())

    return groupedArray
  }, [history, searchQuery])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[10000]" onClick={onClose}>
      {/* Position modal on the left side (chat panel area) */}
      <div className="fixed left-[240px] top-0 bottom-0 right-[50%] flex items-center justify-center p-4">
        <div
          ref={modalRef}
          tabIndex={-1}
          className="bg-dark-panel border border-dark-border rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-dark-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-dark-text">Opera History</h2>
              <button
                onClick={onClose}
                className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors rounded hover:bg-dark-bg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history"
                className="w-full pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors text-sm"
              />
            </div>

            {/* Actions Bar */}
            {selectedEntries.size > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-dark-text-secondary">
                  {selectedEntries.size} selected
                </span>
                <button
                  onClick={handleDeleteSelected}
                  className="px-3 py-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-dark-premium">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="w-8 h-8 animate-spin text-dark-text-secondary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : error ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-red-500">{error}</p>
                <button
                  onClick={loadHistory}
                  className="mt-4 px-4 py-2 text-sm bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors text-dark-text"
                >
                  Retry
                </button>
              </div>
            ) : filteredAndGroupedHistory.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-dark-text-secondary opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-dark-text-secondary">
                  {searchQuery ? 'No results found' : 'No history entries'}
                </p>
              </div>
            ) : (
              <div>
                {filteredAndGroupedHistory.map((group) => (
                  <div key={group.dateLabel} className="border-b border-dark-border/50">
                    {/* Date Header */}
                    <div className="px-6 py-3 bg-dark-bg/50">
                      <h3 className="text-sm font-medium text-dark-text">{group.dateLabel}</h3>
                    </div>

                    {/* History Entries */}
                    <div>
                      {group.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="group px-6 py-2 hover:bg-dark-bg transition-colors flex items-center gap-3"
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={selectedEntries.has(entry.id)}
                            onChange={(e) => handleToggleSelect(entry.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-dark-border bg-dark-bg text-blue-500 focus:ring-blue-500 focus:ring-2"
                          />

                          {/* Timestamp */}
                          <span className="text-xs text-dark-text-secondary w-16 flex-shrink-0">
                            {formatTime(entry.visitedAt)}
                          </span>

                          {/* Favicon */}
                          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                            {getFavicon(entry.url) ? (
                              <img
                                src={getFavicon(entry.url)}
                                alt=""
                                className="w-4 h-4"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            ) : (
                              <svg className="w-4 h-4 text-dark-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                              </svg>
                            )}
                          </div>

                          {/* Title and URL */}
                          <button
                            onClick={() => handleNavigateTo(entry.url)}
                            className="flex-1 min-w-0 text-left flex items-center gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-dark-text truncate group-hover:text-blue-400 transition-colors">
                                {entry.title || entry.url}
                              </p>
                              <p className="text-xs text-dark-text-secondary truncate">
                                {getDomain(entry.url)}
                              </p>
                            </div>
                          </button>

                          {/* Three-dot menu */}
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteEntry(entry.id, e)
                              }}
                              className="p-1.5 text-dark-text-secondary hover:text-dark-text transition-colors opacity-0 group-hover:opacity-100 rounded hover:bg-dark-border"
                              title="Delete this entry"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-dark-border flex items-center justify-between">
            <div className="text-sm text-dark-text-secondary">
              {history.length} {history.length === 1 ? 'entry' : 'entries'}
            </div>
            <button
              onClick={handleClearHistory}
              disabled={history.length === 0}
              className="px-3 py-1.5 text-sm bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-dark-text-secondary hover:text-dark-text"
            >
              Clear History
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HistoryModal
