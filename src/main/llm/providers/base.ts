import type { LLMProvider, ChatParams, ChatChunk, ModelCapabilities } from '../../../shared/types'
import { apiKeyManager } from '../apiKeys'

export abstract class BaseProvider implements LLMProvider {
  abstract id: string
  abstract name: string
  abstract models: string[]
  abstract supportsVision: boolean
  abstract supportsTools: boolean

  // Per-model capabilities map
  protected modelCapabilities: Map<string, ModelCapabilities> = new Map()

  abstract chat(params: ChatParams): AsyncIterable<ChatChunk>

  // Get capabilities for a specific model, fallback to provider defaults
  getModelCapabilities(model: string): ModelCapabilities {
    return this.modelCapabilities.get(model) || {
      supportsVision: this.supportsVision,
      supportsTools: this.supportsTools,
    }
  }

  protected async getApiKey(): Promise<string | null> {
    return await apiKeyManager.get(this.id)
  }

  protected async validateApiKey(): Promise<boolean> {
    const key = await this.getApiKey()
    return key !== null && key.length > 0
  }

  async setApiKey(key: string): Promise<boolean> {
    return await apiKeyManager.store(this.id, key)
  }
}

