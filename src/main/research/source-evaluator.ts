// src/main/research/source-evaluator.ts

import { ExtractedContent, SourceEvaluation, ExtractedFact, SubQuestion } from './types'
import { FACT_EXTRACTION_PROMPT } from './prompts'
import { extractAndParseJson } from './json-utils'
import { filterValidFacts, scoreFact } from './fact-validator'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

// Domain authority scores (0-100)
const DOMAIN_AUTHORITY: Record<string, number> = {
  // Official sources
  'openai.com': 100,
  'anthropic.com': 100,
  'cloud.google.com': 100,
  'azure.microsoft.com': 100,
  'aws.amazon.com': 100,
  
  // High-quality publications
  'techcrunch.com': 85,
  'theverge.com': 85,
  'wired.com': 85,
  'arstechnica.com': 85,
  'reuters.com': 90,
  'bloomberg.com': 90,
  
  // Developer resources
  'github.com': 80,
  'stackoverflow.com': 75,
  'dev.to': 65,
  'medium.com': 60,
  
  // Lower quality
  'reddit.com': 50,
  'quora.com': 45,
  'twitter.com': 40,
  'x.com': 40,
}

export class SourceEvaluator {
  private readonly MAX_CONCURRENT_EVALUATIONS = 5 // Process 5 sources concurrently
  
  constructor(private llm: LLMClient) {}

  async evaluateAll(
    contents: ExtractedContent[],
    subQuestions: SubQuestion[]
  ): Promise<SourceEvaluation[]> {
    const startTime = performance.now()
    const evaluations: SourceEvaluation[] = []
    
    // Process in batches to parallelize LLM calls while respecting concurrency limits
    const batches = this.chunk(contents, this.MAX_CONCURRENT_EVALUATIONS)
    
    for (const batch of batches) {
      // Process batch concurrently
      const batchEvaluations = await Promise.allSettled(
        batch.map(content => this.evaluateSource(content, subQuestions))
      )
      
      // Collect successful evaluations
      for (const result of batchEvaluations) {
        if (result.status === 'fulfilled') {
          evaluations.push(result.value)
        } else {
          console.error(`[SourceEvaluator] Evaluation failed:`, result.reason)
        }
      }
    }
    
    // Sort by overall score
    evaluations.sort((a, b) => b.overallScore - a.overallScore)
    
    const duration = performance.now() - startTime
    console.log(`[SourceEvaluator] Evaluated ${evaluations.length}/${contents.length} sources in ${duration.toFixed(0)}ms (${(contents.length / (duration / 1000)).toFixed(1)} sources/sec)`)
    
    return evaluations
  }
  
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
  
  private async evaluateSource(
    content: ExtractedContent,
    subQuestions: SubQuestion[]
  ): Promise<SourceEvaluation> {
    // Calculate authority score
    const authorityScore = this.calculateAuthorityScore(content.domain)
    
    // Calculate recency score
    const recencyScore = this.calculateRecencyScore(content.publishDate)
    
    // Calculate relevance score
    const relevanceScore = this.calculateRelevanceScore(content, subQuestions)
    
    // Extract facts using LLM
    const rawFacts = await this.extractFacts(content)
    
    // FILTER OUT INVALID FACTS (CSS, JS, etc.)
    const validFacts = filterValidFacts(rawFacts)
    
    // Score remaining facts
    const extractedFacts = validFacts.map(fact => ({
      ...fact,
      confidence: scoreFact(fact),
    }))
    
    console.log(`[SourceEvaluator] ${content.url}: ${rawFacts.length} raw facts -> ${extractedFacts.length} valid facts`)
    
    // Calculate overall score (weighted)
    const overallScore = Math.round(
      authorityScore * 0.35 +
      recencyScore * 0.30 +
      relevanceScore * 0.35
    )
    
    return {
      url: content.url,
      domain: content.domain,
      authorityScore,
      recencyScore,
      relevanceScore,
      overallScore,
      extractedFacts,
      content,
    }
  }
  
  private calculateAuthorityScore(domain: string): number {
    // Check exact match first
    if (DOMAIN_AUTHORITY[domain]) {
      return DOMAIN_AUTHORITY[domain]
    }
    
    // Check if it's a subdomain of known domain
    for (const [knownDomain, score] of Object.entries(DOMAIN_AUTHORITY)) {
      if (domain.endsWith(`.${knownDomain}`)) {
        return score
      }
    }
    
    // Default score for unknown domains
    return 50
  }
  
  private calculateRecencyScore(publishDate?: Date): number {
    if (!publishDate) {
      return 50 // Unknown date, neutral score
    }
    
    const now = new Date()
    const ageMs = now.getTime() - publishDate.getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    
    if (ageDays < 7) return 100      // Within a week
    if (ageDays < 30) return 90      // Within a month
    if (ageDays < 90) return 75     // Within 3 months
    if (ageDays < 180) return 60    // Within 6 months
    if (ageDays < 365) return 45    // Within a year
    if (ageDays < 730) return 30    // Within 2 years
    return 15                        // Older than 2 years
  }
  
  private calculateRelevanceScore(
    content: ExtractedContent,
    subQuestions: SubQuestion[]
  ): number {
    const contentLower = content.mainContent.toLowerCase()
    const titleLower = content.title.toLowerCase()
    
    let matchedQuestions = 0
    let totalKeywordMatches = 0
    
    for (const sq of subQuestions) {
      // Extract keywords from search query
      const keywords = sq.searchQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      
      let questionMatches = 0
      for (const keyword of keywords) {
        if (contentLower.includes(keyword) || titleLower.includes(keyword)) {
          questionMatches++
          totalKeywordMatches++
        }
      }
      
      if (questionMatches >= keywords.length * 0.5) {
        matchedQuestions++
      }
    }
    
    // Score based on question coverage and keyword density
    const questionCoverage = matchedQuestions / subQuestions.length
    const keywordScore = Math.min(totalKeywordMatches / 10, 1) // Cap at 10 matches
    
    return Math.round((questionCoverage * 60) + (keywordScore * 40))
  }
  
  private async extractFacts(content: ExtractedContent): Promise<ExtractedFact[]> {
    // Truncate content to fit in context
    const truncatedContent = content.mainContent.substring(0, 5000)
    
    const prompt = `Extract factual information from this article. 

IMPORTANT RULES:
- Extract ONLY facts from the article content
- DO NOT extract CSS styling information (colors, fonts, sizes, etc.)
- DO NOT extract JavaScript code or configuration
- DO NOT extract website UI elements (buttons, menus, themes)
- Focus on: statistics, dates, names, features, prices, comparisons
- Each fact should be a complete, meaningful statement
- Maximum 15 facts

URL: ${content.url}
DOMAIN: ${content.domain}

ARTICLE CONTENT:
${truncatedContent}

Respond with ONLY valid JSON (no markdown):
{"facts":[{"claim":"statement of fact","value":"specific value if applicable","context":"sentence where fact appears","confidence":80,"category":"pricing|feature|statistic|date|fact"}]}`
    
    const maxRetries = 2
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.llm.complete({
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 4000, // Increased to prevent truncation of JSON responses
          temperature: attempt > 0 ? 0.1 : 0.2, // Lower temperature on retry for more deterministic output
        })
        
        // Use robust JSON parsing
        const parsed = extractAndParseJson(
          response.content,
          {
            requiredFields: ['facts'],
            arrayField: 'facts',
          },
          `fact extraction for ${content.url}`
        )
        
        // Validate facts array
        if (!Array.isArray(parsed.facts)) {
          throw new Error('Invalid structure: facts is not an array')
        }
        
        // Map and return facts
        return parsed.facts.map((f: any) => ({
          claim: f.claim || '',
          value: f.value || '',
          context: f.context || '',
          confidence: typeof f.confidence === 'number' ? f.confidence : 50,
          category: f.category || 'claim',
          sourceUrl: content.url,
        }))
      } catch (error: any) {
        lastError = error
        console.warn(`[SourceEvaluator] Fact extraction attempt ${attempt + 1} failed for ${content.url}:`, error.message)
        
        // If this was the last attempt, return empty array
        if (attempt === maxRetries) {
          console.error(`[SourceEvaluator] All ${maxRetries + 1} attempts failed for ${content.url}`)
          return []
        }
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // Should never reach here, but TypeScript needs it
    return []
  }
}

