import React, { useEffect, useState, useCallback } from 'react'
import { useTabStore } from '../../stores/tabStore'
import { useAgentStore } from '../../stores/agentStore'
import { ipc } from '../../lib/ipc'
import DocumentViewer from './DocumentViewer'
import { IPC_CHANNELS } from '../../../shared/ipc-channels'
import type { Document } from '../../../shared/types'

const DocumentPanel: React.FC = () => {
  const { getActiveTab } = useTabStore()
  const { activeAgentId } = useAgentStore()
  const [document, setDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveTrigger, setSaveTrigger] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const activeTab = getActiveTab()

  const handleContentChange = () => {
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    if (!document || !hasUnsavedChanges) return

    setSaving(true)
    setSaveTrigger((prev) => prev + 1)
    setHasUnsavedChanges(false)
    setSaving(false)
  }

  useEffect(() => {
    const loadDocument = async () => {
      if (!activeTab || activeTab.type !== 'document' || !activeTab.documentId) {
        setDocument(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const result = await ipc.document.getById(activeTab.documentId)
        if (result.success && result.document) {
          setDocument(result.document)
        } else {
          setError(result.error || 'Failed to load document')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document')
      } finally {
        setLoading(false)
      }
    }

    loadDocument()
  }, [activeTab, refreshTrigger])

  // Listen for document update events from the main process (LLM edits)
  useEffect(() => {
    const handleDocumentUpdated = (data: { documentId: string }) => {
      // Check if the updated document is currently displayed
      if (activeTab?.type === 'document' && activeTab.documentId === data.documentId) {
        console.log('[DocumentPanel] Document updated by LLM, triggering refresh:', data.documentId)
        // Don't refresh if user has unsaved changes (to avoid data loss)
        if (!hasUnsavedChanges) {
          setRefreshTrigger((prev) => prev + 1)
        } else {
          console.log('[DocumentPanel] Skipping refresh due to unsaved changes')
        }
      }
    }

    // Register listener
    window.electronAPI.on(IPC_CHANNELS.DOCUMENT_UPDATED, handleDocumentUpdated)

    // Cleanup listener on unmount
    return () => {
      window.electronAPI.removeListener(IPC_CHANNELS.DOCUMENT_UPDATED, handleDocumentUpdated)
    }
  }, [activeTab, hasUnsavedChanges])

  if (!activeTab || activeTab.type !== 'document') {
    return (
      <div className="h-full w-full bg-dark-bg flex flex-col items-center justify-center text-dark-text-secondary">
        <svg className="w-24 h-24 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h2 className="text-2xl font-semibold mb-2 text-dark-text">Document</h2>
        <p className="text-sm">Open a document to view and edit</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full w-full bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-8 h-8 animate-spin text-dark-text-secondary mx-auto mb-2"
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
          <p className="text-sm text-dark-text-secondary">Loading document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full w-full bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 text-red-500 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="h-full w-full bg-dark-bg flex items-center justify-center">
        <p className="text-sm text-dark-text-secondary">Document not found</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-dark-bg flex flex-col min-w-0 min-h-0">
      {/* Document toolbar */}
      <div className="bg-dark-panel border-b border-dark-border px-4 py-2 flex items-center justify-between flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-dark-text-secondary"
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
          <span className="text-sm text-dark-text font-medium">{document.name}</span>
          <span className="text-xs text-dark-text-secondary">
            ({(document.fileSize / 1024).toFixed(1)} KB)
          </span>
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-500 font-medium">• Unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="px-3 py-1 text-xs bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Document viewer */}
      <div className="flex-1 overflow-hidden min-w-0 min-h-0">
        <DocumentViewer
          document={document}
          isEditing={isEditing}
          onContentChange={handleContentChange}
          onSave={() => {
            setHasUnsavedChanges(false)
            setSaving(false)
          }}
          saveTrigger={saveTrigger}
          refreshTrigger={refreshTrigger}
        />
      </div>
    </div>
  )
}

export default DocumentPanel

