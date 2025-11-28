/**
 * Performance metrics for accessibility tree extraction
 * Tracks extraction times and cache hit rates
 */

interface A11yMetrics {
  extractionTimeMs: number
  nodeCount: number
  interactiveCount: number
  cacheHit: boolean
  timestamp: Date
}

const metricsHistory: A11yMetrics[] = []
const MAX_HISTORY = 100

/**
 * Record metrics for an extraction
 */
export function recordMetrics(metrics: Omit<A11yMetrics, 'timestamp'>): void {
  metricsHistory.push({
    ...metrics,
    timestamp: new Date()
  })

  // Trim history
  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory.shift()
  }

  // Log summary
  const cacheStatus = metrics.cacheHit ? 'CACHE' : 'FRESH'
  console.log(`[A11y Metrics] ${cacheStatus} - ${metrics.extractionTimeMs.toFixed(2)}ms - ${metrics.interactiveCount} elements`)
}

/**
 * Get metrics summary
 */
export function getMetricsSummary(): {
  avgExtractionTime: number
  cacheHitRate: number
  totalExtractions: number
} {
  if (metricsHistory.length === 0) {
    return { avgExtractionTime: 0, cacheHitRate: 0, totalExtractions: 0 }
  }

  const freshExtractions = metricsHistory.filter(m => !m.cacheHit)
  const avgExtractionTime = freshExtractions.length > 0
    ? freshExtractions.reduce((sum, m) => sum + m.extractionTimeMs, 0) / freshExtractions.length
    : 0

  const cacheHits = metricsHistory.filter(m => m.cacheHit).length
  const cacheHitRate = cacheHits / metricsHistory.length

  return {
    avgExtractionTime: Math.round(avgExtractionTime),
    cacheHitRate: Math.round(cacheHitRate * 100) / 100,
    totalExtractions: metricsHistory.length
  }
}

/**
 * Clear metrics history
 */
export function clearMetrics(): void {
  metricsHistory.length = 0
}

