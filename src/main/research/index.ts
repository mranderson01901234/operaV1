// src/main/research/index.ts

import { QueryDecomposer } from './query-decomposer'
import { ParallelSearcher, BrowserSearchAdapter } from './parallel-searcher'
import { PageRetriever, BrowserPageAdapter } from './page-retriever'
import { SourceEvaluator } from './source-evaluator'
import { GapAnalyzer } from './gap-analyzer'
import { CrossReferencer } from './cross-referencer'
import { Synthesizer } from './synthesizer'
import {
  DeepResearchConfig,
  DEFAULT_CONFIG,
  ResearchResult,
  ResearchStats,
  PhaseStats
} from './types'

interface LLMClient {
  complete(params: { model: string; messages: any[]; maxTokens: number; temperature: number }): Promise<{ content: string }>
}

export class DeepResearchEngine {
  private decomposer: QueryDecomposer
  private searcher: ParallelSearcher
  private retriever: PageRetriever
  private evaluator: SourceEvaluator
  private gapAnalyzer: GapAnalyzer
  private crossReferencer: CrossReferencer
  private synthesizer: Synthesizer

  constructor(
    private llm: LLMClient,
    private config: DeepResearchConfig = DEFAULT_CONFIG,
    private agentId?: string
  ) {
    this.decomposer = new QueryDecomposer(llm)

    // Create browser adapters
    const searchAdapter = new BrowserSearchAdapter()
    const pageAdapter = new BrowserPageAdapter()

    this.searcher = new ParallelSearcher(searchAdapter)
    this.retriever = new PageRetriever(pageAdapter, 5, agentId) // Pass agentId for parallel fetching
    this.evaluator = new SourceEvaluator(llm)
    this.gapAnalyzer = new GapAnalyzer(llm)
    this.crossReferencer = new CrossReferencer()
    this.synthesizer = new Synthesizer(llm)
  }

  async research(userPrompt: string): Promise<ResearchResult> {
    const totalStartTime = performance.now()
    const phases: PhaseStats[] = []

    console.log(`[DeepResearch] Starting research for: "${userPrompt.substring(0, 100)}..."`)

    try {
      // Phase 1: Query Decomposition
      let phaseStart = performance.now()
      const subQuestions = await this.decomposer.decompose(userPrompt)
      phases.push({
        name: 'decomposition',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: subQuestions.length
      })
      console.log(`[DeepResearch] Phase 1 complete: ${subQuestions.length} sub-questions`)

      // Phase 2: Parallel Search
      phaseStart = performance.now()
      const searchResults = await this.searcher.searchAll(
        subQuestions.slice(0, this.config.maxSubQuestions),
        this.config.maxSearchesPerQuestion
      )
      const allSearchResults = Array.from(searchResults.values()).flat()
      phases.push({
        name: 'search',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: allSearchResults.length
      })
      console.log(`[DeepResearch] Phase 2 complete: ${allSearchResults.length} search results`)

      // Phase 3: Page Retrieval
      phaseStart = performance.now()
      const contents = await this.retriever.retrieveAll(
        allSearchResults,
        this.config.maxPagesToFetch
      )
      phases.push({
        name: 'retrieval',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: contents.length
      })
      console.log(`[DeepResearch] Phase 3 complete: ${contents.length} pages retrieved`)

      // Phase 4: Source Evaluation (PARALLELIZED)
      // Processes multiple sources concurrently (5 at a time)
      // Facts are validated immediately after extraction (early filtering)
      phaseStart = performance.now()
      const evaluations = await this.evaluator.evaluateAll(contents, subQuestions)
      const totalFacts = evaluations.reduce((sum, e) => sum + e.extractedFacts.length, 0)
      phases.push({
        name: 'evaluation',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: totalFacts
      })
      console.log(`[DeepResearch] Phase 4 complete: ${totalFacts} facts extracted (parallelized)`)

      // Phase 5: Gap Analysis
      phaseStart = performance.now()
      const gaps = await this.gapAnalyzer.analyze(userPrompt, subQuestions, evaluations)
      phases.push({
        name: 'gap_analysis',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: gaps.length
      })
      console.log(`[DeepResearch] Phase 5 complete: ${gaps.length} gaps identified`)

      // Phase 6: Follow-up Searches (if critical gaps)
      const criticalGaps = gaps.filter(g => g.importance === 'critical')
      if (criticalGaps.length > 0 && criticalGaps.length <= this.config.maxFollowUpSearches) {
        phaseStart = performance.now()
        console.log(`[DeepResearch] Phase 6: Running ${criticalGaps.length} follow-up searches`)

        const followUpQuestions = criticalGaps.map((g, i) => ({
          id: `followup_${i}`,
          question: g.description,
          category: 'facts' as const,
          priority: 'high' as const,
          searchQuery: g.suggestedQuery,
        }))

        const followUpResults = await this.searcher.searchAll(followUpQuestions, 3)
        const followUpSearchResults = Array.from(followUpResults.values()).flat()

        if (followUpSearchResults.length > 0) {
          const followUpContents = await this.retriever.retrieveAll(followUpSearchResults, 5)
          const followUpEvaluations = await this.evaluator.evaluateAll(followUpContents, followUpQuestions)
          evaluations.push(...followUpEvaluations)
        }

        phases.push({
          name: 'follow_up',
          durationMs: performance.now() - phaseStart,
          itemsProcessed: followUpSearchResults.length
        })
      }

      // Phase 7: Cross-Reference & Verify
      phaseStart = performance.now()
      const verifiedFacts = this.crossReferencer.verify(evaluations)
      phases.push({
        name: 'verification',
        durationMs: performance.now() - phaseStart,
        itemsProcessed: verifiedFacts.length
      })
      console.log(`[DeepResearch] Phase 7 complete: ${verifiedFacts.length} facts verified`)

      // Phase 8: Synthesis
      const stats: Omit<ResearchStats, 'phases'> = {
        totalSearches: allSearchResults.length,
        pagesAnalyzed: contents.length,
        factsExtracted: totalFacts,
        factsVerified: verifiedFacts.length,
        totalTimeMs: 0, // Will be set below
      }

      const result = await this.synthesizer.synthesize(
        userPrompt,
        verifiedFacts,
        gaps,
        { ...stats, phases }
      )

      // Finalize stats
      result.stats.totalTimeMs = performance.now() - totalStartTime

      console.log(`[DeepResearch] Complete in ${result.stats.totalTimeMs}ms`)
      console.log(`[DeepResearch] Stats:`, result.stats)

      return result

    } catch (error) {
      console.error('[DeepResearch] Research failed:', error)
      throw error
    }
  }
}

// Export for use
export * from './types'
export { DEFAULT_CONFIG }

