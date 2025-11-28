/**
 * Local Model Integration for Cost Optimization
 * 
 * Uses a small local model (e.g., Ollama with Llama 3.2 3B) to handle
 * preprocessing tasks silently, reducing expensive API calls for premium models.
 * 
 * This is especially effective for web search workflows where simple tasks
 * (intent detection, query extraction, result filtering) don't require
 * premium model capabilities.
 */

import type { Message } from '../../shared/types'

export interface SearchIntent {
  isSearch: boolean
  query?: string
  searchEngine?: 'google' | 'bing' | 'duckduckgo'
  needsPremiumModel: boolean // Complex reasoning needed?
  confidence: number // 0.0-1.0
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
  relevance: number // 0.0-1.0
}

export interface SearchPlan {
  steps: Array<{
    query: string
    searchEngine: string
    expectedResult: string
  }>
  needsPremiumSynthesis: boolean
}

export interface QuerySimilarity {
  isSimilar: boolean
  similarityScore: number
  cachedQuery?: string
}

class LocalModelClient {
  private enabled: boolean = false
  private provider: 'ollama' | 'transformers' | 'onnx' = 'ollama'
  private model: string = 'llama3.2:3b'
  private host: string = 'http://localhost:11434'
  private availabilityTimeout: number = 5000 // Short timeout for availability checks
  private generationTimeout: number = 30000 // Longer timeout for generation (30 seconds)
  private fallbackToCloud: boolean = true

  // Preferred models in order of preference (small models suitable for preprocessing)
  private readonly preferredModels = [
    'llama3.2:3b',
    'llama3.2',
    'qwen2.5:1.5b',
    'qwen2.5:0.5b',
    'qwen2.5',
    'gemma:2b',
    'gemma:2b-instruct',
    'tinyllama:latest',
    'tinyllama',
    'phi3:mini',
    'phi3-mini',
  ]

  constructor() {
    // Check if local model is available
    this.checkAvailability()
  }

  /**
   * Find a suitable model from available models
   * Returns the model name if found, null otherwise
   */
  private findSuitableModel(availableModels: any[]): string | null {
    const modelNames = availableModels.map((m: any) => m.name)
    
    // Helper to normalize model names for comparison (remove tags, lowercase)
    const normalizeModelName = (name: string): string => {
      return name.split(':')[0].toLowerCase().trim()
    }
    
    // First, try exact match or partial match with preferred model
    for (const preferred of this.preferredModels) {
      const found = modelNames.find((name: string) => {
        // Exact match
        if (name === preferred) return true
        // Case-insensitive exact match
        if (name.toLowerCase() === preferred.toLowerCase()) return true
        // Check if either contains the other (handles "llama3.2" vs "llama3.2:3b")
        if (name.includes(preferred) || preferred.includes(name)) return true
        // Check base name match (e.g., "llama3.2" matches "llama3.2:3b")
        const nameBase = normalizeModelName(name)
        const preferredBase = normalizeModelName(preferred)
        if (nameBase === preferredBase) return true
        return false
      })
      if (found) {
        return found
      }
    }
    
    // If no preferred model found, look for any small model (< 3B parameters)
    // Small models are better for preprocessing tasks
    const smallModel = availableModels.find((m: any) => {
      const size = m.details?.parameter_size
      if (!size) return false
      // Extract number from strings like "1.5B", "3B", "7.6B"
      const match = size.match(/(\d+\.?\d*)/)
      if (!match) return false
      const paramSize = parseFloat(match[1])
      return paramSize <= 3.0 // 3B or smaller
    })
    
    if (smallModel) {
      return smallModel.name
    }
    
    return null
  }

  /**
   * Check if local model service is available
   */
  private async checkAvailability(): Promise<void> {
    try {
      if (this.provider === 'ollama') {
        const response = await fetch(`${this.host}/api/tags`, {
          signal: AbortSignal.timeout(this.availabilityTimeout),
        })
        if (response.ok) {
          const data = await response.json()
          const availableModels = data.models || []
          
          // Try to find a suitable model
          const foundModel = this.findSuitableModel(availableModels)
          
          if (foundModel) {
            this.model = foundModel
            this.enabled = true
            if (foundModel !== 'llama3.2:3b') {
              console.log(`[Local Model] ✅ Available (using model: ${foundModel} instead of preferred llama3.2:3b)`)
            } else {
              console.log(`[Local Model] ✅ Available (model: ${this.model})`)
            }
          } else {
            this.enabled = false
            const modelNames = availableModels.map((m: any) => m.name).join(', ') || 'none'
            console.log(`[Local Model] ❌ No suitable model found. Preferred: "${this.preferredModels[0]}"`)
            console.log(`[Local Model]    Available models: ${modelNames}`)
            console.log(`[Local Model] 💡 To install preferred model: ollama pull ${this.preferredModels[0]}`)
            console.log(`[Local Model] 💡 Or install alternative: ollama pull qwen2.5:1.5b`)
          }
        } else {
          this.enabled = false
          console.log(`[Local Model] ❌ Ollama service responded with status ${response.status}`)
          console.log(`[Local Model] 💡 Make sure Ollama is running: ollama serve`)
        }
      }
    } catch (error) {
      this.enabled = false
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[Local Model] ❌ Service not available: ${errorMsg}`)
      console.log(`[Local Model] 💡 Troubleshooting:`)
      console.log(`[Local Model]    1. Install Ollama: curl -fsSL https://ollama.com/install.sh | sh`)
      console.log(`[Local Model]    2. Start Ollama: ollama serve (or it may run as a service)`)
      console.log(`[Local Model]    3. Pull model: ollama pull ${this.preferredModels[0]}`)
      console.log(`[Local Model]    4. Verify: curl http://localhost:11434/api/tags`)
      console.log(`[Local Model] ⚠️  Falling back to cloud models only`)
    }
  }

  /**
   * Generate response from local model
   */
  private async generate(prompt: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('Local model not available')
    }

    try {
      if (this.provider === 'ollama') {
        const response = await fetch(`${this.host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
            options: {
              temperature: 0.3, // Lower temperature for more consistent results
              top_p: 0.9,
            },
          }),
          signal: AbortSignal.timeout(this.generationTimeout),
        })

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`)
        }

        const data = await response.json()
        return data.response || ''
      }

      throw new Error(`Unsupported provider: ${this.provider}`)
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error(`[Local Model] Generation timeout after ${this.generationTimeout}ms`)
        console.error(`[Local Model] Model may be slow or overloaded. Consider using a faster model or increasing timeout.`)
      } else {
        console.error('[Local Model] Generation error:', error)
      }
      throw error
    }
  }

  /**
   * Parse JSON response from local model (with fallback)
   */
  private parseJSONResponse(text: string): any {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }
      // Try direct JSON parse
      return JSON.parse(text)
    } catch (error) {
      console.warn('[Local Model] Failed to parse JSON, returning raw text:', error)
      return { error: 'Failed to parse response', raw: text }
    }
  }

  /**
   * Classify search intent from user message
   * 
   * This is called BEFORE sending to expensive LLM to detect if user wants to search.
   * If search is detected, we can skip expensive LLM for query formulation.
   */
  async classifySearchIntent(userMessage: string): Promise<SearchIntent | null> {
    if (!this.enabled) {
      return null
    }

    try {
      const prompt = `Analyze this user message and extract search intent.

User message: "${userMessage}"

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "isSearch": boolean,
  "query": "extracted search query or null",
  "searchEngine": "google|bing|duckduckgo|null",
  "needsPremiumModel": boolean,
  "confidence": 0.0-1.0
}

Rules:
- Set isSearch=true if user wants to search the web
- Extract the actual search query (remove words like "search for", "find", etc.)
- Default to "google" unless user specifies otherwise
- Set needsPremiumModel=true only if query requires complex reasoning, comparison, or multi-step search
- Set confidence based on how certain you are (0.9+ for clear searches, 0.5-0.8 for ambiguous)

Examples:
- "Search for Python tutorials" → {"isSearch": true, "query": "Python tutorials", "searchEngine": "google", "needsPremiumModel": false, "confidence": 0.95}
- "What's the weather?" → {"isSearch": false, "query": null, "searchEngine": null, "needsPremiumModel": false, "confidence": 0.8}
- "Compare iPhone 15 vs Samsung S24" → {"isSearch": true, "query": "iPhone 15 vs Samsung S24", "searchEngine": "google", "needsPremiumModel": true, "confidence": 0.9}`

      const response = await this.generate(prompt)
      const result = this.parseJSONResponse(response)

      // Validate result
      if (result.isSearch === undefined || result.confidence === undefined) {
        console.warn('[Local Model] Invalid search intent response:', result)
        return null
      }

      // Only return if confidence is high enough
      if (result.confidence < 0.5) {
        console.log('[Local Model] Low confidence search intent, falling back to cloud model')
        return null
      }

      return result as SearchIntent
    } catch (error) {
      console.error('[Local Model] Search intent classification error:', error)
      return null // Fallback to cloud model
    }
  }

  /**
   * Extract search results from page content
   * 
   * This processes search result pages to extract structured data,
   * reducing the amount of content sent to expensive LLM.
   */
  async extractSearchResults(pageText: string, query: string): Promise<SearchResult[] | null> {
    if (!this.enabled) {
      return null
    }

    try {
      // Limit page text to avoid token bloat
      const limitedText = pageText.substring(0, 10000)

      const prompt = `Extract search results from this page content.

Search query: "${query}"

Page content:
${limitedText}

Respond ONLY with valid JSON array (no markdown, no explanation):
[
  {
    "title": "result title",
    "url": "result URL",
    "snippet": "result description/snippet",
    "relevance": 0.0-1.0
  }
]

Rules:
- Extract all search results (usually 5-10 per page)
- Set relevance based on how well result matches query (1.0 = perfect match, 0.0 = not relevant)
- Only include results that are relevant (relevance > 0.3)
- Extract actual URLs, not relative paths
- Keep snippets concise (max 200 characters)`

      const response = await this.generate(prompt)
      const results = this.parseJSONResponse(response)

      if (!Array.isArray(results)) {
        console.warn('[Local Model] Invalid search results format:', results)
        return null
      }

      // Filter and sort by relevance
      const filtered = results
        .filter((r: any) => r.title && r.url && r.relevance > 0.3)
        .sort((a: any, b: any) => b.relevance - a.relevance)
        .slice(0, 10) // Top 10 results

      return filtered as SearchResult[]
    } catch (error) {
      console.error('[Local Model] Search result extraction error:', error)
      return null // Fallback to cloud model
    }
  }

  /**
   * Plan multi-step search strategy
   * 
   * Breaks down complex searches into steps, allowing local model
   * to handle execution while expensive model handles synthesis.
   */
  async planSearchStrategy(
    userMessage: string,
    conversationHistory: Message[]
  ): Promise<SearchPlan | null> {
    if (!this.enabled) {
      return null
    }

    try {
      const recentHistory = conversationHistory.slice(-3).map(m => 
        `${m.role}: ${m.content.substring(0, 200)}`
      ).join('\n')

      const prompt = `Plan a search strategy for this request.

User request: "${userMessage}"

Recent conversation:
${recentHistory || 'No previous messages'}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "steps": [
    {
      "query": "search query for this step",
      "searchEngine": "google|bing|duckduckgo",
      "expectedResult": "what we're looking for in this step"
    }
  ],
  "needsPremiumSynthesis": boolean
}

Rules:
- Break complex searches into multiple steps
- Each step should be a single, focused search query
- Set needsPremiumSynthesis=true if:
  * Multiple results need comparison
  * Complex reasoning/analysis required
  * User asks for opinion/insight
- Set needsPremiumSynthesis=false for simple fact-finding

Example:
- "Compare iPhone 15 vs Samsung S24" → 2 steps (one for each phone)
- "Find Python tutorials" → 1 step (simple search)`

      const response = await this.generate(prompt)
      const plan = this.parseJSONResponse(response)

      if (!plan.steps || !Array.isArray(plan.steps)) {
        console.warn('[Local Model] Invalid search plan format:', plan)
        return null
      }

      return plan as SearchPlan
    } catch (error) {
      console.error('[Local Model] Search planning error:', error)
      return null
    }
  }

  /**
   * Detect if new query is similar to previous queries
   * 
   * Helps avoid redundant searches and can suggest cached results.
   */
  async detectSimilarQuery(
    newQuery: string,
    previousQueries: string[]
  ): Promise<QuerySimilarity | null> {
    if (!this.enabled || previousQueries.length === 0) {
      return null
    }

    try {
      const prompt = `Compare this new search query with previous queries.

New query: "${newQuery}"
Previous queries: ${previousQueries.map(q => `"${q}"`).join(', ')}

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "isSimilar": boolean,
  "similarityScore": 0.0-1.0,
  "cachedQuery": "most similar previous query or null"
}

Rules:
- Set isSimilar=true if similarityScore > 0.7
- Consider queries similar if:
  * Same topic but different wording
  * Refinement of previous query (e.g., "Python" → "Python tutorials")
  * Same intent, different phrasing
- Set cachedQuery to the most similar previous query (if isSimilar=true)`

      const response = await this.generate(prompt)
      const similarity = this.parseJSONResponse(response)

      if (similarity.isSimilar === undefined || similarity.similarityScore === undefined) {
        console.warn('[Local Model] Invalid similarity response:', similarity)
        return null
      }

      return similarity as QuerySimilarity
    } catch (error) {
      console.error('[Local Model] Similarity detection error:', error)
      return null
    }
  }

  /**
   * Check if local model is enabled and available
   */
  isAvailable(): boolean {
    return this.enabled
  }

  /**
   * Enable/disable local model (for testing or configuration)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}

// Singleton instance
export const localModel = new LocalModelClient()

