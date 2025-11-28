import OpenAI from 'openai'
import { BaseProvider } from './base'
import { getToolsForProvider } from '../tools'
import type { ChatParams, ChatChunk, ToolCall, Attachment } from '../../../shared/types'

export class DeepSeekProvider extends BaseProvider {
  id = 'deepseek'
  name = 'DeepSeek'
  models = [
    // DeepSeek V3.2 series (latest)
    'deepseek-chat',           // Standard chat model
    'deepseek-reasoner',       // Reasoning model with extended thinking
    'deepseek-v3',             // V3 model
    'deepseek-v2',           // V2 model (legacy)
  ]
  supportsVision = false  // DeepSeek doesn't support vision currently
  supportsTools = true   // Supports function calling

  constructor() {
    super()
    
    // All DeepSeek models support tools
    this.models.forEach(model => {
      this.modelCapabilities.set(model, { 
        supportsVision: false, 
        supportsTools: true 
      })
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      yield {
        done: true,
        error: 'DeepSeek API key not configured. Please set your API key in Settings.',
      }
      return
    }

    // DeepSeek API is OpenAI-compatible, use OpenAI SDK with custom base URL
    const deepseek = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    })

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
          messages.push({
            role: 'user',
            content: msg.content,
          })
        } else if (msg.role === 'assistant') {
          messages.push({
            role: 'assistant',
            content: msg.content,
          })
        } else if (msg.role === 'tool') {
          // Tool responses
          if (msg.toolCalls) {
            // Add assistant message with tool calls
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
          }
        }
      }

      // Add tool results as tool messages
      for (const msg of params.messages) {
        if (msg.role === 'tool' && msg.toolCalls) {
          for (const toolCall of msg.toolCalls) {
            if (toolCall.result !== undefined) {
              messages.push({
                role: 'tool',
                content: typeof toolCall.result === 'string' 
                  ? toolCall.result 
                  : JSON.stringify(toolCall.result),
                tool_call_id: toolCall.id,
              })
            }
          }
        }
      }

      // Get tools if model supports them
      const tools = capabilities.supportsTools && params.tools
        ? getToolsForProvider('openai', params.tools)
        : undefined

      // Create chat completion with streaming
      const stream = await deepseek.chat.completions.create({
        model: params.model,
        messages,
        tools,
        stream: true,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
      })

      // Stream responses
      let accumulatedContent = ''
      let toolCalls: ToolCall[] = []
      let currentToolCall: Partial<ToolCall> | null = null

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        if (!delta) continue

        // Handle content
        if (delta.content) {
          accumulatedContent += delta.content
          yield {
            content: delta.content,
            done: false,
          }
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index ?? 0

            if (!toolCalls[index]) {
              toolCalls[index] = {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: {},
                timestamp: new Date(),
              }
              currentToolCall = toolCalls[index]
            }

            if (toolCallDelta.function?.name) {
              toolCalls[index].name = toolCallDelta.function.name
            }

            if (toolCallDelta.function?.arguments) {
              const currentArgs = (toolCalls[index].arguments as any) || {}
              try {
                const newArgs = JSON.parse(toolCallDelta.function.arguments)
                toolCalls[index].arguments = { ...currentArgs, ...newArgs }
              } catch {
                // Partial JSON, accumulate
                const argsStr = (currentToolCall?.arguments as any)?._partial || ''
                toolCalls[index].arguments = {
                  ...currentArgs,
                  _partial: argsStr + toolCallDelta.function.arguments,
                }
              }
            }
          }
        }

        // Handle finish reason
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          yield {
            toolCalls,
            done: false,
          }
        }
      }

      // Final yield
      yield {
        content: accumulatedContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        done: true,
      }
    } catch (error) {
      console.error('DeepSeek chat error:', error)
      yield {
        done: true,
        error: error instanceof Error ? error.message : 'DeepSeek API error',
      }
    }
  }
}

