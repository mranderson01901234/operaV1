// src/main/research/llm-adapter.ts

/**
 * Adapter to bridge research system with existing LLM router
 */

import { llmRouter } from '../llm/router'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

export class ResearchLLMAdapter implements LLMClient {
  constructor(private router = llmRouter) {}

  async complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }> {
    // Convert messages format
    const formattedMessages = params.messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }))

    // Determine provider from model
    let providerId = 'gemini' // Default
    if (params.model.startsWith('gpt-')) {
      providerId = 'openai'
    } else if (params.model.startsWith('claude-')) {
      providerId = 'anthropic'
    }

    // Stream and collect response
    let fullContent = ''
    try {
      for await (const chunk of this.router.chat(providerId, {
        model: params.model,
        messages: formattedMessages,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        stream: true,
      })) {
        if (chunk.content) {
          fullContent += chunk.content
        }
        if (chunk.done) {
          if (chunk.error) {
            throw new Error(chunk.error)
          }
          break
        }
      }
    } catch (error) {
      console.error('[ResearchLLMAdapter] LLM call failed:', error)
      throw error
    }

    return { content: fullContent }
  }
}

