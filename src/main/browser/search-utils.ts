/**
 * Search Query Sanitization Utilities
 * 
 * Prevents LLM from injecting years and stale knowledge into search queries,
 * which causes Google to return outdated articles with stale pricing and model information.
 */

// Years to strip (current year and recent past years the LLM might reference)
const YEAR_PATTERN = /\b20[0-9]{2}\b/g

// Phrases that indicate the LLM is using stale knowledge
const STALE_PATTERNS = [
  /\blatest\s+as\s+of\b/gi,
  /\bcurrent(ly)?\s+in\s+\d{4}\b/gi,
  /\bas\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi,
  /\bupdated?\s+(for\s+)?\d{4}\b/gi,
]

// Words that add noise without improving results
const FILLER_WORDS = [
  'comprehensive',
  'detailed',
  'complete',
  'ultimate',
  'definitive',
  'in-depth',
  'thorough',
]

/**
 * Sanitizes LLM-generated search queries to prevent outdated results.
 * Removes year references and other patterns that bias toward old content.
 */
export function sanitizeSearchQuery(query: string): string {
  let sanitized = query

  // Remove year references
  sanitized = sanitized.replace(YEAR_PATTERN, '')

  // Remove stale knowledge patterns
  for (const pattern of STALE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '')
  }

  // Remove filler words that don't help search
  for (const filler of FILLER_WORDS) {
    sanitized = sanitized.replace(new RegExp(`\\b${filler}\\b`, 'gi'), '')
  }

  // Clean up extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim()

  // Log if we made changes (for debugging)
  if (sanitized !== query) {
    console.log(`[SearchUtils] Sanitized query:`)
    console.log(`  Original: "${query}"`)
    console.log(`  Cleaned:  "${sanitized}"`)
  }

  return sanitized
}

/**
 * Enhances a search query for better recency.
 * Call this AFTER sanitization.
 */
export function enhanceQueryForRecency(
  query: string,
  options: {
    addCurrentYear?: boolean
    forceRecent?: boolean
  } = {}
): { query: string; searchParams?: Record<string, string> } {
  const { addCurrentYear = false, forceRecent = false } = options

  let enhancedQuery = query
  const searchParams: Record<string, string> = {}

  // Optionally add current year (useful for pricing, comparisons)
  if (addCurrentYear) {
    const currentYear = new Date().getFullYear()
    enhancedQuery = `${query} ${currentYear}`
  }

  // Add Google time filter for recent results
  if (forceRecent) {
    searchParams['tbs'] = 'qdr:m' // Past month. Options: qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year)
  }

  return { query: enhancedQuery, searchParams }
}

/**
 * Detects if a query is likely to need current/recent information.
 * Used to decide whether to apply recency filters.
 */
export function queryNeedsRecency(query: string): boolean {
  const recencyIndicators = [
    'pricing',
    'price',
    'cost',
    'how much',
    'current',
    'latest',
    'new',
    'update',
    'announce',
    'release',
    'launch',
    'comparison',
    'vs',
    'versus',
    'compare',
    'best',
    'top',
    'market share',
    'stock',
    'news',
  ]

  const lowerQuery = query.toLowerCase()
  return recencyIndicators.some(indicator => lowerQuery.includes(indicator))
}

/**
 * Full pipeline: sanitize, detect recency needs, enhance.
 */
export function prepareSearchQuery(rawQuery: string): {
  query: string
  searchParams: Record<string, string>
  wasModified: boolean
} {
  const sanitized = sanitizeSearchQuery(rawQuery)
  const needsRecency = queryNeedsRecency(sanitized)

  const { query, searchParams = {} } = enhanceQueryForRecency(sanitized, {
    addCurrentYear: false, // Don't add year - let Google's recency algorithms work
    forceRecent: needsRecency,
  })

  return {
    query,
    searchParams,
    wasModified: query !== rawQuery,
  }
}

