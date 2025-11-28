import { GoogleGenerativeAI } from '@google/generative-ai'
import { BaseProvider } from './base'
import { getToolsForProvider } from '../tools'
import type { ChatParams, ChatChunk, ToolCall, Attachment } from '../../../shared/types'

export class GeminiProvider extends BaseProvider {
  id = 'gemini'
  name = 'Google Gemini'
  models = [
    // Gemini 3 series (latest)
    'gemini-3-pro-preview',
    // Gemini 2.5 series
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    // Gemini 2.0 series
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ]
  supportsVision = true
  supportsTools = true

  constructor() {
    super()
    
    // All Gemini models support full browser automation (vision + tools)
    this.models.forEach(model => {
      this.modelCapabilities.set(model, { supportsVision: true, supportsTools: true })
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      yield {
        done: true,
        error: 'Google AI API key not configured. Please set your API key in Settings.',
      }
      return
    }

    const genAI = new GoogleGenerativeAI(apiKey)

    try {
      // Get model
      const model = genAI.getGenerativeModel({ model: params.model })

      // Get model-specific capabilities (needed outside the loop)
      const capabilities = this.getModelCapabilities(params.model)

      // Build contents array for Gemini format
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = []

      // Add conversation messages
      for (const msg of params.messages) {
        if (msg.role === 'user') {
          const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []
          const isLastUserMessage = msg === params.messages[params.messages.length - 1]
          const hasAttachments = isLastUserMessage && (
            (params.attachments && params.attachments.length > 0) ||
            (params.images && params.images.length > 0)
          )

          // Add text content
          parts.push({ text: msg.content })

          // Add attachments if model supports vision and this is the last user message
          if (capabilities.supportsVision && hasAttachments) {
            // Add new-style attachments
            if (params.attachments) {
              for (const attachment of params.attachments) {
                const match = attachment.data.match(/^data:([^;]+);base64,(.+)$/)
                if (!match) continue

                const mimeType = match[1]
                const base64Data = match[2]

                if (attachment.type === 'image' || mimeType === 'application/pdf') {
                  // Images and PDFs - Gemini supports both natively
                  parts.push({
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  })
                } else if (attachment.type === 'text' || attachment.type === 'code') {
                  // Text-based files - include as text
                  const textContent = attachment.extractedText ||
                    Buffer.from(base64Data, 'base64').toString('utf8')
                  parts.push({
                    text: `--- File: ${attachment.name} ---\n${textContent}\n--- End of ${attachment.name} ---`,
                  })
                } else if (attachment.extractedText) {
                  // Other documents with extracted text
                  parts.push({
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
                  parts.push({
                    inlineData: {
                      mimeType: match[1],
                      data: match[2],
                    },
                  })
                }
              }
            }
          }

          contents.push({ role: 'user', parts })
        } else if (msg.role === 'assistant') {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }],
          })
        } else if (msg.role === 'tool') {
          // Tool results go as user messages in Gemini
          contents.push({
            role: 'user',
            parts: [{ text: `[Tool Results]\n${msg.content}` }],
          })
        }
        // System messages are handled separately
      }

      // Build generation config
      const generationConfig: any = {
        temperature: params.temperature ?? 0.7,
        maxOutputTokens: params.maxTokens ?? 4096,
      }

      // Get tools in Gemini format (only if model supports tools)
      const browserTools = capabilities.supportsTools ? getToolsForProvider('gemini') : []

      // Build request options
      const requestOptions: any = {
        contents,
        generationConfig,
      }

      // Add system instruction if provided
      if (params.systemPrompt) {
        requestOptions.systemInstruction = params.systemPrompt
      }

      // Add tools if model supports them
      if (capabilities.supportsTools && browserTools.length > 0) {
        requestOptions.tools = [{
          functionDeclarations: browserTools,
        }]
        console.log(`[Gemini] Using model ${params.model} with ${browserTools.length} tools`)
      } else {
        console.log(`[Gemini] Using model ${params.model} without tools (supportsTools: ${capabilities.supportsTools})`)
      }

      // Generate content with streaming
      const result = await model.generateContentStream(requestOptions)

      let accumulatedText = ''
      const toolCalls: ToolCall[] = []

      for await (const chunk of result.stream) {
        const candidate = chunk.candidates?.[0]

        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            // Handle text content
            if (part.text) {
              accumulatedText += part.text
              yield {
                content: part.text,
                done: false,
              }
            }

            // Handle function calls
            if (part.functionCall) {
              toolCalls.push({
                id: `gemini-${Date.now()}-${toolCalls.length}`,
                name: part.functionCall.name,
                arguments: part.functionCall.args as Record<string, any>,
                timestamp: new Date(),
              })
            }
          }
        }
      }

      // Final chunk
      if (toolCalls.length > 0) {
        yield {
          toolCalls,
          done: true,
        }
      } else {
        yield { done: true }
      }
    } catch (error) {
      console.error('Gemini chat error:', error)
      yield {
        done: true,
        error: error instanceof Error ? error.message : 'Google AI API error',
      }
    }
  }
}
