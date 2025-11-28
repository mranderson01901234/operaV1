/**
 * Helper functions for search operations
 * Used by local model integration to build search URLs and process results
 */

import { prepareSearchQuery } from '../browser/search-utils'

export type SearchEngine = 'google' | 'bing' | 'duckduckgo'

/**
 * Build a search URL for the given query and search engine
 * Automatically sanitizes the query to remove years and filler words
 */
export function buildSearchUrl(query: string, engine: SearchEngine = 'google'): string {
  // Sanitize and prepare the query
  const { query: sanitizedQuery, searchParams, wasModified } = prepareSearchQuery(query)
  
  if (wasModified) {
    console.log(`[Search] Query sanitized: "${query}" → "${sanitizedQuery}"`)
  }
  
  const encodedQuery = encodeURIComponent(sanitizedQuery)
  
  // Build base URL
  let searchUrl: string
  switch (engine) {
    case 'google':
      searchUrl = `https://www.google.com/search?q=${encodedQuery}`
      break
    case 'bing':
      searchUrl = `https://www.bing.com/search?q=${encodedQuery}`
      break
    case 'duckduckgo':
      searchUrl = `https://duckduckgo.com/?q=${encodedQuery}`
      break
    default:
      searchUrl = `https://www.google.com/search?q=${encodedQuery}`
  }
  
  // Add search parameters (like time filters for recency)
  if (Object.keys(searchParams).length > 0) {
    const params = new URLSearchParams(searchParams)
    searchUrl += `&${params.toString()}`
  }
  
  return searchUrl
}

/**
 * Check if a URL is a search engine URL
 */
export function isSearchEngineUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    return (
      hostname.includes('google.com') ||
      hostname.includes('bing.com') ||
      hostname.includes('duckduckgo.com')
    )
  } catch {
    return false
  }
}

/**
 * Extract search query from a search engine URL
 */
export function extractQueryFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const params = new URLSearchParams(urlObj.search)
    
    // Try different parameter names used by different search engines
    return params.get('q') || params.get('query') || params.get('text') || null
  } catch {
    return null
  }
}

/**
 * JavaScript code to extract search results from DOM
 * Returns JavaScript code as string that can be executed via executeJavaScript
 * This is browser automation - extracts results directly from DOM structure
 */
export function getSearchResultsExtractionScript(engine: SearchEngine = 'google'): string {
  switch (engine) {
    case 'google':
      return `
        (function() {
          const results = [];
          // Google search results are typically in div.g containers
          const resultContainers = document.querySelectorAll('div.g, div[data-ved]');
          
          resultContainers.forEach((container, index) => {
            // Find the link (usually an <a> tag with href)
            const link = container.querySelector('a[href]');
            if (!link) return;
            
            const href = link.getAttribute('href');
            // Skip if it's not a real result link (Google uses /url?q= for redirects)
            if (!href || (!href.startsWith('http') && !href.startsWith('/url?q='))) return;
            
            // Extract title (usually in h3)
            const titleEl = container.querySelector('h3');
            const title = titleEl ? titleEl.textContent.trim() : '';
            
            // Extract snippet (usually in span or div with specific classes)
            const snippetEl = container.querySelector('span, div[data-sncf]');
            const snippet = snippetEl ? snippetEl.textContent.trim().substring(0, 200) : '';
            
            if (title && href) {
              // Clean up Google redirect URLs
              let cleanUrl = href;
              if (href.startsWith('/url?q=')) {
                try {
                  const urlParams = new URLSearchParams(href.substring(7));
                  cleanUrl = urlParams.get('q') || href;
                } catch (e) {
                  cleanUrl = href;
                }
              }
              
              results.push({
                index: index + 1,
                title: title,
                url: cleanUrl,
                snippet: snippet
              });
            }
          });
          
          return results.slice(0, 10); // Return top 10 results
        })()
      `
    
    case 'bing':
      return `
        (function() {
          const results = [];
          // Bing search results are in li.b_algo containers
          const resultContainers = document.querySelectorAll('li.b_algo');
          
          resultContainers.forEach((container, index) => {
            const link = container.querySelector('h2 a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            const title = link.textContent.trim();
            
            // Extract snippet
            const snippetEl = container.querySelector('p');
            const snippet = snippetEl ? snippetEl.textContent.trim().substring(0, 200) : '';
            
            if (title && href) {
              results.push({
                index: index + 1,
                title: title,
                url: href,
                snippet: snippet
              });
            }
          });
          
          return results.slice(0, 10);
        })()
      `
    
    case 'duckduckgo':
      return `
        (function() {
          const results = [];
          // DuckDuckGo results are in div.result containers
          const resultContainers = document.querySelectorAll('div.result');
          
          resultContainers.forEach((container, index) => {
            const link = container.querySelector('a.result__a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            const title = link.textContent.trim();
            
            // Extract snippet
            const snippetEl = container.querySelector('a.result__snippet');
            const snippet = snippetEl ? snippetEl.textContent.trim().substring(0, 200) : '';
            
            if (title && href) {
              results.push({
                index: index + 1,
                title: title,
                url: href,
                snippet: snippet
              });
            }
          });
          
          return results.slice(0, 10);
        })()
      `
    
    default:
      return '[]'
  }
}

/**
 * Detect which search engine is being used from the current URL
 */
export function detectSearchEngine(url: string): SearchEngine | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    if (hostname.includes('google.com')) return 'google'
    if (hostname.includes('bing.com')) return 'bing'
    if (hostname.includes('duckduckgo.com')) return 'duckduckgo'
    
    return null
  } catch {
    return null
  }
}

