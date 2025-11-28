/**
 * Browser Tool Executor
 * Executes browser automation tools (click, type, scroll, etc.)
 * Called when the LLM returns tool calls
 */

import {
  navigateToUrl,
  goBack,
  goForward,
  refresh,
  getBrowserView,
  executeCDPCommand,
  getBrowserState,
} from './controller'
import { getTabManager } from './tab-manager'
import { captureScreenshot } from './screenshot'
import { formatAccessibilityTree } from './a11y-extractor'
import { getAccessibilityTreeCached, invalidateA11yCache } from './a11y-cache'
import { getSearchResultsExtractionScript, detectSearchEngine, isSearchEngineUrl, extractQueryFromUrl, buildSearchUrl } from '../llm/search-helpers'
import { sanitizeSearchQuery } from './search-utils'
import { extractPageContent, extractElementContent } from './content-extractor'
import { summarizeContent } from './summarization-service'
import {
  executeListDocuments,
  executeReadDocument,
  executeGetDocumentSummary,
  executeCreateDocument,
  executeEditDocument,
} from '../documents/document-tool-executor'
import type { ToolCall, DocumentEditRequest } from '../../shared/types'

export interface ToolExecutionResult {
  success: boolean
  result?: any
  error?: string
  screenshot?: string // Optional screenshot after action for verification
}

/**
 * Executes a single browser tool call
 */
export async function executeBrowserTool(toolCall: ToolCall): Promise<ToolExecutionResult> {
  const { name, arguments: args } = toolCall

  try {
    switch (name) {
      case 'navigate':
        return await executeNavigate(args)
      case 'click':
        return await executeClick(args)
      case 'type':
        return await executeType(args)
      case 'scroll':
        return await executeScroll(args)
      case 'extract':
        return await executeExtract(args)
      case 'screenshot':
        return await executeScreenshot(args)
      case 'wait':
        return await executeWait(args)
      case 'goBack':
        return await executeGoBack()
      case 'goForward':
        return await executeGoForward()
      case 'refresh':
        return await executeRefresh()
      case 'extractSearchResults':
        return await executeExtractSearchResults(args)
      // Tab management tools
      case 'createTab':
        return await executeCreateTab(args)
      case 'switchTab':
        return await executeSwitchTab(args)
      case 'closeTab':
        return await executeCloseTab(args)
      case 'listTabs':
        return await executeListTabs()
      case 'summarize':
        return await executeSummarize(args)
      case 'extractKeyPoints':
        return await executeExtractKeyPoints(args)
      case 'summarizeSection':
        return await executeSummarizeSection(args)

      // Document tools - require agentId which is passed via toolCall
      case 'listDocuments':
        return await executeListDocuments(args.agentId || toolCall.agentId)
      case 'readDocument':
        return await executeReadDocument(args as any)
      case 'getDocumentSummary':
        return await executeGetDocumentSummary(args as any)
      case 'createDocument':
        return await executeCreateDocument(args as any, args.agentId || toolCall.agentId)
      case 'editDocument':
        return await executeEditDocument(args as DocumentEditRequest, args.agentId || toolCall.agentId)

      default:
        return {
          success: false,
          error: `Unknown tool: ${name}`,
        }
    }
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Navigate to a URL
 * If URL is a search engine URL, sanitizes the query to remove years and filler words
 */
async function executeNavigate(args: Record<string, any>): Promise<ToolExecutionResult> {
  let { url } = args

  if (!url || typeof url !== 'string') {
    return { success: false, error: 'URL is required' }
  }

  // If URL is a search engine URL, sanitize the query
  if (isSearchEngineUrl(url)) {
    const query = extractQueryFromUrl(url)
    if (query) {
      const sanitizedQuery = sanitizeSearchQuery(query)
      if (sanitizedQuery !== query) {
        console.log(`[Navigate] Sanitizing search query: "${query}" → "${sanitizedQuery}"`)
        // Rebuild URL with sanitized query
        const engine = detectSearchEngine(url) || 'google'
        url = buildSearchUrl(sanitizedQuery, engine)
      }
    }
  }

  navigateToUrl(url)
  invalidateA11yCache() // Page will change, invalidate cache

  // Wait for navigation to start
  await delay(500)

  // Wait for page to load (with timeout)
  let loaded = await waitForPageLoad(10000)

  // Check for CAPTCHA
  const browserView = getBrowserView()
  if (browserView) {
    const isCaptcha = await checkCaptcha(browserView.webContents)
    if (isCaptcha) {
      console.log('[Navigate] CAPTCHA detected! Attempting fallback...')

      // Determine fallback engine
      const currentEngine = detectSearchEngine(url)
      let fallbackUrl = ''

      if (currentEngine === 'google') {
        // Fallback to Bing
        const query = extractQueryFromUrl(url) || ''
        if (query) {
          console.log('[Navigate] Switching to Bing...')
          fallbackUrl = buildSearchUrl(query, 'bing')
        }
      } else if (currentEngine === 'bing') {
        // Fallback to DuckDuckGo
        const query = extractQueryFromUrl(url) || ''
        if (query) {
          console.log('[Navigate] Switching to DuckDuckGo...')
          fallbackUrl = buildSearchUrl(query, 'duckduckgo')
        }
      }

      if (fallbackUrl) {
        navigateToUrl(fallbackUrl)
        await delay(500)
        loaded = await waitForPageLoad(10000)

        // Check CAPTCHA again on fallback (unlikely but possible)
        const isCaptchaFallback = await checkCaptcha(browserView.webContents)
        if (isCaptchaFallback) {
          return {
            success: false,
            error: 'Search blocked by CAPTCHA on multiple engines. Please try again later or use a different query.',
          }
        }

        // Update state to reflect fallback
        const state = getBrowserState()
        return {
          success: true,
          result: {
            url: state.url,
            title: state.title,
            loaded,
            note: 'Switched search engine due to CAPTCHA detection.'
          },
        }
      }
    }
  }

  const state = getBrowserState()
  return {
    success: true,
    result: {
      url: state.url,
      title: state.title,
      loaded,
    },
  }
}

/**
 * Checks if the current page is a CAPTCHA or blocking page
 */
async function checkCaptcha(webContents: any): Promise<boolean> {
  try {
    const script = `
      (function() {
        const title = document.title.toLowerCase();
        const text = document.body.innerText.toLowerCase();
        
        // Google CAPTCHA indicators
        if (title.includes('unusual traffic') || 
            text.includes('our systems have detected unusual traffic') ||
            text.includes('please show you\\'re not a robot')) {
          return true;
        }
        
        // Generic Cloudflare/Security checks
        if (title.includes('just a moment') || 
            title.includes('attention required') ||
            title.includes('security check') ||
            text.includes('checking your browser') ||
            text.includes('verify you are human')) {
          return true;
        }
        
        return false;
      })()
    `
    return await webContents.executeJavaScript(script)
  } catch (error) {
    console.error('Error checking for CAPTCHA:', error)
    return false
  }
}

/**
 * Click an element on the page
 * Supports multiple selector strategies:
 * - Standard CSS selectors
 * - Text-based selectors (button:contains("text"), a:has-text("text"))
 * - Aria-label selectors
 * - Falls back to text search if selector fails
 */
async function executeClick(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, elementDescription } = args

  if (!selector || typeof selector !== 'string') {
    return { success: false, error: 'Selector is required' }
  }

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  try {
    // Use JavaScript to find and click the element with multiple strategies
    const clickScript = `
      (function() {
        const selector = ${JSON.stringify(selector)};
        const description = ${JSON.stringify(elementDescription || '')};

        // Strategy 1: Try direct CSS selector first
        let element = null;
        try {
          element = document.querySelector(selector);
        } catch (e) {
          // Invalid selector, continue to other strategies
        }

        // Strategy 2: Handle text-based pseudo-selectors
        if (!element && (selector.includes(':contains(') || selector.includes(':has-text('))) {
          const match = selector.match(/([a-zA-Z*]+)?(?::contains\\("|:has-text\\(")([^"]+)"?\\)/);
          if (match) {
            const tagName = match[1] || '*';
            const searchText = match[2];
            const elements = document.querySelectorAll(tagName);
            for (const el of elements) {
              if (el.textContent && el.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
                element = el;
                break;
              }
            }
          }
        }

        // Strategy 3: Handle aria-label selectors (also search by text content since a11y tree shows text as "name")
        if (!element && selector.includes('[aria-label=')) {
          const match = selector.match(/\\[aria-label="([^"]+)"\\]/);
          if (match) {
            const label = match[1];
            // First try actual aria-label
            element = document.querySelector('[aria-label="' + label + '"]') ||
                      document.querySelector('[aria-label*="' + label.substring(0, 50) + '"]');

            // If not found, the "aria-label" in selector might actually be the element's text content
            // (accessibility tree reports text content as the accessible name)
            if (!element) {
              const searchText = label.toLowerCase();
              // Try to find first significant words (before "..." or special chars)
              const significantPart = searchText.split(/[.…|›]/)[0].trim();
              const links = document.querySelectorAll('a, button, [role="button"], [role="link"]');
              for (const el of links) {
                const text = (el.textContent || '').trim().toLowerCase();
                // Match if text starts with the significant part, or contains it
                if (text.includes(significantPart) || significantPart.includes(text.substring(0, 30))) {
                  element = el;
                  break;
                }
              }
            }
          }
        }

        // Strategy 4: If we have a description, search by text content
        if (!element && description) {
          const searchText = description.toLowerCase();
          // Search in links, buttons, and clickable elements
          const clickables = document.querySelectorAll('a, button, [role="button"], [role="link"], [onclick], [tabindex]');
          for (const el of clickables) {
            const text = (el.textContent || '').trim().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();

            if (text.includes(searchText) || ariaLabel.includes(searchText) || title.includes(searchText)) {
              element = el;
              break;
            }
          }
        }

        // Strategy 5: Try partial href match for links
        if (!element && selector.includes('href')) {
          const match = selector.match(/href=['"]?([^'"\\]]+)['"]?/);
          if (match) {
            const hrefPart = match[1];
            const links = document.querySelectorAll('a[href]');
            for (const link of links) {
              if (link.getAttribute('href').includes(hrefPart)) {
                element = link;
                break;
              }
            }
          }
        }

        // Strategy 6: Search all text for exact or partial match
        if (!element) {
          // Extract potential search text from the selector
          let searchTerms = [];

          // From aria-label
          const ariaMatch = selector.match(/aria-label="([^"]+)"/);
          if (ariaMatch) searchTerms.push(ariaMatch[1]);

          // From text pseudo-selectors
          const textMatch = selector.match(/(?::contains\\("|:has-text\\(")([^"]+)"?\\)/);
          if (textMatch) searchTerms.push(textMatch[1]);

          // Use description as fallback
          if (description) searchTerms.push(description);

          for (const term of searchTerms) {
            if (element) break;
            const searchLower = term.toLowerCase();
            const allElements = document.querySelectorAll('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"]');
            for (const el of allElements) {
              const text = (el.textContent || el.value || '').trim().toLowerCase();
              const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
              if (text === searchLower || ariaLabel === searchLower ||
                  text.includes(searchLower) || ariaLabel.includes(searchLower)) {
                element = el;
                break;
              }
            }
          }
        }

        if (!element) {
          return { success: false, error: 'Element not found' };
        }

        // Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Get element position
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Try native click first
        element.click();

        return {
          success: true,
          x: x,
          y: y,
          tagName: element.tagName,
          text: (element.textContent || '').trim().substring(0, 100)
        };
      })()
    `

    const result = await browserView.webContents.executeJavaScript(clickScript)

    if (!result.success) {
      return {
        success: false,
        error: `Element not found: ${selector}${elementDescription ? ` (${elementDescription})` : ''}`,
      }
    }

    // Wait a bit for any navigation or UI update
    await delay(500)

    // Invalidate cache if click might have changed the page
    // (e.g., navigation links, buttons that trigger page changes)
    invalidateA11yCache()

    return {
      success: true,
      result: {
        clicked: selector,
        description: elementDescription,
        coordinates: { x: result.x, y: result.y },
        tagName: result.tagName,
        text: result.text,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Type text into an input field
 * Supports multiple selector strategies similar to click
 */
async function executeType(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, text, clearFirst = false, submit = false } = args

  if (!selector || typeof selector !== 'string') {
    return { success: false, error: 'Selector is required' }
  }

  if (text === undefined || text === null) {
    return { success: false, error: 'Text is required' }
  }

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  try {
    // Use JavaScript to find the input element with multiple strategies
    const typeScript = `
      (function() {
        const selector = ${JSON.stringify(selector)};
        const text = ${JSON.stringify(String(text))};
        const clearFirst = ${clearFirst};
        const shouldSubmit = ${submit};

        // Strategy 1: Try direct CSS selector
        let element = null;
        try {
          element = document.querySelector(selector);
        } catch (e) {
          // Invalid selector
        }

        // Strategy 2: Handle aria-label selectors
        if (!element && selector.includes('[aria-label=')) {
          const match = selector.match(/\\[aria-label="([^"]+)"\\]/);
          if (match) {
            const label = match[1];
            element = document.querySelector('input[aria-label="' + label + '"]') ||
                      document.querySelector('textarea[aria-label="' + label + '"]') ||
                      document.querySelector('[contenteditable][aria-label="' + label + '"]') ||
                      document.querySelector('input[aria-label*="' + label + '"]') ||
                      document.querySelector('textarea[aria-label*="' + label + '"]');
          }
        }

        // Strategy 3: Handle name attribute selectors (supports both single and double quotes)
        if (!element && selector.includes('[name=')) {
          // Match both [name="value"] and [name='value']
          const match = selector.match(/\\[name=["']([^"']+)["']\\]/);
          if (match) {
            const nameValue = match[1];
            element = document.querySelector('input[name="' + nameValue + '"]') ||
                      document.querySelector('textarea[name="' + nameValue + '"]');
          }
        }

        // Strategy 4: Handle placeholder text
        if (!element && selector.includes('[placeholder')) {
          const match = selector.match(/\\[placeholder="([^"]+)"\\]/);
          if (match) {
            element = document.querySelector('input[placeholder*="' + match[1] + '"]') ||
                      document.querySelector('textarea[placeholder*="' + match[1] + '"]');
          }
        }

        // Strategy 5: Find by input type
        if (!element && selector.includes('input[type=')) {
          const match = selector.match(/input\\[type="?([^"\\]]+)"?\\]/);
          if (match) {
            element = document.querySelector('input[type="' + match[1] + '"]');
          }
        }

        // Strategy 6: Find visible text input if selector looks generic
        if (!element && (selector === 'input' || selector === 'input[type="text"]' || selector === 'textarea')) {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea');
          for (const inp of inputs) {
            const rect = inp.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              element = inp;
              break;
            }
          }
        }

        // Strategy 7: Fallback - find any visible input if selector failed (especially for name attribute selectors)
        if (!element) {
          const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea');
          
          // If selector had a name attribute, prefer inputs with matching name
          if (selector.includes('[name=')) {
            const match = selector.match(/\\[name=["']([^"']+)["']\\]/);
            if (match) {
              const nameValue = match[1];
              for (const inp of allInputs) {
                const rect = inp.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && inp.name === nameValue) {
                  element = inp;
                  break;
                }
              }
            }
          }
          
          // If still not found, take first visible input
          if (!element) {
            for (const inp of allInputs) {
              const rect = inp.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                element = inp;
                break;
              }
            }
          }
        }

        if (!element) {
          return { success: false, error: 'Input element not found' };
        }

        // Focus the element
        element.focus();

        // Clear if requested
        if (clearFirst) {
          if (element.select) {
            element.select();
          }
          element.value = '';
          // Trigger input event
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Set the value
        if ('value' in element) {
          element.value = text;
        } else if (element.isContentEditable) {
          element.textContent = text;
        }

        // Trigger events to notify frameworks
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Submit if requested
        if (shouldSubmit) {
          // Try form submission first
          if (element.form) {
            element.form.requestSubmit();
          } else {
            // Fallback to Enter key
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
          }
        }

        return {
          success: true,
          tagName: element.tagName,
          type: element.type || 'text',
          value: element.value || element.textContent,
          submitted: shouldSubmit
        };
      })()
    `

    const result = await browserView.webContents.executeJavaScript(typeScript)

    if (!result.success) {
      return {
        success: false,
        error: `Input element not found: ${selector}`,
      }
    }

    // If submitted, wait for navigation
    if (result.submitted) {
      await delay(500)
      invalidateA11yCache()
    }

    return {
      success: true,
      result: {
        typed: text,
        selector,
        cleared: clearFirst,
        tagName: result.tagName,
        inputType: result.type,
        submitted: result.submitted
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Scroll the page
 */
async function executeScroll(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { direction, amount = 500 } = args

  if (!direction || !['up', 'down', 'left', 'right'].includes(direction)) {
    return { success: false, error: 'Valid direction required (up, down, left, right)' }
  }

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  try {
    // Calculate scroll deltas
    let deltaX = 0
    let deltaY = 0

    switch (direction) {
      case 'up':
        deltaY = -amount
        break
      case 'down':
        deltaY = amount
        break
      case 'left':
        deltaX = -amount
        break
      case 'right':
        deltaX = amount
        break
    }

    // Use Input.dispatchMouseEvent with wheel type
    await executeCDPCommand('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 100,
      y: 100,
      deltaX,
      deltaY,
    })

    await delay(300)

    return {
      success: true,
      result: {
        direction,
        amount,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Extract text content or attribute from an element
 */
async function executeExtract(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, attribute = 'textContent' } = args

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  // Check if webContents is still valid (not disposed)
  if (browserView.webContents.isDestroyed()) {
    return { success: false, error: 'BrowserView webContents has been disposed' }
  }

  try {
    // Use executeJavaScript for more reliable extraction
    const script = selector
      ? `
        (function() {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) return { error: 'Element not found' };

          if ('${attribute}' === 'textContent') return { value: element.textContent };
          if ('${attribute}' === 'innerText') return { value: element.innerText };
          if ('${attribute}' === 'innerHTML') return { value: element.innerHTML };
          if ('${attribute}' === 'value') return { value: element.value };
          return { value: element.getAttribute('${attribute}') };
        })()
      `
      : `
        (function() {
          return { value: document.body.innerText.substring(0, 10000) };
        })()
      `

    // Double-check webContents is still valid before executing
    if (browserView.webContents.isDestroyed()) {
      return { success: false, error: 'BrowserView webContents was disposed during extraction' }
    }

    const result = await browserView.webContents.executeJavaScript(script)

    if (result && typeof result === 'object' && 'error' in result) {
      return { success: false, error: result.error as string }
    }

    return {
      success: true,
      result: {
        selector,
        attribute,
        value: result?.value ?? result,
      },
    }
  } catch (error) {
    // Check if error is due to disposed webContents
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('disposed') || errorMessage.includes('WebFrameMain')) {
      return { success: false, error: 'BrowserView was disposed during extraction' }
    }
    return {
      success: false,
      error: `Extract failed: ${errorMessage}`,
    }
  }
}

/**
 * Take a screenshot
 */
async function executeScreenshot(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { fullPage = false } = args

  try {
    const screenshot = await captureScreenshot({ fullPage, format: 'png' })

    return {
      success: true,
      result: {
        fullPage,
        format: 'png',
      },
      screenshot,
    }
  } catch (error) {
    return {
      success: false,
      error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Wait for an element to appear
 */
async function executeWait(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, timeout = 5000 } = args

  if (!selector || typeof selector !== 'string') {
    return { success: false, error: 'Selector is required' }
  }

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  const startTime = Date.now()
  const pollInterval = 100

  try {
    while (Date.now() - startTime < timeout) {
      const script = `
        (function() {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          return element !== null;
        })()
      `

      const found = await browserView.webContents.executeJavaScript(script)

      if (found) {
        return {
          success: true,
          result: {
            selector,
            found: true,
            elapsed: Date.now() - startTime,
          },
        }
      }

      await delay(pollInterval)
    }

    return {
      success: false,
      error: `Timeout waiting for element: ${selector}`,
      result: {
        selector,
        found: false,
        timeout,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Go back in browser history
 */
async function executeGoBack(): Promise<ToolExecutionResult> {
  goBack()
  await delay(500)
  await waitForPageLoad(5000)

  const state = getBrowserState()
  return {
    success: true,
    result: {
      url: state.url,
      title: state.title,
    },
  }
}

/**
 * Go forward in browser history
 */
async function executeGoForward(): Promise<ToolExecutionResult> {
  goForward()
  await delay(500)
  await waitForPageLoad(5000)

  const state = getBrowserState()
  return {
    success: true,
    result: {
      url: state.url,
      title: state.title,
    },
  }
}

/**
 * Refresh the page
 */
async function executeRefresh(): Promise<ToolExecutionResult> {
  refresh()
  await delay(500)
  await waitForPageLoad(5000)

  const state = getBrowserState()
  return {
    success: true,
    result: {
      url: state.url,
      title: state.title,
    },
  }
}

/**
 * Extract search results from a search engine results page
 * Uses DOM extraction (browser automation) - no paid APIs!
 */
async function executeExtractSearchResults(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { engine } = args

  const browserView = getBrowserView()
  if (!browserView) {
    return { success: false, error: 'BrowserView not initialized' }
  }

  try {
    const state = getBrowserState()
    const currentUrl = state.url

    // Check if we're on a search engine page
    if (!isSearchEngineUrl(currentUrl)) {
      return {
        success: false,
        error: 'Current page is not a search engine results page. Navigate to Google, Bing, or DuckDuckGo search results first.',
      }
    }

    // Detect search engine from URL if not provided
    const detectedEngine = engine || detectSearchEngine(currentUrl)
    if (!detectedEngine) {
      return {
        success: false,
        error: 'Could not detect search engine. Please specify engine parameter (google, bing, or duckduckgo).',
      }
    }

    // Wait a bit for page to fully load
    await delay(500)

    // Get the extraction script for this search engine
    const extractionScript = getSearchResultsExtractionScript(detectedEngine)

    // Execute the script to extract results from DOM
    const results = await browserView.webContents.executeJavaScript(extractionScript)

    if (!Array.isArray(results) || results.length === 0) {
      return {
        success: false,
        error: `No search results found on ${detectedEngine} results page. The page may not have loaded yet or the structure may have changed.`,
      }
    }

    return {
      success: true,
      result: {
        engine: detectedEngine,
        query: currentUrl, // Could extract query from URL if needed
        results: results,
        count: results.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to extract search results: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Execute multiple tool calls in sequence
 */
export async function executeBrowserTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = []

  for (const toolCall of toolCalls) {
    const result = await executeBrowserTool(toolCall)
    results.push(result)

    // If a tool fails, we might want to stop or continue based on the tool type
    // For now, continue executing all tools
  }

  return results
}

/**
 * Get current browser context for LLM (combines state, screenshot, and a11y tree)
 */
export async function getBrowserContext(): Promise<{
  url: string
  title: string
  screenshot: string | null
  accessibilityTree: string
}> {
  const state = getBrowserState()

  let screenshot: string | null = null
  try {
    screenshot = await captureScreenshot({ fullPage: false, format: 'png' })
  } catch (error) {
    console.warn('Failed to capture screenshot for context:', error)
  }

  let accessibilityTree = ''
  try {
    const tree = await getAccessibilityTreeCached()
    accessibilityTree = formatAccessibilityTree(tree)
  } catch (error) {
    console.warn('Failed to extract accessibility tree:', error)
    accessibilityTree = 'Failed to extract accessibility tree'
  }

  return {
    url: state.url,
    title: state.title,
    screenshot,
    accessibilityTree,
  }
}

// Helper functions

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPageLoad(timeout: number): Promise<boolean> {
  const browserView = getBrowserView()
  if (!browserView) return false

  const startTime = Date.now()
  const pollInterval = 100

  while (Date.now() - startTime < timeout) {
    if (!browserView.webContents.isLoading()) {
      return true
    }
    await delay(pollInterval)
  }

  return false
}

// Tab management tool implementations

/**
 * Create a new browser tab
 */
async function executeCreateTab(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { url, makeActive = true } = args

  const tabManager = getTabManager()
  if (!tabManager) {
    return { success: false, error: 'TabManager not initialized' }
  }

  // Get current agent ID from active tab
  const activeTab = tabManager.getActiveTab()
  if (!activeTab) {
    return { success: false, error: 'No active agent/tab context' }
  }

  try {
    const tab = tabManager.createTab(activeTab.agentId, url, makeActive)

    return {
      success: true,
      result: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        isActive: makeActive,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to create tab: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Switch to a different browser tab
 */
async function executeSwitchTab(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { tabId, index } = args

  const tabManager = getTabManager()
  if (!tabManager) {
    return { success: false, error: 'TabManager not initialized' }
  }

  try {
    let targetTabId = tabId

    // If index is provided instead of tabId, find the tab at that index
    if (!targetTabId && typeof index === 'number') {
      const tabs = tabManager.listTabs()
      if (index < 0 || index >= tabs.length) {
        return {
          success: false,
          error: `Invalid tab index: ${index}. Available tabs: 0-${tabs.length - 1}`,
        }
      }
      targetTabId = tabs[index].id
    }

    if (!targetTabId) {
      return { success: false, error: 'Either tabId or index is required' }
    }

    tabManager.switchToTab(targetTabId)

    const tabState = tabManager.getTabState(targetTabId)
    return {
      success: true,
      result: {
        tabId: targetTabId,
        url: tabState?.url,
        title: tabState?.title,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to switch tab: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Close a browser tab
 */
async function executeCloseTab(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { tabId } = args

  const tabManager = getTabManager()
  if (!tabManager) {
    return { success: false, error: 'TabManager not initialized' }
  }

  try {
    // If no tabId provided, close the active tab
    const targetTabId = tabId || tabManager.getActiveTab()?.tabId

    if (!targetTabId) {
      return { success: false, error: 'No tab to close' }
    }

    tabManager.closeTab(targetTabId)

    return {
      success: true,
      result: {
        closedTabId: targetTabId,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to close tab: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * List all open browser tabs
 */
async function executeListTabs(): Promise<ToolExecutionResult> {
  const tabManager = getTabManager()
  if (!tabManager) {
    return { success: false, error: 'TabManager not initialized' }
  }

  try {
    const tabs = tabManager.listTabs()
    const activeTabId = tabManager.getActiveTab()?.tabId

    const tabList = tabs.map((tab, index) => ({
      index,
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      isActive: tab.id === activeTabId,
      isPinned: tab.isPinned,
    }))

    return {
      success: true,
      result: {
        tabs: tabList,
        count: tabList.length,
        activeTabId,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to list tabs: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Summarize page content
 */
async function executeSummarize(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, length = 'medium', focus } = args

  try {
    // Extract content
    let content: string
    let metadata: { title: string; url: string; wordCount: number } | undefined

    if (selector) {
      // Summarize specific element
      content = await extractElementContent(selector)
      metadata = {
        title: getBrowserState().title,
        url: getBrowserState().url,
        wordCount: content.split(/\s+/).length,
      }
    } else {
      // Summarize entire page
      const extracted = await extractPageContent()
      content = extracted.mainContent || extracted.text
      metadata = {
        title: extracted.title,
        url: extracted.url,
        wordCount: extracted.metadata.wordCount,
      }
    }

    if (!content || content.trim().length < 50) {
      return {
        success: false,
        error: 'Not enough content to summarize. The page may be empty or still loading.',
      }
    }

    // Generate summary using LLM
    const summary = await summarizeContent({
      content,
      type: 'summary',
      length,
      focus,
      metadata,
    })

    return {
      success: true,
      result: {
        summary,
        length,
        focus: focus || 'general',
        wordCount: metadata.wordCount,
        source: {
          title: metadata.title,
          url: metadata.url,
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Summarization failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Extract key points from page content
 */
async function executeExtractKeyPoints(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { selector, maxPoints = 10 } = args

  try {
    // Extract content
    let content: string
    let metadata: { title: string; url: string; wordCount: number } | undefined

    if (selector) {
      content = await extractElementContent(selector)
      metadata = {
        title: getBrowserState().title,
        url: getBrowserState().url,
        wordCount: content.split(/\s+/).length,
      }
    } else {
      const extracted = await extractPageContent()
      content = extracted.mainContent || extracted.text
      metadata = {
        title: extracted.title,
        url: extracted.url,
        wordCount: extracted.metadata.wordCount,
      }
    }

    if (!content || content.trim().length < 50) {
      return {
        success: false,
        error: 'Not enough content to extract key points. The page may be empty or still loading.',
      }
    }

    // Generate key points using LLM
    const keyPoints = await summarizeContent({
      content,
      type: 'keyPoints',
      maxPoints,
      metadata,
    })

    return {
      success: true,
      result: {
        keyPoints: Array.isArray(keyPoints) ? keyPoints : [keyPoints],
        count: Array.isArray(keyPoints) ? keyPoints.length : 1,
        maxPoints,
        source: {
          title: metadata.title,
          url: metadata.url,
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Key points extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Summarize a specific section of the page
 */
async function executeSummarizeSection(args: Record<string, any>): Promise<ToolExecutionResult> {
  const { sectionName, length = 'medium' } = args

  if (!sectionName) {
    return {
      success: false,
      error: 'Section name is required',
    }
  }

  try {
    const browserView = getBrowserView()
    if (!browserView) {
      return { success: false, error: 'BrowserView not initialized' }
    }

    // Find section by heading
    const findSectionScript = `
      (function() {
        const sectionName = ${JSON.stringify(sectionName.toLowerCase())};
        
        // Try to find section by heading
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        let targetHeading = null;
        
        for (const heading of headings) {
          const headingText = heading.textContent.toLowerCase().trim();
          if (headingText.includes(sectionName) || sectionName.includes(headingText)) {
            targetHeading = heading;
            break;
          }
        }
        
        if (!targetHeading) {
          return null;
        }
        
        // Get content until next heading of same or higher level
        const headingLevel = parseInt(targetHeading.tagName.charAt(1));
        let content = '';
        let current = targetHeading.nextElementSibling;
        
        while (current) {
          if (current.tagName.match(/^H[1-6]$/)) {
            const currentLevel = parseInt(current.tagName.charAt(1));
            if (currentLevel <= headingLevel) {
              break; // Reached next section
            }
          }
          content += current.textContent + '\\n';
          current = current.nextElementSibling;
        }
        
        return {
          heading: targetHeading.textContent.trim(),
          content: content.trim()
        };
      })()
    `

    const sectionResult = await browserView.webContents.executeJavaScript(findSectionScript)

    if (!sectionResult || !sectionResult.content) {
      return {
        success: false,
        error: `Section "${sectionName}" not found on the page. Try using a different section name or check the page headings.`,
      }
    }

    const content = sectionResult.content
    const metadata = {
      title: getBrowserState().title,
      url: getBrowserState().url,
      wordCount: content.split(/\s+/).length,
    }

    // Generate summary using LLM
    const summary = await summarizeContent({
      content,
      type: 'summary',
      length,
      sectionName: sectionResult.heading,
      metadata,
    })

    return {
      success: true,
      result: {
        summary,
        sectionName: sectionResult.heading,
        length,
        wordCount: metadata.wordCount,
        source: {
          title: metadata.title,
          url: metadata.url,
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Section summarization failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

