import React, { useState, useEffect } from 'react'
import mammoth from 'mammoth'
import { ipc } from '../../../lib/ipc'
import type { Document } from '../../../../shared/types'

interface WordViewerProps {
  document: Document
  isEditing?: boolean
  onContentChange?: () => void
  onSave?: () => void
  refreshTrigger?: number
}

const WordViewer: React.FC<WordViewerProps> = ({ document, refreshTrigger }) => {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadWordDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        // Read file via IPC
        const fileResult = await ipc.document.readFile(document.id)
        if (!fileResult.success || !fileResult.dataUri) {
          setError(fileResult.error || 'Failed to load Word document')
          setLoading(false)
          return
        }

        // Extract buffer from data URI
        const match = fileResult.dataUri.match(/^data:[^;]+;base64,(.+)$/)
        if (!match) {
          setError('Invalid data URI format')
          setLoading(false)
          return
        }

        const base64Data = match[1]
        const arrayBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)).buffer

        // Handle legacy .doc files via IPC (doc-extract runs in main process)
        if (document.mimeType === 'application/msword') {
          try {
            // Extract text via IPC (handled in main process)
            const extractResult = await ipc.document.extractDocText(document.id)
            
            if (!extractResult.success) {
              // Show user-friendly error message
              const errorMsg = extractResult.error || 'Failed to extract text from .doc file'
              setError(errorMsg)
              setLoading(false)
              return
            }
            
            if (!extractResult.text) {
              setError('No text content found in .doc file')
              setLoading(false)
              return
            }
            
            // Convert plain text to HTML with basic formatting
            const text = extractResult.text
            // Escape HTML and preserve line breaks
            const escapedText = text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br>')
            
            setHtmlContent(`<div style="white-space: pre-wrap;">${escapedText}</div>`)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to extract text from .doc file')
            setLoading(false)
            return
          }
        } else {
          // Handle .docx files using mammoth
          const result = await mammoth.convertToHtml({ arrayBuffer })
          setHtmlContent(result.value)
        }

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Word document')
        setLoading(false)
      }
    }

    loadWordDocument()
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
          <p className="text-sm text-dark-text-secondary">Loading Word document...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
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

  return (
    <div className="h-full w-full overflow-auto bg-dark-bg p-8 scrollbar-dark-premium">
      {htmlContent ? (
        <div
          className="max-w-4xl mx-auto prose prose-invert prose-lg"
          style={{
            color: '#e5e7eb',
          }}
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : (
        <div className="text-center py-8">
          <p className="text-dark-text-secondary">
            Word document conversion needs IPC implementation.
          </p>
        </div>
      )}
    </div>
  )
}

export default WordViewer

