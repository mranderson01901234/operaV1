// src/main/research/gap-analyzer.ts

import { SubQuestion, SourceEvaluation, Gap, ExtractedFact } from './types'
import { GAP_ANALYSIS_PROMPT } from './prompts'
import { sanitizeSearchQuery } from '../browser/search-utils'
import { extractAndParseJson } from './json-utils'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

export class GapAnalyzer {
  constructor(private llm: LLMClient) {}

  async analyze(
    userPrompt: string,
    subQuestions: SubQuestion[],
    evaluations: SourceEvaluation[]
  ): Promise<Gap[]> {
    const startTime = performance.now()
    
    // Gather all extracted facts
    const allFacts = evaluations.flatMap(e => e.extractedFacts)
    
    // Format for prompt
    const subQuestionsStr = subQuestions
      .map(sq => `- [${sq.id}] ${sq.question} (${sq.category}, ${sq.priority})`)
      .join('\n')
    
    const factsStr = allFacts
      .slice(0, 50) // Limit to top 50 facts
      .map(f => `- ${f.claim} [confidence: ${f.confidence}] [source: ${f.sourceUrl}]`)
      .join('\n')
    
    const prompt = GAP_ANALYSIS_PROMPT
      .replace('{USER_PROMPT}', userPrompt)
      .replace('{SUB_QUESTIONS}', subQuestionsStr)
      .replace('{GATHERED_FACTS}', factsStr || 'No facts extracted yet.')
    
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
            requiredFields: ['gaps'],
            arrayField: 'gaps',
          },
          'gap analysis'
        )
        
        // Validate gaps array
        if (!Array.isArray(parsed.gaps)) {
          throw new Error('Invalid structure: gaps is not an array')
        }
        
        // Sanitize suggested queries
        const gaps: Gap[] = parsed.gaps.map((g: any) => ({
          subQuestionId: g.subQuestionId || 'new',
          description: g.description || '',
          suggestedQuery: sanitizeSearchQuery(g.suggestedQuery || ''),
          importance: g.importance || 'important',
        }))
        
        // Also add queries from conflicts if present
        if (parsed.conflicts && Array.isArray(parsed.conflicts)) {
          for (const conflict of parsed.conflicts) {
            gaps.push({
              subQuestionId: 'conflict',
              description: `Conflicting info: ${conflict.topic || 'unknown'}`,
              suggestedQuery: sanitizeSearchQuery(conflict.suggestedQuery || ''),
              importance: 'important',
            })
          }
        }
        
        console.log(`[GapAnalyzer] Found ${gaps.length} gaps in ${performance.now() - startTime}ms`)
        
        return gaps
      } catch (error: any) {
        lastError = error
        console.warn(`[GapAnalyzer] Attempt ${attempt + 1} failed:`, error.message)
        
        // If this was the last attempt, return empty array
        if (attempt === maxRetries) {
          console.error('[GapAnalyzer] All attempts failed')
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

