import React, { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { ipc } from '../../../lib/ipc'
import type { Document } from '../../../../shared/types'

interface MarkdownViewerProps {
  document: Document
  isEditing?: boolean
  onContentChange?: () => void
  onSave?: () => void
  saveTrigger?: number
  refreshTrigger?: number
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  document,
  isEditing = false,
  onContentChange,
  onSave,
  saveTrigger,
  refreshTrigger,
}) => {
  const [content, setContent] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Save when saveTrigger changes
  useEffect(() => {
    if (saveTrigger !== undefined && saveTrigger > 0 && content) {
      const saveContent = async () => {
        if (saving) return
        setSaving(true)
        try {
          const result = await ipc.document.saveFile(document.id, content, {
            extractText: true,
          })
          if (result.success) {
            onSave?.()
          } else {
            throw new Error(result.error || 'Failed to save document')
          }
        } catch (err) {
          console.error('Error saving markdown document:', err)
          setError(err instanceof Error ? err.message : 'Failed to save document')
        } finally {
          setSaving(false)
        }
      }
      saveContent()
    }
  }, [saveTrigger])

  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true)
        setError(null)

        // Try to read file via IPC
        const fileResult = await ipc.document.readFile(document.id)
        if (fileResult.success && fileResult.dataUri) {
          // Extract text from data URI
          const match = fileResult.dataUri.match(/^data:[^;]+;base64,(.+)$/)
          if (match) {
            const base64Data = match[1]
            const binaryString = atob(base64Data)
            const text = decodeURIComponent(escape(binaryString))
            setContent(text)
          } else {
            throw new Error('Invalid data URI format')
          }
        } else if (document.extractedText) {
          // Fallback to extracted text
          setContent(document.extractedText)
        } else {
          setError(fileResult.error || 'Failed to load document content')
        }

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document')
        setLoading(false)
      }
    }

    loadContent()
  }, [document, refreshTrigger])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
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
          <p className="text-sm text-dark-text-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toggle preview button */}
      <div className="bg-dark-panel border-b border-dark-border px-4 py-1 flex items-center justify-end">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs px-2 py-1 bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors"
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      {/* Editor and Preview */}
      <div className="flex-1 flex overflow-hidden">
        <div className={showPreview ? 'w-1/2 border-r border-dark-border' : 'w-full'}>
          <Editor
            height="100%"
            language="markdown"
            value={content}
            theme="vs-dark"
            options={{
              readOnly: false,
              minimap: { enabled: true },
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              automaticLayout: true,
            }}
            onChange={(value) => {
              if (value !== undefined) {
                setContent(value)
                onContentChange?.()
              }
            }}
          />
        </div>

        {showPreview && (
          <div className="w-1/2 overflow-auto p-4 bg-dark-bg scrollbar-dark-premium">
            <div className="prose prose-invert max-w-none">
              <div
                className="text-dark-text"
                dangerouslySetInnerHTML={{
                  __html: content
                    .replace(/\n/g, '<br>')
                    .replace(/### (.*?)(<br>|$)/g, '<h3>$1</h3>')
                    .replace(/## (.*?)(<br>|$)/g, '<h2>$1</h2>')
                    .replace(/# (.*?)(<br>|$)/g, '<h1>$1</h1>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`(.*?)`/g, '<code class="bg-dark-panel px-1 rounded">$1</code>'),
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MarkdownViewer

