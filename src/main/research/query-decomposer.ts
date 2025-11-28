// src/main/research/query-decomposer.ts

import { SubQuestion } from './types'
import { QUERY_DECOMPOSITION_PROMPT } from './prompts'
import { sanitizeSearchQuery } from '../browser/search-utils'
import { extractAndParseJson } from './json-utils'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

export class QueryDecomposer {
  constructor(private llm: LLMClient) {}

  async decompose(userPrompt: string): Promise<SubQuestion[]> {
    const startTime = performance.now()
    
    const prompt = QUERY_DECOMPOSITION_PROMPT.replace('{USER_PROMPT}', userPrompt)
    
    const maxRetries = 2
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.llm.complete({
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 3000, // Increased to prevent truncation
          temperature: attempt > 0 ? 0.1 : 0.3, // Lower temperature on retry
        })
        
        // Use robust JSON parsing
        const parsed = extractAndParseJson(
          response.content,
          {
            requiredFields: ['subQuestions'],
            arrayField: 'subQuestions',
          },
          'query decomposition'
        )
        
        // Validate and sanitize sub-questions
        if (!Array.isArray(parsed.subQuestions)) {
          throw new Error('Invalid structure: subQuestions is not an array')
        }
        
        const sanitized = parsed.subQuestions.map((sq: any) => ({
          id: sq.id || `q${Math.random().toString(36).substr(2, 9)}`,
          question: sq.question || '',
          category: sq.category || 'facts',
          priority: sq.priority || 'medium',
          searchQuery: sanitizeSearchQuery(sq.searchQuery || sq.question || ''),
        }))
        
        console.log(`[QueryDecomposer] Generated ${sanitized.length} sub-questions in ${performance.now() - startTime}ms`)
        
        return sanitized
      } catch (error: any) {
        lastError = error
        console.warn(`[QueryDecomposer] Attempt ${attempt + 1} failed:`, error.message)
        
        // If this was the last attempt, use fallback
        if (attempt === maxRetries) {
          console.error('[QueryDecomposer] All attempts failed, using fallback')
          return this.generateFallbackQuestions(userPrompt)
        }
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // Should never reach here, but TypeScript needs it
    return this.generateFallbackQuestions(userPrompt)
  }
  
  private generateFallbackQuestions(userPrompt: string): SubQuestion[] {
    // Simple fallback if LLM fails
    const sanitized = sanitizeSearchQuery(userPrompt)
    return [
      {
        id: 'q1',
        question: userPrompt,
        category: 'facts',
        priority: 'high',
        searchQuery: sanitized,
      },
      {
        id: 'q2',
        question: `${userPrompt} - detailed analysis`,
        category: 'comparison',
        priority: 'medium',
        searchQuery: `${sanitized} analysis`,
      },
    ]
  }
}

