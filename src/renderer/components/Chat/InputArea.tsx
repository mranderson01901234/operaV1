import React, { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAgentStore } from '../../stores/agentStore'
import { ipc } from '../../lib/ipc'
import ModelSelector from './ModelSelector'
import type { Attachment } from '../../../shared/types'
import { useTabStore } from '../../stores/tabStore'

interface PendingFile {
  file: File
  preview: string | null  // Object URL for images, null for other files
  dataUri: string
  isProcessing: boolean
  error?: string
}

// File type icons
const FileIcon: React.FC<{ mimeType: string; className?: string }> = ({ mimeType, className = 'w-8 h-8' }) => {
  if (mimeType.startsWith('image/')) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }
  if (mimeType === 'application/pdf') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-6 4h4" />
      </svg>
    )
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  }
  // Default document icon
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

const InputArea: React.FC = () => {
  const [input, setInput] = useState('')
  const [useDeepResearch, setUseDeepResearch] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const { sendMessage, isStreaming, isResearching } = useChatStore()
  const { activeAgentId, getActiveAgent } = useAgentStore()
  const { loadTabs } = useTabStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when activeAgentId changes
  useEffect(() => {
    if (activeAgentId && !isStreaming) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    }
  }, [activeAgentId, isStreaming])

  const handleSend = async () => {
    const validFiles = pendingFiles.filter(f => !f.error && !f.isProcessing)
    if ((!input.trim() && validFiles.length === 0) || !activeAgentId || isStreaming) return

    const agent = getActiveAgent()
    if (!agent) {
      console.error('No active agent found')
      return
    }

    // Process files through main process for security validation
    const attachments: Attachment[] = []
    for (const pf of validFiles) {
      const result = await ipc.file.process({
        dataUri: pf.dataUri,
        filename: pf.file.name,
        mimeType: pf.file.type || 'application/octet-stream',
        size: pf.file.size,
        provider: agent.provider,
      })

      if (result.success && result.attachment) {
        attachments.push(result.attachment)
      } else {
        console.error(`Failed to process file ${pf.file.name}:`, result.error)
      }
    }

    await sendMessage(input, activeAgentId, {
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      useDeepResearch,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
    setInput('')

    // Clear pending files after sending
    pendingFiles.forEach(pf => {
      if (pf.preview) URL.revokeObjectURL(pf.preview)
    })
    setPendingFiles([])

    // Refocus input after sending message
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newPendingFiles: PendingFile[] = []

    for (const file of Array.from(files)) {
      // Create preview for images
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null

      // Start with processing state
      const pendingFile: PendingFile = {
        file,
        preview,
        dataUri: '',
        isProcessing: true,
      }
      newPendingFiles.push(pendingFile)
    }

    setPendingFiles(prev => [...prev, ...newPendingFiles])

    // Process each file
    for (let i = 0; i < newPendingFiles.length; i++) {
      const file = newPendingFiles[i].file

      // Convert to data URI
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUri = reader.result as string

        // Validate through main process
        const validation = await ipc.file.validate({
          dataUri,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          provider: getActiveAgent()?.provider || 'default',
        })

        setPendingFiles(prev => prev.map(pf => {
          if (pf.file === file) {
            return {
              ...pf,
              dataUri,
              isProcessing: false,
              error: validation.valid ? undefined : validation.error,
            }
          }
          return pf
        }))
      }
      reader.onerror = () => {
        setPendingFiles(prev => prev.map(pf => {
          if (pf.file === file) {
            return {
              ...pf,
              isProcessing: false,
              error: 'Failed to read file',
            }
          }
          return pf
        }))
      }
      reader.readAsDataURL(file)
    }

    // Reset file input
    e.target.value = ''
  }

  const handleRemoveFile = (index: number) => {
    setPendingFiles(prev => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleFileButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleOpenAsDocument = async (index: number) => {
    const pf = pendingFiles[index]
    if (!pf || pf.error || pf.isProcessing || !activeAgentId) return

    const agent = getActiveAgent()
    if (!agent) {
      console.error('No active agent found')
      return
    }

    try {
      const result = await ipc.document.createTab({
        agentId: activeAgentId,
        dataUri: pf.dataUri,
        filename: pf.file.name,
        mimeType: pf.file.type || 'application/octet-stream',
        size: pf.file.size,
        provider: agent.provider,
        makeActive: true,
      })

      if (result.success) {
        // Remove file from pending list
        handleRemoveFile(index)
        // Reload tabs to show the new document tab
        await loadTabs(activeAgentId)
      } else {
        console.error('Failed to open document:', result.error)
      }
    } catch (error) {
      console.error('Error opening document:', error)
    }
  }

  const hasValidFiles = pendingFiles.some(f => !f.error && !f.isProcessing)

  return (
    <div className="w-full bg-dark-panel border-t border-dark-border p-4">
      {/* File preview area */}
      {pendingFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingFiles.map((pf, index) => (
            <div key={index} className="relative group flex items-center gap-2 bg-dark-bg rounded-lg p-2 pr-8">
              {/* Preview or icon */}
              {pf.preview ? (
                <img
                  src={pf.preview}
                  alt="Preview"
                  className="w-12 h-12 object-cover rounded"
                />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center text-dark-text-secondary">
                  <FileIcon mimeType={pf.file.type} />
                </div>
              )}

              {/* File info */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs text-dark-text truncate max-w-[120px]" title={pf.file.name}>
                  {pf.file.name}
                </span>
                <span className="text-xs text-dark-text-secondary">
                  {pf.isProcessing ? (
                    'Processing...'
                  ) : pf.error ? (
                    <span className="text-red-400" title={pf.error}>Error</span>
                  ) : (
                    `${(pf.file.size / 1024).toFixed(1)} KB`
                  )}
                </span>
                {/* Open as Document button */}
                {!pf.error && !pf.isProcessing && (
                  <button
                    onClick={() => handleOpenAsDocument(index)}
                    className="mt-1 text-xs px-2 py-0.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                    title="Open as Document"
                  >
                    Open as Document
                  </button>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={() => handleRemoveFile(index)}
                className="absolute top-1 right-1 w-5 h-5 bg-dark-panel border border-dark-border rounded-full flex items-center justify-center text-dark-text-secondary hover:text-dark-text hover:bg-red-500/20 transition-colors"
                title="Remove file"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input - accepts all files */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <div className="flex-shrink-0">
          <ModelSelector />
        </div>

        {/* Input with icons and send button inside */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={!activeAgentId || isStreaming || isResearching}
            placeholder={
              isResearching
                ? "Deep research in progress..."
                : activeAgentId
                  ? (useDeepResearch ? "Type your message (Deep Research ON)..." : "Type your message...")
                  : "Select a model to start chatting"
            }
            className="w-full pl-4 pr-32 py-2 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {/* Icons on the right side of input */}
          <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Deep Research toggle */}
            <button
              onClick={() => setUseDeepResearch(!useDeepResearch)}
              className={`p-1.5 transition-colors flex-shrink-0 ${
                useDeepResearch
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-dark-text-secondary hover:text-dark-text'
              }`}
              title={useDeepResearch ? 'Deep Research ON - Click to disable' : 'Deep Research OFF - Click to enable comprehensive research'}
              disabled={isStreaming || isResearching}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* File attachment button */}
            <button
              onClick={handleFileButtonClick}
              className={`p-1.5 transition-colors flex-shrink-0 ${
                hasValidFiles
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-dark-text-secondary hover:text-dark-text'
              }`}
              title={hasValidFiles ? `${pendingFiles.length} file(s) attached` : 'Attach files (images, PDFs, documents, code)'}
              disabled={isStreaming || isResearching}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !hasValidFiles) || !activeAgentId || isStreaming}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-dark-text-secondary hover:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default InputArea
