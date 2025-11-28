/**
 * Cost Tracker - Internal token counting and cost estimation
 * 
 * NOTE: This is for internal tracking only. Costs are NOT shown to users
 * per business decision.
 */

export interface TokenCount {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface ModelPricing {
  inputCostPer1M: number  // Cost per 1M input tokens
  outputCostPer1M: number  // Cost per 1M output tokens
}

// Model pricing (as of 2024, update as needed)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-5': { inputCostPer1M: 10, outputCostPer1M: 30 },
  'gpt-5-mini': { inputCostPer1M: 0.5, outputCostPer1M: 1.5 },
  'gpt-5-nano': { inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  'gpt-4.1-2025-04-14': { inputCostPer1M: 5, outputCostPer1M: 15 },
  'gpt-4.1-mini-2025-04-14': { inputCostPer1M: 0.3, outputCostPer1M: 1.2 },
  'gpt-4.1-nano-2025-04-14': { inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  'gpt-4o': { inputCostPer1M: 2.5, outputCostPer1M: 10 },
  'gpt-4o-mini': { inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  'o3': { inputCostPer1M: 15, outputCostPer1M: 60 },
  'o3-pro': { inputCostPer1M: 30, outputCostPer1M: 120 },
  'o4-mini': { inputCostPer1M: 5, outputCostPer1M: 20 },
  
  // Anthropic models
  'claude-opus-4-5-20251101': { inputCostPer1M: 5, outputCostPer1M: 15 },
  'claude-opus-4-1-20250805': { inputCostPer1M: 5, outputCostPer1M: 15 },
  'claude-opus-4-20250514': { inputCostPer1M: 5, outputCostPer1M: 15 },
  'claude-sonnet-4-5-20250929': { inputCostPer1M: 3, outputCostPer1M: 15 },
  'claude-sonnet-4-20250514': { inputCostPer1M: 3, outputCostPer1M: 15 },
  'claude-3-7-sonnet-20250219': { inputCostPer1M: 3, outputCostPer1M: 15 },
  'claude-3-5-haiku-20241022': { inputCostPer1M: 0.25, outputCostPer1M: 1.25 },
  
  // Gemini models (approximate, update with actual pricing)
  'gemini-2.5-latest': { inputCostPer1M: 0.075, outputCostPer1M: 0.3 },
  'gemini-2.5-flash': { inputCostPer1M: 0.075, outputCostPer1M: 0.3 },
  'gemini-2.5-flash-lite': { inputCostPer1M: 0.075, outputCostPer1M: 0.3 },
  'gemini-2.5-pro': { inputCostPer1M: 0.5, outputCostPer1M: 1.5 },
  'gemini-pro': { inputCostPer1M: 0.5, outputCostPer1M: 1.5 },
  
  // DeepSeek models (V3.2 pricing - cache hit rates vary)
  'deepseek-chat': { inputCostPer1M: 0.028, outputCostPer1M: 0.42 }, // Cache hit pricing
  'deepseek-reasoner': { inputCostPer1M: 0.028, outputCostPer1M: 0.42 }, // Cache hit pricing
  'deepseek-v3': { inputCostPer1M: 0.028, outputCostPer1M: 0.42 }, // Cache hit pricing
  'deepseek-v2': { inputCostPer1M: 0.14, outputCostPer1M: 0.28 }, // Legacy pricing
}

/**
 * Estimates token count from text
 * Rough estimation: ~4 characters per token (varies by language/model)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // Rough estimation: ~4 characters per token
  // This is approximate and varies by language/model
  return Math.ceil(text.length / 4)
}

/**
 * Estimates tokens for base64-encoded images
 * Vision models charge differently - roughly ~170 tokens per 512x512 tile
 * Full screenshot ~1024x768 ≈ 4 tiles = ~680 tokens base
 * But vision models typically charge more, estimate ~1500-2500 tokens per screenshot
 */
export function countImageTokens(base64Image: string): number {
  if (!base64Image) return 0
  
  // Remove data URI prefix if present
  const base64Data = base64Image.includes(',') 
    ? base64Image.split(',')[1] 
    : base64Image
  
  // Estimate size in KB
  const sizeKB = (base64Data.length * 3) / 4 / 1024
  
  // Rough estimation: ~170 tokens per 100KB for vision models
  // But add base cost for processing
  const baseTokens = 500 // Base cost for image processing
  const sizeTokens = Math.ceil(sizeKB / 100) * 170
  
  return baseTokens + sizeTokens
}

/**
 * Estimates cost for a model given input and output tokens
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) {
    console.warn(`[Cost Tracker] No pricing data for model: ${model}`)
    return 0
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M
  return inputCost + outputCost
}

/**
 * Counts tokens for a chat request (messages + images)
 */
export function countRequestTokens(
  messages: Array<{ content: string; role?: string }>,
  images?: string[],
  systemPrompt?: string
): number {
  let tokens = 0
  
  // Count system prompt
  if (systemPrompt) {
    tokens += estimateTokens(systemPrompt)
  }
  
  // Count messages
  for (const msg of messages) {
    if (msg.content) {
      tokens += estimateTokens(msg.content)
    }
  }
  
  // Count images (vision models)
  if (images) {
    for (const img of images) {
      tokens += countImageTokens(img)
    }
  }
  
  return tokens
}

/**
 * Logs cost information (internal only, not shown to users)
 */
export function logCostInfo(
  model: string,
  inputTokens: number,
  outputTokens: number,
  context?: { cacheHit?: boolean; complexity?: string }
): void {
  const totalTokens = inputTokens + outputTokens
  const cost = estimateCost(model, inputTokens, outputTokens)
  
  const logParts = [
    `[Cost] Model: ${model}`,
    `Tokens: ${inputTokens} in + ${outputTokens} out = ${totalTokens} total`,
    `Cost: $${cost.toFixed(4)}`,
  ]
  
  if (context?.cacheHit) {
    logParts.push('(cached context)')
  }
  
  if (context?.complexity) {
    logParts.push(`[${context.complexity}]`)
  }
  
  console.log(logParts.join(' | '))
}

