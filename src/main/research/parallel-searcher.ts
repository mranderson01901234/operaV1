// src/main/research/parallel-searcher.ts

import { SubQuestion, SearchResult } from './types'
import { buildSearchUrl } from '../llm/search-helpers'
import { navigateToUrl, getBrowserState } from '../browser/controller'
import { executeBrowserTool } from '../browser/tool-executor'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface BrowserAdapter {
  executeSearch(query: string, options?: { timeFilter?: string }): Promise<SearchResult[]>
}

export class ParallelSearcher {
  constructor(
    private browserAdapter: BrowserAdapter,
    private maxConcurrent: number = 3
  ) {}

  async searchAll(
    subQuestions: SubQuestion[],
    resultsPerQuery: number = 5
  ): Promise<Map<string, SearchResult[]>> {
    const startTime = performance.now()
    const results = new Map<string, SearchResult[]>()
    
    // Process in batches to avoid overwhelming the browser
    const batches = this.chunk(subQuestions, this.maxConcurrent)
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async (sq) => {
          try {
            const searchResults = await this.browserAdapter.executeSearch(sq.searchQuery, {})
            
            // Tag results with the query that produced them
            // Note: Video URLs are already filtered by BrowserSearchAdapter
            const taggedResults = searchResults.slice(0, resultsPerQuery).map((r, i) => ({
              ...r,
              query: sq.searchQuery,
              position: i + 1,
            }))
            
            return { id: sq.id, results: taggedResults }
          } catch (error) {
            console.error(`[ParallelSearcher] Search failed for "${sq.searchQuery}":`, error)
            return { id: sq.id, results: [] }
          }
        })
      )
      
      // Store results
      for (const { id, results: searchResults } of batchResults) {
        results.set(id, searchResults)
      }
    }
    
    const totalResults = Array.from(results.values()).flat().length
    console.log(`[ParallelSearcher] Completed ${subQuestions.length} searches, got ${totalResults} results in ${performance.now() - startTime}ms`)
    
    return results
  }
  
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

/**
 * Check if a URL is a video URL that should be filtered out during research gathering
 */
function isVideoUrl(url: string): boolean {
  if (!url) return false
  
  const videoDomains = [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'tiktok.com',
    'instagram.com/reel',
    'facebook.com/watch',
    'netflix.com',
    'hulu.com',
    'amazon.com/prime',
    'disney.com',
    'hbo.com',
    'paramount.com',
  ]
  
  const lowerUrl = url.toLowerCase()
  return videoDomains.some(domain => lowerUrl.includes(domain))
}

/**
 * Browser adapter that uses existing browser tools
 */
export class BrowserSearchAdapter implements BrowserAdapter {
  async executeSearch(query: string, options?: { timeFilter?: string }): Promise<SearchResult[]> {
    // Build search URL with sanitization
    const searchUrl = buildSearchUrl(query, 'google')
    
    // Navigate to search
    navigateToUrl(searchUrl)
    
    // Wait for page to load
    await delay(2000)
    
    // Extract search results using existing tool
    const extractResult = await executeBrowserTool({
      name: 'extractSearchResults',
      arguments: { engine: 'google' },
      id: 'search-extract',
      timestamp: new Date(),
    })
    
    if (!extractResult.success || !extractResult.result) {
      return []
    }
    
    // Convert to SearchResult format and filter out video URLs
    const results = extractResult.result.results || []
    const filteredResults = results
      .filter((r: any) => {
        const url = r.url || ''
        const isVideo = isVideoUrl(url)
        if (isVideo) {
          console.log(`[BrowserSearchAdapter] Filtered out video URL: ${url}`)
        }
        return !isVideo
      })
      .map((r: any, i: number) => ({
        url: r.url || '',
        title: r.title || '',
        snippet: r.snippet || '',
        position: i + 1,
        query,
      }))
    
    return filteredResults
  }
}

