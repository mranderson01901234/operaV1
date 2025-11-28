import React, { useEffect, useState } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useChatStore } from '../../stores/chatStore'
import { ipc } from '../../lib/ipc'
import type { Agent, Message } from '../../../shared/types'

interface AgentListProps {
  searchQuery: string
}

/**
 * Generates a short title from a message content.
 * - Removes markdown formatting
 * - Takes first sentence or first 50 characters
 * - Removes common prefixes like "## User Request:"
 */
const generateTitleFromMessage = (content: string): string => {
  // Remove markdown headers and formatting
  let text = content
    .replace(/^##\s+.*$/gm, '') // Remove markdown headers
    .replace(/^\*\*.*?\*\*:\s*/gm, '') // Remove bold labels like "**URL:**"
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\*/g, '') // Remove italic markers
    .trim()

  // Extract user request if it's in a formatted message
  const userRequestMatch = text.match(/## User Request:\s*(.+)/s)
  if (userRequestMatch) {
    text = userRequestMatch[1].trim()
  }

  // Remove browser context sections
  text = text.replace(/## Current Browser State[\s\S]*?## User Request:/g, '').trim()

  // Take first sentence (up to period, exclamation, or question mark)
  const sentenceMatch = text.match(/^([^.!?]+[.!?])/)
  if (sentenceMatch) {
    text = sentenceMatch[1].trim()
  }

  // Limit to 50 characters
  if (text.length > 50) {
    text = text.substring(0, 47) + '...'
  }

  return text || 'New Chat'
}

const AgentList: React.FC<AgentListProps> = ({ searchQuery }) => {
  const { agents, activeAgentId, loadAgents, setActiveAgent, deleteAgent } = useAgentStore()
  const { messages } = useChatStore()
  const [agentTitles, setAgentTitles] = useState<Record<string, string>>({})
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // Fetch first user message for each agent to generate titles
  useEffect(() => {
    const fetchTitles = async () => {
      const titles: Record<string, string> = {}
      
      for (const agent of agents) {
        try {
          const firstUserMessage = await ipc.message.getFirstUser(agent.id)
          if (firstUserMessage) {
            titles[agent.id] = generateTitleFromMessage(firstUserMessage.content)
          } else {
            // No messages yet, use default
            titles[agent.id] = 'New Chat'
          }
        } catch (error) {
          console.error(`Failed to fetch title for agent ${agent.id}:`, error)
          titles[agent.id] = 'New Chat'
        }
      }
      
      setAgentTitles(titles)
    }

    if (agents.length > 0) {
      fetchTitles()
    }
  }, [agents])

  // Update title when messages change (in case an agent gets its first message)
  useEffect(() => {
    if (!activeAgentId || agents.length === 0) return
    
    const activeAgentMessages = messages.filter(m => m.agentId === activeAgentId)
    const hasUserMessage = activeAgentMessages.some(m => m.role === 'user')
    
    // Only refetch if the active agent has messages but no title yet
    if (hasUserMessage && !agentTitles[activeAgentId]) {
      const fetchTitles = async () => {
        const titles: Record<string, string> = { ...agentTitles }
        
        // Only fetch for agents that don't have titles yet
        for (const agent of agents) {
          if (!titles[agent.id]) {
            try {
              const firstUserMessage = await ipc.message.getFirstUser(agent.id)
              if (firstUserMessage) {
                titles[agent.id] = generateTitleFromMessage(firstUserMessage.content)
              } else {
                titles[agent.id] = 'New Chat'
              }
            } catch (error) {
              console.error(`Failed to fetch title for agent ${agent.id}:`, error)
              titles[agent.id] = 'New Chat'
            }
          }
        }
        
        setAgentTitles(titles)
      }
      
      fetchTitles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeAgentId])

  const filteredAgents = agents.filter(agent => {
    const title = agentTitles[agent.id] || agent.name
    return title.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Reset expanded state when search query changes
  useEffect(() => {
    setIsExpanded(false)
  }, [searchQuery])

  const MAX_VISIBLE_CHATS = 6
  const visibleAgents = isExpanded ? filteredAgents : filteredAgents.slice(0, MAX_VISIBLE_CHATS)
  const hasMoreChats = filteredAgents.length > MAX_VISIBLE_CHATS

  const getLastMessage = (agentId: string): string | undefined => {
    const agentMessages = messages.filter(m => m.agentId === agentId)
    const lastMessage = agentMessages[agentMessages.length - 1]
    return lastMessage?.content
  }

  const formatTimestamp = (date: Date): string => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
  }

  return (
    <div className="p-2">
      {filteredAgents.length === 0 ? (
        <div className="p-4 text-center text-dark-text-secondary text-sm">
          {searchQuery ? 'No agents found' : 'No agents yet'}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {visibleAgents.map((agent) => {
              const isActive = agent.id === activeAgentId
              const lastMessage = getLastMessage(agent.id)
              const title = agentTitles[agent.id] || agent.name
              
              const handleDelete = async (e: React.MouseEvent) => {
                e.stopPropagation() // Prevent selecting the conversation when clicking delete
                await deleteAgent(agent.id)
              }

              return (
                <div
                  key={agent.id}
                  onClick={() => setActiveAgent(agent.id)}
                  className={`px-3 py-2 rounded hover:bg-dark-bg cursor-pointer transition-colors group relative ${
                    isActive ? 'bg-dark-bg border-l-2 border-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-dark-text truncate" title={title}>
                        {title}
                      </div>
                      {lastMessage && (
                        <div className="text-xs text-dark-text-secondary mt-1 truncate">
                          {lastMessage}
                        </div>
                      )}
                      <div className="text-xs text-dark-text-secondary mt-1">
                        {formatTimestamp(agent.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={handleDelete}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-dark-border rounded flex-shrink-0"
                      title="Delete conversation"
                    >
                      <svg 
                        className="w-4 h-4 text-dark-text-secondary hover:text-red-500 transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {hasMoreChats && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full mt-2 px-3 py-2 text-sm text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg rounded transition-colors flex items-center justify-center gap-2"
            >
              <span>{isExpanded ? 'Show less' : `Show ${filteredAgents.length - MAX_VISIBLE_CHATS} more`}</span>
              <svg 
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M19 9l-7 7-7-7" 
                />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default AgentList

