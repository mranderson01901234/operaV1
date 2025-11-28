import OpenAI from 'openai'
import { BaseProvider } from './base'
import { getToolsForProvider } from '../tools'
import type { ChatParams, ChatChunk, ToolCall, Attachment } from '../../../shared/types'

export class OpenAIProvider extends BaseProvider {
  id = 'openai'
  name = 'OpenAI'
  models = [
    // GPT-5 series (latest)
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    // GPT-4.1 series
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano-2025-04-14',
    // GPT-4o series (recommended)
    'gpt-4o',
    'gpt-4o-mini',
    // o3 series (reasoning models)
    'o3',
    'o3-pro',
    // o4 series
    'o4-mini',
  ]
  supportsVision = true
  supportsTools = true

  constructor() {
    super()
    
    // Full browser automation capabilities (vision + tools)
    const fullBrowserModels = [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'gpt-4.1-2025-04-14', 'gpt-4.1-mini-2025-04-14', 'gpt-4.1-nano-2025-04-14',
      'gpt-4o', 'gpt-4o-mini',
    ]
    
    fullBrowserModels.forEach(model => {
      this.modelCapabilities.set(model, { supportsVision: true, supportsTools: true })
    })
    
    // Reasoning models (vision + tools but extended reasoning)
    const reasoningModels = ['o3', 'o3-pro', 'o4-mini']
    reasoningModels.forEach(model => {
      this.modelCapabilities.set(model, { supportsVision: true, supportsTools: true })
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      yield {
        done: true,
        error: 'OpenAI API key not configured. Please set your API key in Settings.',
      }
      return
    }

    const openai = new OpenAI({ apiKey })

    try {
      // Build messages array
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

      // Add system prompt if provided
      if (params.systemPrompt) {
        messages.push({
          role: 'system',
          content: params.systemPrompt,
        })
      }

      // Get model-specific capabilities
      const capabilities = this.getModelCapabilities(params.model)

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
            const content: OpenAI.Chat.ChatCompletionContentPart[] = []

            // Add text first
            content.push({ type: 'text', text: msg.content })

            // Add new-style attachments
            if (params.attachments) {
              for (const attachment of params.attachments) {
                if (attachment.type === 'image') {
                  // Image attachment - use data URI directly
                  content.push({
                    type: 'image_url',
                    image_url: { url: attachment.data },
                  })
                } else if (attachment.mimeType === 'application/pdf') {
                  // PDF - OpenAI supports PDF via file input
                  // Send as file block for models that support it
                  content.push({
                    type: 'file' as any,
                    file: {
                      filename: attachment.name,
                      file_data: attachment.data,
                    },
                  } as any)
                } else if (attachment.type === 'text' || attachment.type === 'code') {
                  // Text-based files - include as text
                  const match = attachment.data.match(/^data:([^;]+);base64,(.+)$/)
                  const textContent = attachment.extractedText ||
                    (match ? Buffer.from(match[2], 'base64').toString('utf8') : '')
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
                content.push({
                  type: 'image_url',
                  image_url: { url: img },
                })
              }
            }

            messages.push({ role: 'user', content })
          } else {
            messages.push({ role: 'user', content: msg.content })
          }
        } else if (msg.role === 'assistant') {
          // Handle assistant messages with potential tool calls
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content: msg.content || null,
              tool_calls: msg.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            })
          } else {
            messages.push({ role: 'assistant', content: msg.content })
          }
        } else if (msg.role === 'tool') {
          // Handle tool result messages
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: tc.result ? JSON.stringify(tc.result) : tc.error || 'No result',
              })
            }
          } else {
            // Generic tool response
            messages.push({
              role: 'user',
              content: `[Tool Results]\n${msg.content}`,
            })
          }
        } else if (msg.role === 'system') {
          messages.push({ role: 'system', content: msg.content })
        }
      }

      // Get tools in OpenAI format (only if model supports tools)
      const tools = capabilities.supportsTools ? getToolsForProvider('openai') : []

      // Determine which parameter name to use for max tokens
      // Newer models (gpt-5 series, gpt-4.1 series, o3/o4 series) use max_completion_tokens
      // Older models use max_tokens
      const modelId = params.model.toLowerCase()
      const usesMaxCompletionTokens = modelId.startsWith('gpt-5') || 
                                      modelId.startsWith('gpt-4.1') ||
                                      modelId.startsWith('o3') ||
                                      modelId.startsWith('o4')
      
      // Some models (gpt-5 series, o3/o4 series) only support default temperature (1)
      // and don't allow custom temperature values
      const requiresDefaultTemperature = modelId.startsWith('gpt-5') ||
                                        modelId.startsWith('o3') ||
                                        modelId.startsWith('o4')

      // Create completion request
      const completionParams: any = {
        model: params.model,
        messages,
        stream: true,
      }

      // Set temperature only if model supports custom values
      if (!requiresDefaultTemperature) {
        completionParams.temperature = params.temperature ?? 0.7
      } else {
        // gpt-5 series and o3/o4 series only support default temperature (1)
        completionParams.temperature = 1
        console.log(`[OpenAI] Using default temperature (1) for model ${params.model} (model requires default temperature)`)
      }

      // Set the appropriate max tokens parameter
      // IMPORTANT: Never set both - newer models reject max_tokens
      if (usesMaxCompletionTokens) {
        completionParams.max_completion_tokens = params.maxTokens ?? 4096
        console.log(`[OpenAI] Using max_completion_tokens for model ${params.model}`)
      } else {
        completionParams.max_tokens = params.maxTokens ?? 4096
        console.log(`[OpenAI] Using max_tokens for model ${params.model}`)
      }

      // Include tools if model supports them
      if (capabilities.supportsTools && tools.length > 0) {
        completionParams.tools = tools
        completionParams.tool_choice = 'auto'
        console.log(`[OpenAI] Using model ${params.model} with ${tools.length} tools`)
      } else {
        console.log(`[OpenAI] Using model ${params.model} without tools (supportsTools: ${capabilities.supportsTools})`)
      }

      const stream = await openai.chat.completions.create(completionParams)

      let accumulatedContent = ''
      const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>()

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        // Handle content
        if (delta?.content) {
          accumulatedContent += delta.content
          yield {
            content: delta.content,
            done: false,
          }
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index

            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              })
            }

            const existing = toolCallsMap.get(index)!

            if (tc.id) {
              existing.id = tc.id
            }
            if (tc.function?.name) {
              existing.name = tc.function.name
            }
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments
            }
          }
        }

        // Check if finished
        if (chunk.choices[0]?.finish_reason) {
          // Convert tool calls map to array
          if (toolCallsMap.size > 0) {
            const toolCalls: ToolCall[] = Array.from(toolCallsMap.values()).map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: JSON.parse(tc.arguments || '{}'),
              timestamp: new Date(),
            }))

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
      console.error('OpenAI chat error:', error)
      yield {
        done: true,
        error: error instanceof Error ? error.message : 'OpenAI API error',
      }
    }
  }
}
