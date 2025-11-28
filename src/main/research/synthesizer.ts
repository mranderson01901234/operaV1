// src/main/research/synthesizer.ts

import { VerifiedFact, Gap, SourceReference, ResearchResult, ResearchStats } from './types'
import { SYNTHESIS_PROMPT } from './prompts'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

export class Synthesizer {
  constructor(private llm: LLMClient) { }

  async synthesize(
    userPrompt: string,
    verifiedFacts: VerifiedFact[],
    gaps: Gap[],
    stats: Omit<ResearchStats, 'phases'>
  ): Promise<ResearchResult> {
    const startTime = performance.now()

    // Build source list with indices
    const allSources = this.deduplicateSources(verifiedFacts)
    const sourceList = allSources
      .map((s, i) => `[${i + 1}] ${s.title || s.domain} - ${s.url}`)
      .join('\n')

    // Format verified facts with source indices
    const factsStr = verifiedFacts
      .map(f => {
        const sourceIndices = f.sources
          .map(s => allSources.findIndex(as => as.url === s.url) + 1)
          .filter(i => i > 0)

        return `- ${f.claim}${f.value ? `: ${f.value}` : ''} [${f.confidence} confidence] [sources: ${sourceIndices.join(', ')}]`
      })
      .join('\n')

    // Format gaps
    const gapsStr = gaps
      .filter(g => g.importance !== 'nice-to-have')
      .map(g => `- ${g.description} (${g.importance})`)
      .join('\n') || 'No significant gaps identified.'

    const prompt = SYNTHESIS_PROMPT
      .replace('{USER_PROMPT}', userPrompt)
      .replace('{VERIFIED_FACTS}', factsStr)
      .replace('{GAPS}', gapsStr)
      .replace('{SOURCES}', sourceList)

    const response = await this.llm.complete({
      model: 'gemini-2.5-flash', // Could use a better model for synthesis
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4000,
      temperature: 0.4,
    })

    // Calculate overall confidence
    const confidenceCounts = { high: 0, medium: 0, low: 0 }
    for (const fact of verifiedFacts) {
      confidenceCounts[fact.confidence]++
    }

    let overallConfidence: 'high' | 'medium' | 'low'
    if (confidenceCounts.high >= verifiedFacts.length * 0.6) {
      overallConfidence = 'high'
    } else if (confidenceCounts.low >= verifiedFacts.length * 0.4) {
      overallConfidence = 'low'
    } else {
      overallConfidence = 'medium'
    }

    // Generate follow-up questions (parallel with synthesis if possible, but here sequential for simplicity)
    const followUpQuestions = await this.generateFollowUps(userPrompt, response.content)

    const synthesisTime = performance.now() - startTime
    console.log(`[Synthesizer] Generated response in ${synthesisTime}ms`)

    return {
      response: response.content,
      sources: allSources,
      verifiedFacts,
      gaps: gaps.filter(g => g.importance !== 'nice-to-have'),
      confidence: overallConfidence,
      followUpQuestions,
      stats: {
        ...stats,
        phases: [
          ...(stats as any).phases || [],
          { name: 'synthesis', durationMs: synthesisTime, itemsProcessed: 1 }
        ]
      }
    }
  }

  private async generateFollowUps(userPrompt: string, context: string): Promise<string[]> {
    try {
      const prompt = `Based on this research about "${userPrompt}", suggest 3-4 relevant follow-up questions the user might want to ask next.
      
      Research Context:
      ${context.substring(0, 2000)}...
      
      Return ONLY a JSON array of strings. Example: ["Question 1?", "Question 2?"]`

      const response = await this.llm.complete({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 500,
        temperature: 0.5,
      })

      const jsonMatch = response.content.match(/\[.*\]/s)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return []
    } catch (error) {
      console.warn('[Synthesizer] Failed to generate follow-up questions:', error)
      return []
    }
  }

  private deduplicateSources(verifiedFacts: VerifiedFact[]): SourceReference[] {
    const seen = new Set<string>()
    const sources: SourceReference[] = []

    for (const fact of verifiedFacts) {
      for (const source of fact.sources) {
        if (!seen.has(source.url)) {
          seen.add(source.url)
          sources.push(source)
        }
      }
    }

    // Sort by authority score
    sources.sort((a, b) => b.authorityScore - a.authorityScore)

    return sources
  }
}

