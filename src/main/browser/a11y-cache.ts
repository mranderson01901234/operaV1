/**
 * Caching layer for accessibility tree extraction
 * Reduces redundant extractions when page content hasn't changed
 */

import type { A11yNode } from '../../shared/types'
import { executeCDPCommand } from './controller'
import { extractAccessibilityTree } from './a11y-extractor'

interface CachedA11yTree {
  tree: A11yNode[]
  url: string
  documentHash: string
  timestamp: number
}

let cache: CachedA11yTree | null = null

// Cache for 10 seconds - pages don't change that fast during normal interaction
const CACHE_TTL_MS = 10_000

/**
 * Get accessibility tree with caching.
 * Returns cached version if URL and document hash match.
 */
export async function getAccessibilityTreeCached(): Promise<A11yNode[]> {
  const currentUrl = await getCurrentUrl()
  const currentHash = await getDocumentHash()

  // Check cache validity
  if (cache &&
      cache.url === currentUrl &&
      cache.documentHash === currentHash &&
      Date.now() - cache.timestamp < CACHE_TTL_MS) {
    console.log('[A11y Cache] HIT - returning cached tree')
    return cache.tree
  }

  console.log('[A11y Cache] MISS - extracting fresh tree')
  const tree = await extractAccessibilityTree()

  // Update cache
  cache = {
    tree,
    url: currentUrl,
    documentHash: currentHash,
    timestamp: Date.now()
  }

  return tree
}

/**
 * Invalidate cache - call after navigation or page mutations
 */
export function invalidateA11yCache(): void {
  cache = null
  console.log('[A11y Cache] Invalidated')
}

/**
 * Force cache refresh on next request
 */
export function markCacheStale(): void {
  if (cache) {
    cache.timestamp = 0
  }
}

/**
 * Get current page URL
 */
async function getCurrentUrl(): Promise<string> {
  try {
    const { root } = await executeCDPCommand('DOM.getDocument', { depth: 0 })
    // Get URL from runtime evaluation
    const result = await executeCDPCommand('Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true
    })
    return result?.result?.value || ''
  } catch {
    return ''
  }
}

/**
 * Get document hash for cache invalidation
 * Uses title + body text length as a simple hash
 */
async function getDocumentHash(): Promise<string> {
  try {
    // Get document title + body text length as a simple hash
    // This catches most content changes without being expensive
    const titleResult = await executeCDPCommand('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    })
    
    const bodyLengthResult = await executeCDPCommand('Runtime.evaluate', {
      expression: 'document.body?.innerText?.length || 0',
      returnByValue: true
    })

    const title = titleResult?.result?.value || ''
    const bodyLength = bodyLengthResult?.result?.value || 0

    return `${title}:${bodyLength}`
  } catch {
    return `${Date.now()}`  // Force refresh on error
  }
}

