// src/main/research/page-retriever.ts

import { SearchResult, ExtractedContent, TableData } from './types'
import { navigateToUrl, getBrowserState } from '../browser/controller'
import { executeBrowserTool } from '../browser/tool-executor'
import { cleanHtmlContent, getBrowserExtractionScript, isValidContent } from './content-cleaner'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface BrowserAdapter {
  navigate(url: string): Promise<void>
  extractContent(): Promise<{ text: string; html: string }>
  getPageInfo(): Promise<{ title: string; url: string }>
}

export class PageRetriever {
  private cache = new Map<string, ExtractedContent>()
  private readonly CACHE_TTL = 300000 // 5 minutes
  private readonly PAGE_TIMEOUT_MS = 8000 // 8 seconds max per page
  private readonly NAVIGATION_WAIT_MS = 1000 // Reduced from 2000ms

  constructor(
    private browser: BrowserAdapter,
    private maxConcurrent: number = 5, // Increased from 2 to 5
    private agentId?: string // Optional agentId for TabManager integration
  ) { }

  async retrieveAll(
    searchResults: SearchResult[],
    maxPages: number = 20
  ): Promise<ExtractedContent[]> {
    const startTime = performance.now()

    // Deduplicate URLs
    const uniqueUrls = [...new Set(searchResults.map(r => r.url))]
    const urlsToFetch = uniqueUrls.slice(0, maxPages)

    console.log(`[PageRetriever] Fetching ${urlsToFetch.length} unique pages (parallel: ${this.maxConcurrent})`)

    const contents: ExtractedContent[] = []

    // PARALLEL FETCHING: Process in batches using TabManager if available
    const { getTabManager } = await import('../browser/tab-manager')
    const tabManager = getTabManager()

    if (tabManager && this.agentId) {
      // Use TabManager for parallel fetching
      const batches = this.chunk(urlsToFetch, this.maxConcurrent)

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(url => this.fetchWithTab(url, tabManager, this.agentId!))
        )

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            contents.push(result.value)
            this.cache.set(result.value.url, result.value)
          }
        }
      }
    } else {
      // Fallback to sequential fetching
      for (const url of urlsToFetch) {
        // Check cache first
        const cached = this.cache.get(url)
        if (cached && Date.now() - cached.fetchedAt.getTime() < this.CACHE_TTL) {
          contents.push(cached)
          continue
        }

        try {
          // Add timeout to prevent slow pages from blocking the entire process
          const content = await Promise.race([
            this.fetchAndExtract(url),
            new Promise<null>((resolve) =>
              setTimeout(() => {
                console.warn(`[PageRetriever] Timeout (${this.PAGE_TIMEOUT_MS}ms) for ${url}, skipping`)
                resolve(null)
              }, this.PAGE_TIMEOUT_MS)
            )
          ])

          if (content && isValidContent(content.mainContent)) {
            contents.push(content)
            this.cache.set(url, content)
          } else {
            console.log(`[PageRetriever] Skipped invalid content from ${url}`)
          }
        } catch (error) {
          console.error(`[PageRetriever] Failed to fetch ${url}:`, error)
        }
      }
    }

    console.log(`[PageRetriever] Retrieved ${contents.length} pages in ${performance.now() - startTime}ms`)

    return contents
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Fetch a page using a temporary background tab
   */
  private async fetchWithTab(url: string, tabManager: any, agentId: string): Promise<ExtractedContent | null> {
    // Check cache first
    const cached = this.cache.get(url)
    if (cached && Date.now() - cached.fetchedAt.getTime() < this.CACHE_TTL) {
      return cached
    }

    let tabId: string | null = null

    try {
      // Create temporary background tab in research partition
      const tab = tabManager.createTab(
        agentId,
        url,
        false, // Not active (background)
        'browser',
        undefined,
        'persist:research' // Use research partition with resource blocking
      )
      tabId = tab.id

      // Wait for page to load with timeout
      const content = await Promise.race([
        this.waitAndExtractFromTab(tabId, tabManager, url),
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.warn(`[PageRetriever] Timeout (${this.PAGE_TIMEOUT_MS}ms) for ${url}, skipping`)
            resolve(null)
          }, this.PAGE_TIMEOUT_MS)
        )
      ])

      return content
    } catch (error) {
      console.error(`[PageRetriever] Failed to fetch ${url} with tab:`, error)
      return null
    } finally {
      // Clean up: close the temporary tab
      if (tabId) {
        try {
          tabManager.closeTab(tabId)
        } catch (error) {
          console.warn(`[PageRetriever] Failed to close tab ${tabId}:`, error)
        }
      }
    }
  }

  /**
   * Wait for tab to load and extract content
   */
  private async waitAndExtractFromTab(tabId: string, tabManager: any, url: string): Promise<ExtractedContent | null> {
    if (!tabId) return null;
    // Wait for navigation
    await delay(this.NAVIGATION_WAIT_MS)

    // Get tab state
    const tabState = tabManager.getTabState(tabId)
    if (!tabState || tabState.url === 'about:blank') {
      console.warn(`[PageRetriever] Tab did not load properly for ${url}`)
      return null
    }

    // Extract content using CDP
    try {
      const { executeCDPCommand } = await import('../browser/controller')
      const { getBrowserExtractionScript } = await import('./content-cleaner')

      const script = getBrowserExtractionScript()
      const result = await executeCDPCommand('Runtime.evaluate', {
        expression: script,
        returnByValue: true,
      }, tabId)

      const mainContent = result?.result?.value || ''

      if (!isValidContent(mainContent)) {
        console.log(`[PageRetriever] Content validation failed for ${url}`)
        return null
      }

      // Get HTML for metadata extraction
      const htmlResult = await executeCDPCommand('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      }, tabId)

      const html = htmlResult?.result?.value || ''

      // Extract metadata
      const tables = this.extractTables(html)
      const headings = this.extractHeadings(html)
      const publishDate = this.extractPublishDate(html, mainContent)

      const truncatedContent = this.truncateContent(mainContent, 8000)

      return {
        url: tabState.url,
        title: tabState.title,
        domain: new URL(url).hostname,
        publishDate,
        mainContent: truncatedContent,
        tables,
        lists: [],
        headings,
        wordCount: truncatedContent.split(/\s+/).length,
        fetchedAt: new Date(),
      }
    } catch (error) {
      console.error(`[PageRetriever] Extraction failed for ${url}:`, error)
      return null
    }
  }

  private async fetchAndExtract(url: string): Promise<ExtractedContent | null> {
    const startTime = performance.now()

    try {
      await this.browser.navigate(url)

      // Wait for content to load (optimized wait time)
      await delay(this.NAVIGATION_WAIT_MS)

      // Close common pop-ups before extracting content
      // Handle crashes gracefully - if BrowserView crashes, skip this page
      try {
        await this.closePopups()
      } catch (error: any) {
        if (error?.message?.includes('crashed') || error?.message?.includes('Target crashed')) {
          console.error(`[PageRetriever] BrowserView crashed while processing ${url}, skipping page`)
          return null
        }
        // Other errors are non-fatal, continue
      }

      // Verify page loaded successfully before extracting
      const pageInfo = await this.browser.getPageInfo()
      if (!pageInfo.url || pageInfo.url === 'about:blank') {
        console.warn(`[PageRetriever] Page did not load properly for ${url}`)
        return null
      }

      // METHOD 1: Try browser-side extraction first (most reliable)
      let mainContent: string
      try {
        const { executeCDPCommand, getBrowserView } = await import('../browser/controller')
        const browserView = getBrowserView()
        if (browserView && !browserView.webContents.isDestroyed()) {
          const script = getBrowserExtractionScript()
          const result = await executeCDPCommand('Runtime.evaluate', {
            expression: script,
            returnByValue: true,
          })
          mainContent = result?.result?.value || ''
          console.log(`[PageRetriever] Browser extraction got ${mainContent?.length || 0} chars`)
        } else {
          mainContent = ''
        }
      } catch (e) {
        console.log(`[PageRetriever] Browser extraction failed, falling back to HTML cleaning`)
        mainContent = ''
      }

      // METHOD 2: Fallback to HTML cleaning if browser extraction failed
      const { text, html } = await this.browser.extractContent()
      if (!mainContent || mainContent.length < 500) {
        if (html) {
          mainContent = cleanHtmlContent(html)
          console.log(`[PageRetriever] HTML cleaning got ${mainContent.length} chars`)
        } else if (text) {
          // If we only have text, use it but clean it
          mainContent = this.cleanContent(text, 10000)
        } else {
          console.warn(`[PageRetriever] Failed to extract content from ${url}`)
          return null
        }
      }

      // Validate content quality
      if (!isValidContent(mainContent)) {
        console.log(`[PageRetriever] Content validation failed for ${url}`)
        return null
      }

      // Extract structured data from HTML (tables still useful)
      const tables = this.extractTables(html)
      const headings = this.extractHeadings(html)
      const publishDate = this.extractPublishDate(html, mainContent)

      // Truncate main content
      mainContent = this.truncateContent(mainContent, 8000)

      const content: ExtractedContent = {
        url,
        title: pageInfo.title,
        domain: new URL(url).hostname,
        publishDate,
        mainContent,
        tables,
        lists: [], // Skip lists - often navigation
        headings,
        wordCount: mainContent.split(/\s+/).length,
        fetchedAt: new Date(),
      }

      console.log(`[PageRetriever] Extracted ${content.wordCount} words from ${url} in ${performance.now() - startTime}ms`)

      return content
    } catch (error: any) {
      // Check if error is due to BrowserView crash
      if (error?.message?.includes('crashed') || error?.message?.includes('Target crashed')) {
        console.error(`[PageRetriever] BrowserView crashed while extracting ${url}`)
      } else {
        console.error(`[PageRetriever] Extraction failed for ${url}:`, error)
      }
      return null
    }
  }

  private extractTables(html: string): TableData[] {
    const tables: TableData[] = []

    // Simple regex-based table extraction
    const tableMatches = html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)

    for (const match of tableMatches) {
      const tableHtml = match[1]

      // Skip tables that look like layout tables
      if (/<table[^>]*class="[^"]*layout/i.test(match[0])) continue

      // Extract headers
      const headers: string[] = []
      const headerMatches = tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)
      for (const hMatch of headerMatches) {
        const text = this.stripHtml(hMatch[1]).trim()
        if (text.length > 0 && text.length < 100) {
          headers.push(text)
        }
      }

      // Extract rows
      const rows: string[][] = []
      const rowMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
      for (const rMatch of rowMatches) {
        const cells: string[] = []
        const cellMatches = rMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)
        for (const cMatch of cellMatches) {
          const text = this.stripHtml(cMatch[1]).trim()
          if (text.length < 200) {
            cells.push(text)
          }
        }
        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          rows.push(cells)
        }
      }

      // Only keep tables with actual content
      if ((headers.length > 0 || rows.length > 1) && rows.some(r => r.join('').length > 10)) {
        tables.push({ headers, rows, context: '' })
      }
    }

    return tables
  }

  private extractLists(html: string): string[][] {
    const lists: string[][] = []

    const listMatches = html.matchAll(/<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi)

    for (const match of listMatches) {
      const items: string[] = []
      const itemMatches = match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)
      for (const iMatch of itemMatches) {
        const text = this.stripHtml(iMatch[1]).trim()
        if (text.length > 0 && text.length < 500) {
          items.push(text)
        }
      }
      if (items.length > 0) {
        lists.push(items)
      }
    }

    return lists
  }

  private extractHeadings(html: string): string[] {
    const headings: string[] = []

    const headingMatches = html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)

    for (const match of headingMatches) {
      const text = this.stripHtml(match[1]).trim()
      // Filter out navigation-like headings
      if (text.length > 3 && text.length < 150 && !/^(menu|nav|share|follow|related)/i.test(text)) {
        headings.push(text)
      }
    }

    return headings.slice(0, 20) // Limit to top 20 headings
  }

  private extractPublishDate(html: string, text: string): Date | undefined {
    // Try common date patterns
    const patterns = [
      /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="date"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="publish[_-]?date"[^>]*content="([^"]+)"/i,
      /<time[^>]*datetime="([^"]+)"/i,
      /"datePublished"\s*:\s*"([^"]+)"/i,
      /published:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const parsed = new Date(match[1])
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
          return parsed
        }
      }
    }

    return undefined
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private cleanContent(text: string, maxLength: number): string {
    // Remove excessive whitespace and truncate
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()

    if (cleaned.length <= maxLength) {
      return cleaned
    }

    // Truncate at word boundary
    const truncated = cleaned.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    return truncated.substring(0, lastSpace) + '...'
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content

    // Truncate at sentence boundary if possible
    const truncated = content.substring(0, maxLength)
    const lastSentence = truncated.lastIndexOf('. ')

    if (lastSentence > maxLength * 0.8) {
      return truncated.substring(0, lastSentence + 1)
    }

    // Fallback to word boundary
    const lastSpace = truncated.lastIndexOf(' ')
    return truncated.substring(0, lastSpace) + '...'
  }

  /**
   * Close common pop-ups and overlays that block content
   */
  private async closePopups(): Promise<void> {
    const { executeCDPCommand, getBrowserView } = await import('../browser/controller')

    // Check BrowserView is valid before attempting CDP command
    const browserView = getBrowserView()
    if (!browserView || browserView.webContents.isDestroyed()) {
      console.warn('[PageRetriever] BrowserView not available, skipping pop-up closure')
      return
    }

    try {
      const closeScript = `
        (function() {
          let closed = 0;
          const selectors = [
            'button[aria-label*="close" i]',
            'button[aria-label*="Close" i]',
            '.close-button',
            '.modal-close',
            '.popup-close',
            '[class*="close"][class*="button"]',
            '[data-dismiss="modal"]',
            '[data-close="true"]',
            '.overlay-close',
            '[class*="newsletter"] button[class*="close"]',
            '[class*="paywall"] button',
            '[id*="paywall"] button',
            '[id*="cookie"] button',
            '[class*="cookie"] button',
            'button.close',
            '.modal button:last-child',
            '[role="dialog"] button[aria-label*="close" i]',
            '[class*="cyber-sale"] button',
            '[class*="popup"] button[class*="close"]',
          ];
          
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
                  el.click();
                  closed++;
                  break;
                }
              }
            } catch (e) {}
          }
          
          if (closed === 0) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          }
          
          return { closed };
        })()
      `

      const result = await executeCDPCommand('Runtime.evaluate', {
        expression: closeScript,
        returnByValue: true,
      })

      if (result?.result?.value?.closed > 0) {
        console.log(`[PageRetriever] Closed ${result.result.value.closed} pop-up(s)`)
        await delay(500)
      }
    } catch (error: any) {
      // Check if error is due to crash - don't log as warning if it's a crash
      if (error?.message?.includes('Target crashed') ||
        error?.message?.includes('target closed') ||
        error?.message?.includes('BrowserView crashed')) {
        console.error(`[PageRetriever] BrowserView crashed while closing pop-ups:`, error.message)
        throw error // Re-throw crash errors so caller can handle recovery
      }
      console.warn(`[PageRetriever] Failed to close pop-ups:`, error)
    }
  }
}

/**
 * Browser adapter using existing browser controller
 */
export class BrowserPageAdapter implements BrowserAdapter {
  async navigate(url: string): Promise<void> {
    const { getBrowserView } = await import('../browser/controller')

    // Check BrowserView exists before navigating
    const browserView = getBrowserView()
    if (!browserView || browserView.webContents.isDestroyed()) {
      throw new Error('BrowserView not available or disposed')
    }

    navigateToUrl(url)

    // Wait for navigation and page load
    await delay(3000)

    // Close pop-ups before verifying page load
    // Handle crashes gracefully - if BrowserView crashes, throw error so caller can handle
    try {
      await this.closePopups()
    } catch (error: any) {
      if (error?.message?.includes('crashed') || error?.message?.includes('Target crashed')) {
        throw new Error(`BrowserView crashed while navigating to ${url}`)
      }
      // Other errors are non-fatal, continue
    }

    // Verify page loaded
    const { getBrowserState } = await import('../browser/controller')
    const state = getBrowserState()
    if (!state.url || state.url === 'about:blank') {
      throw new Error(`Page did not load: ${url}`)
    }
  }

  /**
   * Close common pop-ups and overlays
   */
  private async closePopups(): Promise<void> {
    const { executeCDPCommand, getBrowserView } = await import('../browser/controller')

    // Check BrowserView is valid before attempting CDP command
    const browserView = getBrowserView()
    if (!browserView || browserView.webContents.isDestroyed()) {
      console.warn('[BrowserPageAdapter] BrowserView not available, skipping pop-up closure')
      return
    }

    try {
      const closeScript = `
        (function() {
          let closed = 0;
          const selectors = [
            'button[aria-label*="close" i]',
            'button[aria-label*="Close" i]',
            '.close-button',
            '.modal-close',
            '.popup-close',
            '[class*="close"][class*="button"]',
            '[data-dismiss="modal"]',
            '[data-close="true"]',
            '.overlay-close',
            '[class*="newsletter"] button[class*="close"]',
            '[class*="paywall"] button',
            '[id*="paywall"] button',
            '[id*="cookie"] button',
            '[class*="cookie"] button',
            'button.close',
            '.modal button:last-child',
            '[role="dialog"] button[aria-label*="close" i]',
            '[class*="cyber-sale"] button',
            '[class*="popup"] button[class*="close"]',
          ];
          
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
                  el.click();
                  closed++;
                  break;
                }
              }
            } catch (e) {}
          }
          
          if (closed === 0) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          }
          
          return { closed };
        })()
      `

      const result = await executeCDPCommand('Runtime.evaluate', {
        expression: closeScript,
        returnByValue: true,
      })

      if (result?.result?.value?.closed > 0) {
        console.log(`[BrowserPageAdapter] Closed ${result.result.value.closed} pop-up(s)`)
        await delay(500)
      }
    } catch (error: any) {
      // Check if error is due to crash - don't log as warning if it's a crash
      if (error?.message?.includes('Target crashed') ||
        error?.message?.includes('target closed') ||
        error?.message?.includes('BrowserView crashed')) {
        console.error(`[BrowserPageAdapter] BrowserView crashed while closing pop-ups:`, error.message)
        throw error // Re-throw crash errors so caller can handle recovery
      }
      console.warn(`[BrowserPageAdapter] Failed to close pop-ups:`, error)
    }
  }

  async extractContent(): Promise<{ text: string; html: string }> {
    try {
      // Extract body content
      const extractResult = await executeBrowserTool({
        name: 'extract',
        arguments: { selector: 'body' },
        id: 'extract-content',
        timestamp: new Date(),
      })

      if (!extractResult.success) {
        console.warn('[BrowserPageAdapter] Extract failed:', extractResult.error)
        return { text: '', html: '' }
      }

      const text = extractResult.result?.value
        ? String(extractResult.result.value)
        : ''

      // Get HTML via CDP with error handling
      const { executeCDPCommand, getBrowserView } = await import('../browser/controller')

      // Check if BrowserView is still valid
      const browserView = getBrowserView()
      if (!browserView || browserView.webContents.isDestroyed()) {
        console.warn('[BrowserPageAdapter] BrowserView disposed, skipping HTML extraction')
        return { text, html: '' }
      }

      const htmlResult = await executeCDPCommand('Runtime.evaluate', {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      })

      const html = htmlResult?.result?.value || ''

      return { text, html }
    } catch (error) {
      console.error('[BrowserPageAdapter] Content extraction error:', error)
      return { text: '', html: '' }
    }
  }

  async getPageInfo(): Promise<{ title: string; url: string }> {
    const { getBrowserView } = await import('../browser/controller')

    // Check BrowserView is still valid
    const browserView = getBrowserView()
    if (!browserView || browserView.webContents.isDestroyed()) {
      return { title: '', url: '' }
    }

    const state = getBrowserState()
    return {
      title: state.title || '',
      url: state.url || '',
    }
  }
}

