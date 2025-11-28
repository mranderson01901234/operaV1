// src/main/research/content-cleaner.ts

/**
 * Cleans HTML content to extract only meaningful article text.
 * Removes CSS, JavaScript, navigation, footers, ads, and other page chrome.
 */

// Elements that should never be considered content
const REMOVE_TAGS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'map',
  'object',
  'embed',
]

// Structural elements that are rarely main content
const REMOVE_STRUCTURAL = [
  'header',
  'footer', 
  'nav',
  'aside',
  'menu',
  'menuitem',
]

// Class/ID patterns that indicate non-content (case-insensitive)
const NON_CONTENT_PATTERNS = [
  // Navigation & Layout
  'sidebar', 'side-bar', 'side_bar',
  'navbar', 'nav-bar', 'navigation',
  'menu', 'breadcrumb',
  'header', 'footer', 'masthead',
  
  // Ads & Promotions
  'ad-', 'ads-', 'advert', 'advertisement',
  'sponsor', 'promoted', 'promo',
  'banner', 'adsense', 'ad_',
  
  // UI Elements
  'popup', 'modal', 'overlay', 'lightbox',
  'cookie', 'consent', 'gdpr',
  'newsletter', 'subscribe', 'signup',
  'social', 'share', 'sharing',
  'comment', 'disqus', 'discuss',
  
  // Widgets
  'widget', 'related', 'recommended',
  'trending', 'popular', 'latest-posts',
  'author-bio', 'about-author',
  'tag-cloud', 'categories',
  
  // Site-specific junk
  'gfg', 'theme', 'dark-mode', 'light-mode',
]

// Patterns that indicate CSS/JS content in text
const CSS_JS_PATTERNS = [
  /\{\s*[\w-]+\s*:\s*[^}]+\}/g,           // CSS rules: { property: value }
  /@font-face\s*\{/gi,                      // @font-face declarations
  /@media\s*[\(\[]/gi,                      // @media queries
  /@keyframes\s+\w+/gi,                     // @keyframes animations
  /@import\s+/gi,                           // @import statements
  /\.[\w-]+\s*\{[^}]*\}/g,                 // .class { } rules
  /#[\w-]+\s*\{[^}]*\}/g,                  // #id { } rules
  /\bfunction\s*\([^)]*\)\s*\{/g,          // function() { }
  /\bconst\s+\w+\s*=\s*\{/g,               // const x = { }
  /\blet\s+\w+\s*=\s*\{/g,                 // let x = { }
  /\bvar\s+\w+\s*=\s*\{/g,                 // var x = { }
  /=>[\s]*\{/g,                             // Arrow functions
  /document\.(querySelector|getElementById|getElementsBy)/g,
  /window\.(addEventListener|location|innerWidth)/g,
  /classList\.(add|remove|toggle)/g,
  /addEventListener\s*\(/g,
  /Object\.freeze\s*\(/g,
  /export\s+(default\s+)?(function|class|const)/g,
  /import\s+.*from\s+['"]/g,
]

/**
 * Remove HTML tags and their contents
 */
function removeTagsWithContent(html: string, tags: string[]): string {
  let result = html
  
  for (const tag of tags) {
    // Match opening tag with any attributes, content, and closing tag
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi')
    result = result.replace(pattern, ' ')
    
    // Also remove self-closing versions
    const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi')
    result = result.replace(selfClosing, ' ')
  }
  
  return result
}

/**
 * Remove elements by class/id patterns
 */
function removeByClassIdPatterns(html: string, patterns: string[]): string {
  let result = html
  
  for (const pattern of patterns) {
    // Match div/section/etc with class containing pattern
    const classRegex = new RegExp(
      `<(div|section|aside|span|p|ul|ol|li|article)[^>]*class="[^"]*${pattern}[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`,
      'gi'
    )
    result = result.replace(classRegex, ' ')
    
    // Match elements with id containing pattern
    const idRegex = new RegExp(
      `<(div|section|aside|span|p|ul|ol|li|article)[^>]*id="[^"]*${pattern}[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`,
      'gi'
    )
    result = result.replace(idRegex, ' ')
  }
  
  return result
}

/**
 * Strip all HTML tags, keeping only text content
 */
function stripHtmlTags(html: string): string {
  return html
    // Replace block elements with newlines
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim()
}

/**
 * Remove CSS/JS patterns from text content
 */
function removeCssJsFromText(text: string): string {
  let result = text
  
  for (const pattern of CSS_JS_PATTERNS) {
    result = result.replace(pattern, ' ')
  }
  
  // Remove lines that look like code
  const lines = result.split('\n')
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim()
    
    // Skip empty lines
    if (!trimmed) return true
    
    // Skip lines that are mostly special characters (likely code)
    const specialChars = (trimmed.match(/[{}\[\]();:=<>\/\\|&^%$#@!~`]/g) || []).length
    const ratio = specialChars / trimmed.length
    if (ratio > 0.3) return false
    
    // Skip very short lines with code-like patterns
    if (trimmed.length < 50 && /^[\w\s]*[{(=;]/.test(trimmed)) return false
    
    return true
  })
  
  return cleanedLines.join('\n')
}

/**
 * Try to extract main content container
 */
function extractMainContainer(html: string): string | null {
  // Priority order of content containers
  const selectors = [
    // Semantic HTML5
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    
    // Common content classes
    /<div[^>]*class="[^"]*\b(post-content|article-content|entry-content|main-content|page-content|content-body|post-body|article-body)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    
    // Common content IDs
    /<div[^>]*id="[^"]*\b(content|main|article|post|entry)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    
    // Generic content class
    /<div[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]
  
  for (const selector of selectors) {
    const match = html.match(selector)
    if (match) {
      // Get the captured group (content inside the container)
      const content = match[1] || match[2]
      if (content && content.length > 500) {
        return content
      }
    }
  }
  
  return null
}

/**
 * Main cleaning function - takes raw HTML, returns clean text content
 */
export function cleanHtmlContent(html: string): string {
  console.log(`[ContentCleaner] Input size: ${html.length} chars`)
  
  // Step 1: Remove script and style tags first (most important)
  let cleaned = removeTagsWithContent(html, REMOVE_TAGS)
  console.log(`[ContentCleaner] After removing tags: ${cleaned.length} chars`)
  
  // Step 2: Remove structural non-content elements
  cleaned = removeTagsWithContent(cleaned, REMOVE_STRUCTURAL)
  
  // Step 3: Remove elements by class/id patterns
  cleaned = removeByClassIdPatterns(cleaned, NON_CONTENT_PATTERNS)
  console.log(`[ContentCleaner] After removing patterns: ${cleaned.length} chars`)
  
  // Step 4: Try to extract main content container
  const mainContent = extractMainContainer(cleaned)
  if (mainContent) {
    cleaned = mainContent
    console.log(`[ContentCleaner] Found main container: ${cleaned.length} chars`)
  }
  
  // Step 5: Strip remaining HTML tags
  let text = stripHtmlTags(cleaned)
  
  // Step 6: Remove any CSS/JS that leaked through
  text = removeCssJsFromText(text)
  
  // Step 7: Final cleanup
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim()
  
  console.log(`[ContentCleaner] Final output: ${text.length} chars`)
  
  return text
}

/**
 * Extract content using browser execution (more reliable than regex)
 * Returns JavaScript code to execute in browser context
 */
export function getBrowserExtractionScript(): string {
  return `
    (function() {
      // Clone body to avoid modifying the page
      const clone = document.body.cloneNode(true);
      
      // Remove non-content elements
      const removeSelectors = [
        'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
        'header', 'footer', 'nav', 'aside', 'menu',
        '[class*="sidebar"]', '[class*="side-bar"]',
        '[class*="navbar"]', '[class*="nav-bar"]', '[class*="navigation"]',
        '[class*="ad-"]', '[class*="ads-"]', '[class*="advert"]',
        '[class*="cookie"]', '[class*="consent"]', '[class*="gdpr"]',
        '[class*="popup"]', '[class*="modal"]', '[class*="overlay"]',
        '[class*="newsletter"]', '[class*="subscribe"]',
        '[class*="social"]', '[class*="share"]',
        '[class*="comment"]', '[class*="disqus"]',
        '[class*="widget"]', '[class*="related"]',
        '[class*="footer"]', '[class*="header"]',
        '[id*="sidebar"]', '[id*="nav"]',
        '[id*="ad-"]', '[id*="ads-"]',
        '[id*="cookie"]', '[id*="popup"]',
        '[id*="footer"]', '[id*="header"]',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '[role="complementary"]', '[aria-hidden="true"]',
      ];
      
      removeSelectors.forEach(selector => {
        try {
          clone.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) {}
      });
      
      // Try to find main content container
      const mainSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.post-content', '.article-content', '.entry-content',
        '.main-content', '.page-content', '.content-body',
        '#content', '#main', '#article',
      ];
      
      for (const selector of mainSelectors) {
        const main = clone.querySelector(selector);
        if (main && main.innerText.trim().length > 500) {
          return main.innerText.trim();
        }
      }
      
      // Fallback: return cleaned body text
      return clone.innerText.trim();
    })()
  `;
}

/**
 * Validate extracted text - returns true if it looks like real content
 */
export function isValidContent(text: string): boolean {
  if (!text || text.length < 100) {
    return false
  }
  
  // Check for excessive code-like content
  const codeIndicators = [
    /\{[\s\S]*\}/g,                    // Braces (CSS/JS objects)
    /function\s*\(/g,                   // Functions
    /const\s+\w+\s*=/g,                // Const declarations
    /\.\w+\s*\{/g,                     // CSS selectors
    /#\w+\s*\{/g,                      // CSS ID selectors
  ]
  
  let codeMatches = 0
  for (const pattern of codeIndicators) {
    const matches = text.match(pattern)
    codeMatches += matches ? matches.length : 0
  }
  
  // If more than 10% of content looks like code, it's probably not clean
  const codeRatio = codeMatches / (text.length / 100)
  if (codeRatio > 0.1) {
    console.log(`[ContentCleaner] Content rejected: too much code (ratio: ${codeRatio.toFixed(3)})`)
    return false
  }
  
  return true
}




