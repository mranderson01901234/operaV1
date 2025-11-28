import Anthropic from '@anthropic-ai/sdk'
import { BaseProvider } from './base'
import { getToolsForProvider } from '../tools'
import type { ChatParams, ChatChunk, ToolCall, Attachment } from '../../../shared/types'

export class AnthropicProvider extends BaseProvider {
  id = 'anthropic'
  name = 'Anthropic'
  models = [
    // Claude Opus 4.5 series (latest)
    'claude-opus-4-5-20251101',
    // Claude Opus 4.1 series
    'claude-opus-4-1-20250805',
    // Claude Opus 4 series
    'claude-opus-4-20250514',
    // Claude Sonnet 4.5 series
    'claude-sonnet-4-5-20250929',
    // Claude Sonnet 4 series
    'claude-sonnet-4-20250514',
    // Claude Sonnet 3.7
    'claude-3-7-sonnet-20250219',
    // Claude Haiku 3.5
    'claude-3-5-haiku-20241022',
  ]
  supportsVision = true
  supportsTools = true

  constructor() {
    super()
    
    // All Claude models support full browser automation (vision + tools)
    this.models.forEach(model => {
      this.modelCapabilities.set(model, { supportsVision: true, supportsTools: true })
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      yield {
        done: true,
        error: 'Anthropic API key not configured. Please set your API key in Settings.',
      }
      return
    }

    const anthropic = new Anthropic({ apiKey })

    try {
      // Get model-specific capabilities
      const capabilities = this.getModelCapabilities(params.model)

      // Build messages array for Anthropic format
      const messages: Anthropic.MessageParam[] = []

      // Add conversation messages
      for (const msg of params.messages) {
        if (msg.role === 'user') {
          const isLastUserMessage = msg === params.messages[params.messages.length - 1]
          const hasAttachments = isLastUserMessage && (
            (params.attachments && params.attachments.length > 0) ||
            (params.images && params.images.length > 0)
          )

          if (capabilities.supportsVision && hasAttachments) {
            // Build multimodal content with attachments
            const content: Anthropic.ContentBlockParam[] = []

            // Add new-style attachments first
            if (params.attachments) {
              for (const attachment of params.attachments) {
                const match = attachment.data.match(/^data:([^;]+);base64,(.+)$/)
                if (!match) continue

                const mimeType = match[1]
                const base64Data = match[2]

                if (attachment.type === 'image') {
                  // Image attachment
                  content.push({
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: base64Data,
                    },
                  })
                } else if (mimeType === 'application/pdf') {
                  // PDF document - use document block (beta feature)
                  content.push({
                    type: 'document' as any,
                    source: {
                      type: 'base64',
                      media_type: 'application/pdf',
                      data: base64Data,
                    },
                  } as any)
                } else if (attachment.type === 'text' || attachment.type === 'code') {
                  // Text-based files - include as text with filename context
                  const textContent = attachment.extractedText || Buffer.from(base64Data, 'base64').toString('utf8')
                  content.push({
                    type: 'text',
                    text: `--- File: ${attachment.name} ---\n${textContent}\n--- End of ${attachment.name} ---`,
                  })
                } else if (attachment.extractedText) {
                  // Other documents with extracted text
                  content.push({
                    type: 'text',
                    text: `--- Document: ${attachment.name} ---\n${attachment.extractedText}\n--- End of ${attachment.name} ---`,
                  })
                }
              }
            }

            // Add legacy images (browser screenshots)
            if (params.images) {
              for (const img of params.images) {
                const match = img.match(/^data:([^;]+);base64,(.+)$/)
                if (match) {
                  content.push({
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: match[2],
                    },
                  })
                }
              }
            }

            // Add text content
            content.push({ type: 'text', text: msg.content })
            messages.push({ role: 'user', content })
          } else {
            messages.push({ role: 'user', content: msg.content })
          }
        } else if (msg.role === 'assistant') {
          // Handle assistant messages with potential tool calls
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const content: Anthropic.ContentBlockParam[] = []

            if (msg.content) {
              content.push({ type: 'text', text: msg.content })
            }

            for (const tc of msg.toolCalls) {
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.arguments,
              })
            }

            messages.push({ role: 'assistant', content })
          } else {
            messages.push({ role: 'assistant', content: msg.content })
          }
        } else if (msg.role === 'tool') {
          // Handle tool result messages
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const content: Anthropic.ToolResultBlockParam[] = msg.toolCalls.map(tc => ({
              type: 'tool_result' as const,
              tool_use_id: tc.id,
              content: tc.result ? JSON.stringify(tc.result) : tc.error || 'No result',
              is_error: !!tc.error,
            }))
            messages.push({ role: 'user', content })
          } else {
            // Generic tool response as user message
            messages.push({
              role: 'user',
              content: `[Tool Results]\n${msg.content}`,
            })
          }
        }
        // Note: Anthropic uses system parameter separately, not in messages
      }

      // Fix: Remove tool_use blocks from assistant messages if there's no corresponding tool_result
      // Anthropic API requires that every tool_use block must be immediately followed by a tool_result block
      // We need to check each assistant message and ensure the next message is a tool result
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          // Check if this message has tool_use blocks
          const toolUseBlocks = message.content.filter(block => block.type === 'tool_use')
          if (toolUseBlocks.length > 0) {
            // Check if the next message is a tool result message with matching tool_use_ids
            const nextMessage = messages[i + 1]
            const hasMatchingToolResults = nextMessage && 
              nextMessage.role === 'user' && 
              Array.isArray(nextMessage.content) &&
              nextMessage.content.some((block: any) => 
                block.type === 'tool_result' && 
                toolUseBlocks.some((tu: any) => tu.id === block.tool_use_id)
              )
            
            if (!hasMatchingToolResults) {
              // Remove tool_use blocks from this message, keep only text blocks
              const nonToolBlocks = message.content.filter(block => block.type !== 'tool_use')
              if (nonToolBlocks.length === 0) {
                // If all blocks were tool_use, remove the message entirely
                messages.splice(i, 1)
                i-- // Adjust index after removal
              } else {
                // Otherwise, keep only non-tool blocks
                message.content = nonToolBlocks
              }
            }
          }
        }
      }

      // Fix: Remove orphaned tool_result blocks that don't have corresponding tool_use blocks
      // Anthropic API requires that every tool_result block must reference a tool_use block in the previous assistant message
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        if (message.role === 'user' && Array.isArray(message.content)) {
          // Check if this message has tool_result blocks
          const toolResultBlocks = message.content.filter((block: any) => block.type === 'tool_result')
          if (toolResultBlocks.length > 0) {
            // Find the previous assistant message
            let prevAssistantMessage: Anthropic.MessageParam | null = null
            for (let j = i - 1; j >= 0; j--) {
              if (messages[j].role === 'assistant') {
                prevAssistantMessage = messages[j]
                break
              }
            }

            if (!prevAssistantMessage || !Array.isArray(prevAssistantMessage.content)) {
              // No previous assistant message, remove all tool_result blocks
              const nonToolResultBlocks = message.content.filter((block: any) => block.type !== 'tool_result')
              if (nonToolResultBlocks.length === 0) {
                // If all blocks were tool_result, remove the message entirely
                messages.splice(i, 1)
                i-- // Adjust index after removal
              } else {
                message.content = nonToolResultBlocks
              }
            } else {
              // Get all tool_use IDs from the previous assistant message
              const toolUseIds = new Set(
                prevAssistantMessage.content
                  .filter((block: any) => block.type === 'tool_use')
                  .map((block: any) => block.id)
              )

              // Filter out tool_result blocks that don't have matching tool_use IDs
              const validToolResultBlocks = message.content.filter((block: any) => {
                if (block.type === 'tool_result') {
                  return toolUseIds.has(block.tool_use_id)
                }
                return true
              })

              if (validToolResultBlocks.length === 0) {
                // If all blocks were invalid tool_result blocks, remove the message entirely
                messages.splice(i, 1)
                i-- // Adjust index after removal
              } else {
                message.content = validToolResultBlocks
              }
            }
          }
        }
      }

      // Get tools in Anthropic format (only if model supports tools)
      const tools = capabilities.supportsTools ? getToolsForProvider('anthropic') as Anthropic.Tool[] : []

      // Create message request
      const requestParams: Anthropic.MessageCreateParamsStreaming = {
        model: params.model,
        messages,
        stream: true,
        max_tokens: params.maxTokens ?? 4096,
      }

      // Add system prompt if provided
      if (params.systemPrompt) {
        requestParams.system = params.systemPrompt
      }

      // Include tools if model supports them
      if (capabilities.supportsTools && tools.length > 0) {
        requestParams.tools = tools
        console.log(`[Anthropic] Using model ${params.model} with ${tools.length} tools`)
      } else {
        console.log(`[Anthropic] Using model ${params.model} without tools (supportsTools: ${capabilities.supportsTools})`)
      }

      const stream = await anthropic.messages.stream(requestParams)

      const toolCalls: ToolCall[] = []
      let currentToolUse: { id: string; name: string; input: string } | null = null

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              content: event.delta.text,
              done: false,
            }
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              toolCalls.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                arguments: JSON.parse(currentToolUse.input || '{}'),
                timestamp: new Date(),
              })
            } catch (e) {
              console.error('Failed to parse tool input:', e)
            }
            currentToolUse = null
          }
        } else if (event.type === 'message_stop') {
          if (toolCalls.length > 0) {
            yield {
              toolCalls,
              done: true,
            }
          } else {
            yield { done: true }
          }
        }
      }
    } catch (error) {
      console.error('Anthropic chat error:', error)
      yield {
        done: true,
        error: error instanceof Error ? error.message : 'Anthropic API error',
      }
    }
  }
}
