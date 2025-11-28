/**
 * Content Extractor
 * Extracts clean, readable text content from web pages for summarization
 */

import { getBrowserView, getBrowserState } from './controller'

export interface ExtractedContent {
  title: string
  url: string
  text: string
  mainContent: string  // Main article/content area (without nav, footer, etc.)
  metadata: {
    author?: string
    publishedDate?: string
    description?: string
    wordCount: number
  }
}

/**
 * Extracts clean text content from the current page
 * Uses heuristics to identify main content area and remove noise
 */
export async function extractPageContent(): Promise<ExtractedContent> {
  const browserView = getBrowserView()
  if (!browserView) {
    throw new Error('BrowserView not initialized')
  }

  const state = await getBrowserState()

  try {
    // Extract content using JavaScript to get clean text
    const extractionScript = `
      (function() {
        // Get page metadata
        const title = document.title || '';
        const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
        const metaAuthor = document.querySelector('meta[name="author"]')?.content || 
                          document.querySelector('[rel="author"]')?.textContent || '';
        
        // Try to find published date
        let publishedDate = null;
        const dateSelectors = [
          'time[datetime]',
          '[itemprop="datePublished"]',
          '.published-date',
          '.date-published',
          'meta[property="article:published_time"]'
        ];
        for (const selector of dateSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            publishedDate = el.getAttribute('datetime') || el.getAttribute('content') || el.textContent;
            break;
          }
        }
        
        // Try to identify main content area
        // Common article/content selectors
        const mainContentSelectors = [
          'article',
          '[role="main"]',
          'main',
          '.content',
          '.post-content',
          '.article-content',
          '.entry-content',
          '#content',
          '.main-content',
          '[id="__next"]', // Next.js
          '[id="root"]',   // React
          '[id="app"]',    // Vue/General
          '.mw-parser-output' // Wikipedia
        ];
        
        let mainContentElement = null;
        for (const selector of mainContentSelectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent.trim().length > 200) {
            mainContentElement = el;
            break;
          }
        }
        
        // If no main content found, use body but remove common noise elements
        if (!mainContentElement) {
          mainContentElement = document.body;
        }
        
        // Clone to avoid modifying original
        const clone = mainContentElement.cloneNode(true);
        
        // Remove noise elements
        const noiseSelectors = [
          'nav', 'header', 'footer', 'aside',
          '.nav', '.navigation', '.menu',
          '.sidebar', '.ad', '.advertisement',
          '.social', '.share', '.comments',
          'script', 'style', 'noscript',
          '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
          '[role="complementary"]'
        ];
        
        noiseSelectors.forEach(selector => {
          clone.querySelectorAll(selector).forEach(el => el.remove());
        });
        
        // Get clean text
        const mainContent = clone.textContent || '';
        
        // Get full page text (for fallback)
        const fullText = document.body.textContent || '';
        
        // Clean up whitespace
        const cleanMainContent = mainContent
          .replace(/\\s+/g, ' ')
          .replace(/\\n\\s*\\n/g, '\\n\\n')
          .trim();
        
        const cleanFullText = fullText
          .replace(/\\s+/g, ' ')
          .replace(/\\n\\s*\\n/g, '\\n\\n')
          .trim();
        
        // Word count (approximate)
        const wordCount = cleanMainContent.split(/\\s+/).filter(w => w.length > 0).length;
        
        return {
          title,
          url: window.location.href,
          text: cleanFullText,
          mainContent: cleanMainContent,
          metadata: {
            author: metaAuthor || undefined,
            publishedDate: publishedDate || undefined,
            description: metaDescription || undefined,
            wordCount
          }
        };
      })()
    `

    let result = await browserView.webContents.executeJavaScript(extractionScript)

    // RETRY LOGIC: If content is very short (likely SPA not hydrated), wait and try again
    if (result.metadata.wordCount < 50) {
      console.log('[ContentExtractor] Low word count detected (<50). Waiting for hydration...')
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2s
      result = await browserView.webContents.executeJavaScript(extractionScript)
      console.log(`[ContentExtractor] Retry result: ${result.metadata.wordCount} words`)
    }

    return {
      title: result.title || state.title,
      url: result.url || state.url,
      text: result.text || '',
      mainContent: result.mainContent || result.text || '',
      metadata: result.metadata || {
        wordCount: 0
      }
    }
  } catch (error) {
    console.error('Error extracting page content:', error)
    // Fallback: return basic info
    return {
      title: state.title,
      url: state.url,
      text: '',
      mainContent: '',
      metadata: {
        wordCount: 0
      }
    }
  }
}

/**
 * Extracts content from a specific element
 */
export async function extractElementContent(selector: string): Promise<string> {
  const browserView = getBrowserView()
  if (!browserView) {
    throw new Error('BrowserView not initialized')
  }

  try {
    const script = `
      (function() {
        const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!element) return '';
        
        // Clone to avoid modifying original
        const clone = element.cloneNode(true);
        
        // Remove script and style tags
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        
        return clone.textContent || '';
      })()
    `

    const result = await browserView.webContents.executeJavaScript(script)
    return result || ''
  } catch (error) {
    console.error('Error extracting element content:', error)
    return ''
  }
}


