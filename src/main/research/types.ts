// src/main/research/types.ts

export interface SubQuestion {
  id: string
  question: string
  category: 'pricing' | 'features' | 'comparison' | 'facts' | 'opinions' | 'news'
  priority: 'high' | 'medium' | 'low'
  searchQuery: string
}

export interface SearchResult {
  url: string
  title: string
  snippet: string
  position: number
  query: string  // Which query produced this result
}

export interface ExtractedContent {
  url: string
  title: string
  domain: string
  publishDate?: Date
  lastModified?: Date
  mainContent: string
  tables: TableData[]
  lists: string[][]
  headings: string[]
  wordCount: number
  fetchedAt: Date
}

export interface TableData {
  headers: string[]
  rows: string[][]
  context: string  // Text around the table
}

export interface SourceEvaluation {
  url: string
  domain: string
  authorityScore: number       // 0-100, based on domain reputation
  recencyScore: number         // 0-100, based on publish/modified date
  relevanceScore: number       // 0-100, based on content match to query
  overallScore: number         // Weighted combination
  extractedFacts: ExtractedFact[]
  content: ExtractedContent
}

export interface ExtractedFact {
  claim: string
  value?: string | number
  context: string              // Surrounding text
  sourceUrl: string
  confidence: number           // 0-100
  category: string
}

export interface Gap {
  subQuestionId: string
  description: string
  suggestedQuery: string
  importance: 'critical' | 'important' | 'nice-to-have'
}

export interface VerifiedFact {
  claim: string
  value?: string | number
  sources: SourceReference[]
  agreementCount: number
  confidence: 'high' | 'medium' | 'low'
  conflictingInfo?: string
}

export interface SourceReference {
  url: string
  domain: string
  title: string
  authorityScore: number
  exactQuote?: string
}

export interface ResearchResult {
  response: string
  sources: SourceReference[]
  verifiedFacts: VerifiedFact[]
  gaps: Gap[]                  // Unfilled gaps for transparency
  confidence: 'high' | 'medium' | 'low'
  followUpQuestions?: string[] // Suggested follow-up questions
  stats: ResearchStats
}

export interface ResearchStats {
  totalSearches: number
  pagesAnalyzed: number
  factsExtracted: number
  factsVerified: number
  totalTimeMs: number
  phases: PhaseStats[]
}

export interface PhaseStats {
  name: string
  durationMs: number
  itemsProcessed: number
}

export interface DeepResearchConfig {
  maxSubQuestions: number          // Default: 8
  maxSearchesPerQuestion: number   // Default: 3
  maxPagesToFetch: number          // Default: 20
  maxFollowUpSearches: number       // Default: 5
  minSourceConfidence: number       // Default: 60
  requireMultipleSources: boolean   // Default: true for facts
  timeoutMs: number                // Default: 120000 (2 minutes)
}

export const DEFAULT_CONFIG: DeepResearchConfig = {
  maxSubQuestions: 8,
  maxSearchesPerQuestion: 3,
  maxPagesToFetch: 20,
  maxFollowUpSearches: 5,
  minSourceConfidence: 60,
  requireMultipleSources: true,
  timeoutMs: 120000,
}

