/**
 * Cloud Preprocessor for Cost Optimization
 * 
 * Uses Gemini 2.5 Flash (cheapest cloud model) to handle preprocessing tasks
 * silently, reducing expensive API calls for premium models.
 * 
 * This is especially effective for web search workflows where simple tasks
 * (intent detection, query extraction, result filtering) don't require
 * premium model capabilities.
 * 
 * Cost: ~$0.0000675 per search intent classification
 * Speed: 1-3 seconds (much faster than local models)
 */

import type { Message } from '../../shared/types'
import { GeminiProvider } from './providers/gemini'
import { estimateTokens, estimateCost } from './cost-tracker'

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

class CloudPreprocessor {
  private enabled: boolean = false
  private provider: GeminiProvider
  private model: string = 'gemini-2.5-flash'
  private timeout: number = 10000 // 10 seconds (much faster than local)

  constructor() {
    this.provider = new GeminiProvider()
    // Check if provider is available (has API key)
    this.checkAvailability()
  }

  /**
   * Check if cloud preprocessor is available (has API key)
   */
  private async checkAvailability(): Promise<void> {
    try {
      const hasApiKey = await this.provider.validateApiKey()
      if (hasApiKey) {
        this.enabled = true
        console.log(`[Cloud Preprocessor] ✅ Available (model: ${this.model})`)
      } else {
        this.enabled = false
        console.log(`[Cloud Preprocessor] ❌ Gemini API key not configured`)
        console.log(`[Cloud Preprocessor] 💡 Set your Gemini API key in Settings to enable cost optimization`)
      }
    } catch (error) {
      this.enabled = false
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.warn(`[Cloud Preprocessor] ❌ Service not available: ${errorMsg}`)
    }
  }

  /**
   * Generate response from cloud model
   */
  private async generate(prompt: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('Cloud preprocessor not available (missing API key)')
    }

    try {
      const messages: Message[] = [
        {
          role: 'user',
          content: prompt,
        },
      ]

      let responseText = ''
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.timeout)
      })

      const generationPromise = (async () => {
        for await (const chunk of this.provider.chat({
          model: this.model,
          messages,
          maxTokens: 500, // Limit output for cost optimization
          temperature: 0.3, // Lower temperature for more consistent results
        })) {
          if (chunk.content) {
            responseText += chunk.content
          }
          if (chunk.done) {
            break
          }
        }
        return responseText
      })()

      // Race between generation and timeout
      await Promise.race([generationPromise, timeoutPromise])

      // Log cost
      const inputTokens = estimateTokens(prompt)
      const outputTokens = estimateTokens(responseText)
      const cost = estimateCost(this.model, inputTokens, outputTokens)
      console.log(`[Cloud Preprocessor] Cost: $${cost.toFixed(6)} (${inputTokens} in + ${outputTokens} out tokens)`)

      return responseText
    } catch (error) {
      if (error instanceof Error && error.message === 'Request timeout') {
        console.error(`[Cloud Preprocessor] Generation timeout after ${this.timeout}ms`)
      } else {
        console.error('[Cloud Preprocessor] Generation error:', error)
      }
      throw error
    }
  }

  /**
   * Parse JSON response from cloud model (with fallback)
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
      console.warn('[Cloud Preprocessor] Failed to parse JSON, returning raw text:', error)
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

CRITICAL RULES FOR QUERY GENERATION:

1. NEVER include years (2023, 2024, 2025, etc.) in your queries
   - BAD: "OpenAI vs Anthropic comparison 2024"
   - GOOD: "OpenAI vs Anthropic comparison"

2. NEVER add context from your training data
   - BAD: "Claude 3.5 Sonnet pricing" (you're assuming the model name)
   - GOOD: "Claude pricing" or "Anthropic Claude pricing"

3. Keep queries SHORT (3-8 words)
   - BAD: "comprehensive detailed comparison of OpenAI GPT models versus Anthropic Claude models for enterprise LLM provider selection"
   - GOOD: "OpenAI vs Anthropic enterprise comparison"

4. DO NOT include filler words
   - Remove: comprehensive, detailed, complete, ultimate, in-depth, thorough

5. For pricing queries, keep it simple
   - BAD: "GPT-4 API pricing per million tokens 2024 latest"
   - GOOD: "GPT-4 API pricing"

6. For comparisons, just use entity names
   - BAD: "OpenAI ChatGPT vs Anthropic Claude AI assistant comparison pros cons features 2024"
   - GOOD: "OpenAI vs Anthropic comparison"

7. Let Google's recency algorithms work
   - Don't try to force "latest" or "new" or "current" - these often backfire

Rules:
- Set isSearch=true if user wants to search the web
- Extract the actual search query (remove words like "search for", "find", etc.)
- Default to "google" unless user specifies otherwise
- Set needsPremiumModel=true only if query requires complex reasoning, comparison, or multi-step search
- Set confidence based on how certain you are (0.9+ for clear searches, 0.5-0.8 for ambiguous)

Examples:
- "Search for Python tutorials" → {"isSearch": true, "query": "Python tutorials", "searchEngine": "google", "needsPremiumModel": false, "confidence": 0.95}
- "What's the weather?" → {"isSearch": false, "query": null, "searchEngine": null, "needsPremiumModel": false, "confidence": 0.8}
- "Compare iPhone 15 vs Samsung S24" → {"isSearch": true, "query": "iPhone vs Samsung comparison", "searchEngine": "google", "needsPremiumModel": true, "confidence": 0.9}
- "What's the current pricing for Claude?" → {"isSearch": true, "query": "anthropic claude pricing", "searchEngine": "google", "needsPremiumModel": false, "confidence": 0.95}
- "Best LLM providers in 2024" → {"isSearch": true, "query": "best llm providers", "searchEngine": "google", "needsPremiumModel": false, "confidence": 0.9}`

      const response = await this.generate(prompt)
      const result = this.parseJSONResponse(response)

      // Validate result
      if (result.isSearch === undefined || result.confidence === undefined) {
        console.warn('[Cloud Preprocessor] Invalid search intent response:', result)
        return null
      }

      // Only return if confidence is high enough
      if (result.confidence < 0.5) {
        console.log('[Cloud Preprocessor] Low confidence search intent, falling back to cloud model')
        return null
      }

      // Sanitize the query to remove years and filler words
      if (result.query) {
        const { sanitizeSearchQuery } = await import('../browser/search-utils')
        result.query = sanitizeSearchQuery(result.query)
      }

      return result as SearchIntent
    } catch (error) {
      console.error('[Cloud Preprocessor] Search intent classification error:', error)
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
        console.warn('[Cloud Preprocessor] Invalid search results format:', results)
        return null
      }

      // Filter and sort by relevance
      const filtered = results
        .filter((r: any) => r.title && r.url && r.relevance > 0.3)
        .sort((a: any, b: any) => b.relevance - a.relevance)
        .slice(0, 10) // Top 10 results

      return filtered as SearchResult[]
    } catch (error) {
      console.error('[Cloud Preprocessor] Search result extraction error:', error)
      return null // Fallback to cloud model
    }
  }

  /**
   * Plan multi-step search strategy
   * 
   * Breaks down complex searches into steps, allowing cheap model
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
        console.warn('[Cloud Preprocessor] Invalid search plan format:', plan)
        return null
      }

      return plan as SearchPlan
    } catch (error) {
      console.error('[Cloud Preprocessor] Search planning error:', error)
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
        console.warn('[Cloud Preprocessor] Invalid similarity response:', similarity)
        return null
      }

      return similarity as QuerySimilarity
    } catch (error) {
      console.error('[Cloud Preprocessor] Similarity detection error:', error)
      return null
    }
  }

  /**
   * Check if cloud preprocessor is enabled and available
   */
  isAvailable(): boolean {
    return this.enabled
  }

  /**
   * Enable/disable cloud preprocessor (for testing or configuration)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}

// Singleton instance
export const cloudPreprocessor = new CloudPreprocessor()

