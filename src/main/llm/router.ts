import type { ChatParams, ChatChunk } from '../../shared/types'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { GeminiProvider } from './providers/gemini'
import { DeepSeekProvider } from './providers/deepseek'
import type { LLMProvider as LLMProviderInterface } from '../../shared/types'
import { countRequestTokens, estimateTokens, logCostInfo } from './cost-tracker'
import { classifyTaskComplexity, selectModelForTask } from './model-router'

class LLMRouter {
  private providers = new Map<string, LLMProviderInterface>()

  constructor() {
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('anthropic', new AnthropicProvider())
    this.providers.set('gemini', new GeminiProvider())
    this.providers.set('deepseek', new DeepSeekProvider())
  }

  getProvider(providerId: string): LLMProviderInterface | null {
    return this.providers.get(providerId) || null
  }

  async *chat(providerId: string, params: ChatParams): AsyncIterable<ChatChunk> {
    const provider = this.getProvider(providerId)
    if (!provider) {
      yield {
        done: true,
        error: `Provider ${providerId} not found`,
      }
      return
    }

    // Count input tokens for cost tracking (internal only)
    const inputTokens = countRequestTokens(
      params.messages,
      params.images,
      params.systemPrompt
    )

    // Classify task complexity for model routing
    const lastMessage = params.messages[params.messages.length - 1]
    const userMessage = lastMessage?.content || ''
    const hasToolCalls = params.messages.some(m => m.toolCalls && m.toolCalls.length > 0)
    const conversationLength = params.messages.length
    const hasImages = params.images && params.images.length > 0
    
    // Check if document tools are being used (readDocument, getDocumentSummary)
    // For large file reviews, automatically use DeepSeek (cheapest) or fallback to gemini-2.5-flash
    // DeepSeek is NOT available for manual selection - only used automatically for silent tasks
    const documentTools = ['readDocument', 'getDocumentSummary', 'listDocuments']
    const hasDocumentTools = params.messages.some(m => 
      m.toolCalls?.some(tc => documentTools.includes(tc.name)) ||
      (m.content && documentTools.some(tool => 
        m.content.toLowerCase().includes(tool.toLowerCase()) ||
        m.content.toLowerCase().includes('document') && (
          m.content.toLowerCase().includes('read') ||
          m.content.toLowerCase().includes('review') ||
          m.content.toLowerCase().includes('analyze') ||
          m.content.toLowerCase().includes('excel') ||
          m.content.toLowerCase().includes('file')
        )
      ))
    )
    
    // If document tools are being used, prefer DeepSeek (cheapest) or fallback to gemini-2.5-flash
    if (hasDocumentTools) {
      // Try DeepSeek first (cheapest with cache)
      const deepseekProvider = this.getProvider('deepseek')
      if (deepseekProvider && deepseekProvider.models.includes('deepseek-chat')) {
        // Check if API key exists
        const { apiKeyManager } = await import('./apiKeys')
        const hasApiKey = await apiKeyManager.has('deepseek')
        if (hasApiKey) {
          console.log(
            `[Model Router] Document tools detected. Using DeepSeek for cost efficiency (was: ${providerId}/${params.model})`
          )
          // Switch to DeepSeek provider with deepseek-chat
          const finalParams = { ...params, model: 'deepseek-chat' }
          for await (const chunk of deepseekProvider.chat(finalParams)) {
            yield chunk
          }
          return
        }
      }
      
      // Fallback to Gemini Flash if DeepSeek not available
      const geminiProvider = this.getProvider('gemini')
      if (geminiProvider && geminiProvider.models.includes('gemini-2.5-flash')) {
        console.log(
          `[Model Router] Document tools detected. Using gemini-2.5-flash for cost efficiency (was: ${providerId}/${params.model})`
        )
        // Switch to gemini provider with gemini-2.5-flash
        const finalParams = { ...params, model: 'gemini-2.5-flash' }
        for await (const chunk of geminiProvider.chat(finalParams)) {
          yield chunk
        }
        return
      }
    }
    
    const complexity = classifyTaskComplexity(
      userMessage,
      hasToolCalls,
      conversationLength,
      hasImages
    )

    // Route to appropriate model based on complexity (cost optimization)
    const originalModel = params.model
    const routedModel = selectModelForTask(
      providerId,
      complexity,
      params.model,
      true // allowDowngrade - can use cheaper model for simple tasks
    )

    // Use routed model if different
    const finalModel = routedModel !== originalModel ? routedModel : originalModel
    
    // Route max tokens based on complexity (cost optimization)
    // Simple tasks need less output, complex tasks may need more
    let maxTokens = params.maxTokens
    if (!maxTokens) {
      switch (complexity) {
        case 'simple':
          maxTokens = 1024 // Less output for simple tasks
          break
        case 'medium':
          maxTokens = 2048 // Medium output
          break
        case 'complex':
          maxTokens = 4096 // Full output for complex tasks
          break
      }
    }
    
    const finalParams = { ...params, model: finalModel, maxTokens }

    if (routedModel !== originalModel) {
      console.log(
        `[Model Router] Routed from ${originalModel} to ${routedModel} for ${complexity} task`
      )
    }

    // Validate that the model exists for this provider
    if (!provider.models.includes(finalModel)) {
      yield {
        done: true,
        error: `Model "${finalModel}" is not available for provider "${providerId}". Available models: ${provider.models.slice(0, 5).join(', ')}${provider.models.length > 5 ? '...' : ''}`,
      }
      return
    }

    try {
      // Track output tokens
      let outputTokens = 0
      let accumulatedContent = ''

      // Check for cached context (if available from chatStore)
      const cacheHit = false // TODO: Integrate with context cache if needed

      for await (const chunk of provider.chat(finalParams)) {
        // Accumulate content for token counting
        if (chunk.content) {
          accumulatedContent += chunk.content
        }

        yield chunk
      }

      // Count output tokens after streaming completes
      outputTokens = estimateTokens(accumulatedContent)

      // Log cost information (internal only, not shown to users)
      logCostInfo(finalModel, inputTokens, outputTokens, {
        cacheHit,
        complexity,
      })
    } catch (error) {
      yield {
        done: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  getProviderModels(providerId: string): string[] {
    const provider = this.getProvider(providerId)
    return provider?.models || []
  }

  getModelCapabilities(providerId: string, model: string): { supportsVision: boolean; supportsTools: boolean } | null {
    const provider = this.getProvider(providerId)
    if (!provider || !provider.models.includes(model)) {
      return null
    }
    return provider.getModelCapabilities ? provider.getModelCapabilities(model) : {
      supportsVision: provider.supportsVision,
      supportsTools: provider.supportsTools,
    }
  }
}

export const llmRouter = new LLMRouter()
