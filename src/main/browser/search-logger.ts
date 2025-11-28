/**
 * Search Query Logging
 * Tracks query transformations for debugging and analysis
 */

interface SearchQueryLog {
  timestamp: Date
  userRequest: string
  llmGeneratedQuery: string
  sanitizedQuery: string
  finalQuery: string
  searchParams: Record<string, string>
  resultCount?: number
}

const queryLogs: SearchQueryLog[] = []
const MAX_LOGS = 100

/**
 * Log a search query transformation
 */
export function logSearchQuery(log: Omit<SearchQueryLog, 'timestamp'>): void {
  queryLogs.push({
    ...log,
    timestamp: new Date(),
  })

  // Trim old logs
  if (queryLogs.length > MAX_LOGS) {
    queryLogs.shift()
  }

  // Console output for debugging
  console.log(`[Search Query Log]`)
  console.log(`  User request: "${log.userRequest}"`)
  console.log(`  LLM generated: "${log.llmGeneratedQuery}"`)
  console.log(`  After sanitization: "${log.sanitizedQuery}"`)
  console.log(`  Final query: "${log.finalQuery}"`)
  if (Object.keys(log.searchParams).length > 0) {
    console.log(`  Search params:`, log.searchParams)
  }
  if (log.resultCount !== undefined) {
    console.log(`  Results found: ${log.resultCount}`)
  }
}

/**
 * Get recent query logs
 */
export function getRecentQueryLogs(n: number = 10): SearchQueryLog[] {
  return queryLogs.slice(-n)
}

/**
 * Clear all logs
 */
export function clearQueryLogs(): void {
  queryLogs.length = 0
}

/**
 * Get query transformation statistics
 */
export function getQueryStats(): {
  totalQueries: number
  queriesModified: number
  avgModifications: number
  mostCommonRemovals: Array<{ pattern: string; count: number }>
} {
  const modified = queryLogs.filter(log => log.sanitizedQuery !== log.llmGeneratedQuery)
  
  return {
    totalQueries: queryLogs.length,
    queriesModified: modified.length,
    avgModifications: queryLogs.length > 0 ? modified.length / queryLogs.length : 0,
    mostCommonRemovals: [], // Could be enhanced to track specific patterns
  }
}

