import React, { useEffect } from 'react'
import InputArea from './InputArea'
import MessageList from './MessageList'
import CubeScene from './CubeScene'
import DocumentEditConfirmation from './DocumentEditConfirmation'
import { useChatStore } from '../../stores/chatStore'
import { useAgentStore } from '../../stores/agentStore'

const ChatPanel: React.FC = () => {
  const { messages, loadMessages } = useChatStore()
  const { activeAgentId } = useAgentStore()

  useEffect(() => {
    if (activeAgentId) {
      loadMessages(activeAgentId)
    }
  }, [activeAgentId, loadMessages])

  return (
    <div className="h-full w-full bg-dark-bg flex flex-col relative min-w-0 min-h-0">
      {/* Chat content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative scrollbar-dark-premium min-w-0 min-h-0">
        {messages.length === 0 ? (
          <CubeScene />
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {/* Sticky input at bottom */}
      <div className="sticky bottom-0 w-full flex-shrink-0 min-w-0">
        <InputArea />
      </div>

      {/* Document edit confirmation modal */}
      <DocumentEditConfirmation />
    </div>
  )
}

export default ChatPanel
