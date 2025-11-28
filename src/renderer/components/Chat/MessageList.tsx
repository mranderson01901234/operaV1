import React from 'react'
import type { Message, Attachment } from '../../../shared/types'
import { useChatStore } from '../../stores/chatStore'
import ResearchResponse from './ResearchResponse'

interface MessageListProps {
  messages: Message[]
}

// Animated thinking dots component
const ProcessingIndicator: React.FC = () => {
  return (
    <div className="w-full max-w-3xl text-left text-dark-text-secondary text-lg">
      Thinking
      <span
        className="inline-block"
        style={{
          animation: 'thinking-dot 1.4s ease-in-out infinite',
          animationDelay: '0s'
        }}
      >.</span>
      <span
        className="inline-block"
        style={{
          animation: 'thinking-dot 1.4s ease-in-out infinite',
          animationDelay: '0.2s'
        }}
      >.</span>
      <span
        className="inline-block"
        style={{
          animation: 'thinking-dot 1.4s ease-in-out infinite',
          animationDelay: '0.4s'
        }}
      >.</span>
    </div>
  )
}

// File type icon component
const FileTypeIcon: React.FC<{ mimeType: string; className?: string }> = ({ mimeType, className = 'w-6 h-6' }) => {
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
  if (mimeType.includes('word') || mimeType === 'application/msword') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
  // Default code/text icon
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  )
}

// Attachment display component
const AttachmentDisplay: React.FC<{ attachment: Attachment; index: number }> = ({ attachment, index }) => {
  // Handle data URI format
  const imgSrc = attachment.data.startsWith('data:')
    ? attachment.data
    : `data:${attachment.mimeType || 'application/octet-stream'};base64,${attachment.data}`

  if (attachment.type === 'image') {
    return (
      <img
        key={index}
        src={imgSrc}
        alt={attachment.name || 'Attached image'}
        className="max-w-md max-h-96 rounded-lg object-contain"
      />
    )
  }

  // For documents, show a card with file info
  return (
    <div
      key={index}
      className="flex items-center gap-3 bg-dark-bg rounded-lg p-3 max-w-xs"
    >
      <div className="text-dark-text-secondary">
        <FileTypeIcon mimeType={attachment.mimeType || ''} className="w-8 h-8" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-dark-text truncate" title={attachment.name}>
          {attachment.name || 'Document'}
        </span>
        <span className="text-xs text-dark-text-secondary">
          {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Document'}
        </span>
      </div>
    </div>
  )
}

// Filter out JSON code blocks and tool result sections from text
const filterJsonCodeBlocks = (text: string): string => {
  let filtered = text

  // Remove JSON code blocks (```json ... ```)
  filtered = filtered.replace(/```json[\s\S]*?```/g, '')

  // Remove tool result sections (## Tool Execution Results: ...)
  filtered = filtered.replace(/## Tool Execution Results:[\s\S]*?(?=##|$)/g, '')

  // Remove standalone JSON objects that look like tool results
  // Only remove if they contain common tool result fields
  const toolResultFields = ['documentId', 'result', 'summary', 'name', 'mimeType', 'size', 'count', 'id']
  filtered = filtered.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, (match) => {
    // Only remove if it looks like a tool result JSON (has quotes, colons, and tool result fields)
    if (match.includes('"') && match.includes(':')) {
      const hasToolResultField = toolResultFields.some(field =>
        match.includes(`"${field}"`) || match.includes(`'${field}'`)
      )
      // Only remove if it's clearly a tool result (has multiple fields and at least one tool result field)
      if (hasToolResultField && (match.match(/:/g) || []).length >= 2) {
        return ''
      }
    }
    return match
  })

  // Clean up extra whitespace and newlines
  filtered = filtered.replace(/\n{3,}/g, '\n\n').trim()

  return filtered
}

// Parse markdown bold syntax (**text**) and render as bold white text
const parseMarkdown = (text: string): React.ReactNode[] => {
  // Filter out JSON code blocks first
  const filteredText = filterJsonCodeBlocks(text)

  const parts: React.ReactNode[] = []
  const regex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(filteredText)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{filteredText.substring(lastIndex, match.index)}</span>
      )
    }
    // Add bold text (white color)
    parts.push(
      <strong key={key++} className="text-white font-semibold">
        {match[1]}
      </strong>
    )
    lastIndex = regex.lastIndex
  }

  // Add remaining text
  if (lastIndex < filteredText.length) {
    parts.push(<span key={key++}>{filteredText.substring(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : [<span key={0}>{filteredText}</span>]
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const { isStreaming, streamingMessageId } = useChatStore()

  // Filter out tool messages (they contain raw JSON that we don't want to display)
  const visibleMessages = messages.filter(message => message.role === 'user' || message.role === 'assistant')

  // Detect if a message is a research response
  const isResearchResponse = (content: string): boolean => {
    return content.includes('**Direct Answer**') ||
      content.includes('**Key Findings**') ||
      content.includes('## ') ||
      content.includes('---\n\n**Sources:**')
  }

  // Extract sources from content if embedded
  const extractSources = (content: string): { content: string; sources: any[] } => {
    const sourcesMatch = content.match(/---\s*\*\*Sources:\*\*\s*\n([\s\S]*?)$/m)
    if (sourcesMatch) {
      const mainContent = content.substring(0, sourcesMatch.index).trim()
      const sourcesText = sourcesMatch[1]

      // Parse source links: "1. [Title](url)"
      const sourceRegex = /\d+\.\s*\[([^\]]+)\]\(([^)]+)\)/g
      const sources: any[] = []
      let match

      while ((match = sourceRegex.exec(sourcesText)) !== null) {
        sources.push({
          title: match[1],
          url: match[2],
          domain: match[2]
        })
      }

      return { content: mainContent, sources }
    }

    return { content, sources: [] }
  }

  return (
    <div className="p-4 space-y-4 flex flex-col items-center">
      {visibleMessages.map((message, index) => {
        const isStreamingMessage = message.id === streamingMessageId && !message.content.trim()
        const showProcessing = isStreamingMessage && isStreaming
        const hasAttachments = message.attachments && message.attachments.length > 0
        const isLastMessage = index === visibleMessages.length - 1
        const isResearch = message.role === 'assistant' && isResearchResponse(message.content)
        const { content: cleanContent, sources } = isResearch ? extractSources(message.content) : { content: message.content, sources: [] }

        return (
          <React.Fragment key={message.id}>
            {/* User message bubble */}
            <div
              className={`w-full max-w-3xl ${message.role === 'user'
                  ? 'text-right border border-dark-border rounded p-3'
                  : message.role === 'assistant'
                    ? 'text-left'
                    : 'text-center'
                }`}
            >
              {message.role === 'assistant' && showProcessing ? (
                <ProcessingIndicator />
              ) : message.content.trim() ? (
                <>
                  {isResearch ? (
                    <ResearchResponse content={cleanContent} sources={sources} />
                  ) : (
                    <>
                      <p className={`text-dark-text whitespace-pre-wrap ${message.role === 'assistant' ? 'text-lg' : ''
                        }`}>
                        {parseMarkdown(message.content)}
                      </p>
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-dark-border">
                          <p className="text-xs text-dark-text-secondary">
                            {message.toolCalls.length} tool call(s)
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>

            {/* User-attached files - displayed separately below the message bubble */}
            {message.role === 'user' && hasAttachments && (
              <div className="w-full max-w-3xl flex justify-end">
                <div className="flex flex-wrap gap-2 items-end justify-end">
                  {message.attachments?.map((attachment, i) => (
                    <AttachmentDisplay key={i} attachment={attachment} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Show processing indicator between user message and empty assistant message */}
            {message.role === 'user' &&
              isLastMessage &&
              isStreaming &&
              (!streamingMessageId || !messages.find(m => m.id === streamingMessageId)) && (
                <ProcessingIndicator />
              )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default MessageList
