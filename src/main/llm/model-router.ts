/**
 * Model Router - Routes tasks to appropriate model tier based on complexity
 * 
 * This helps optimize costs by using cheaper models for simple tasks
 * and expensive models only when needed.
 */

export type TaskComplexity = 'simple' | 'medium' | 'complex'

const MODEL_TIERS = {
  simple: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
    gemini: 'gemini-2.5-latest',
    deepseek: 'deepseek-chat', // Cheapest option for simple tasks
  },
  medium: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20250929',
    gemini: 'gemini-pro',
    deepseek: 'deepseek-chat',
  },
  complex: {
    openai: 'gpt-5',
    anthropic: 'claude-opus-4-5-20251101',
    gemini: 'gemini-pro', // Fallback, update when better model available
    deepseek: 'deepseek-reasoner', // Use reasoner for complex tasks
  },
}

/**
 * Classifies task complexity based on user message and context
 */
export function classifyTaskComplexity(
  userMessage: string,
  hasToolCalls: boolean,
  conversationLength: number,
  hasImages: boolean = false
): TaskComplexity {
  const messageLength = userMessage.length
  
  // Simple tasks:
  // - Short messages (< 100 chars)
  // - No tool calls
  // - Short conversations (< 5 messages)
  // - No images
  if (!hasToolCalls && messageLength < 100 && conversationLength < 5 && !hasImages) {
    return 'simple'
  }
  
  // Complex tasks:
  // - Long messages (> 500 chars)
  // - Multiple tool calls
  // - Long conversations (> 20 messages)
  // - Has images (vision processing)
  if (
    (hasToolCalls && messageLength > 500) ||
    (conversationLength > 20 && hasToolCalls) ||
    hasImages
  ) {
    return 'complex'
  }
  
  // Default: medium complexity
  return 'medium'
}

/**
 * Selects appropriate model for task based on complexity
 * 
 * @param provider - The LLM provider (openai, anthropic, gemini)
 * @param complexity - Task complexity level
 * @param userSelectedModel - Model explicitly selected by user (optional)
 * @param allowDowngrade - Whether to allow downgrading from user's selection (default: true)
 * @returns Selected model name
 */
export function selectModelForTask(
  provider: string,
  complexity: TaskComplexity,
  userSelectedModel?: string,
  allowDowngrade: boolean = true
): string {
  // If user explicitly selected an expensive model, respect their choice
  // (unless allowDowngrade is false and task is simple)
  const expensiveModels = [
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1-2025-04-14',
    'claude-opus-4-5-20251101',
    'claude-opus-4-1-20250805',
    'claude-opus-4-20250514',
    'o3',
    'o3-pro',
  ]
  
  if (userSelectedModel) {
    const isExpensive = expensiveModels.includes(userSelectedModel)
    
    // If user selected expensive model and task is simple, optionally downgrade
    if (isExpensive && complexity === 'simple' && allowDowngrade) {
      console.log(
        `[Model Router] Downgrading from ${userSelectedModel} to ${MODEL_TIERS.simple[provider as keyof typeof MODEL_TIERS.simple]} for simple task`
      )
      return MODEL_TIERS.simple[provider as keyof typeof MODEL_TIERS.simple] || userSelectedModel
    }
    
    // Otherwise, use user's selection
    return userSelectedModel
  }
  
  // Route based on complexity
  const tierModels = MODEL_TIERS[complexity]
  const selectedModel = tierModels[provider as keyof typeof tierModels]
  
  if (!selectedModel) {
    console.warn(`[Model Router] No model found for provider: ${provider}, complexity: ${complexity}`)
    // Fallback to medium tier
    return MODEL_TIERS.medium[provider as keyof typeof MODEL_TIERS.medium] || 'gpt-4o-mini'
  }
  
  return selectedModel
}

/**
 * Gets cost savings estimate from model routing
 */
export function getRoutingSavings(
  originalModel: string,
  routedModel: string,
  inputTokens: number,
  outputTokens: number
): { savings: number; percentage: number } {
  // Import cost tracker functions
  const { estimateCost } = require('./cost-tracker')
  
  const originalCost = estimateCost(originalModel, inputTokens, outputTokens)
  const routedCost = estimateCost(routedModel, inputTokens, outputTokens)
  
  const savings = originalCost - routedCost
  const percentage = originalCost > 0 ? (savings / originalCost) * 100 : 0
  
  return { savings, percentage }
}



