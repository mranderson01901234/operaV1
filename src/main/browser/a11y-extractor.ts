import { executeCDPCommand } from './controller'
import type { A11yNode } from '../../shared/types'

// Batch size for parallel processing - process 10 nodes at a time to avoid overwhelming CDP
const BATCH_SIZE = 10

/**
 * Checks if a role is considered interactive
 */
function isInteractiveRole(role: string): boolean {
  const interactiveRoles = [
    'button',
    'link',
    'textbox',
    'combobox',
    'checkbox',
    'radio',
    'menuitem',
    'tab',
    'searchbox',
    'slider',
    'switch',
    'option',
    'menuitemcheckbox',
    'menuitemradio',
    'treeitem',
    'gridcell',
    'cell',
    'columnheader',
    'rowheader',
  ]
  return interactiveRoles.includes(role.toLowerCase())
}

/**
 * Extracts accessibility tree and filters to interactive elements
 * OPTIMIZED: Uses parallel batch processing for 3-5x faster extraction
 */
export async function extractAccessibilityTree(): Promise<A11yNode[]> {
  const startTime = performance.now()
  
  try {
    // Step 1: Get the full accessibility tree in ONE CDP call
    const treeStartTime = performance.now()
    const { nodes } = await executeCDPCommand('Accessibility.getFullAXTree')
    console.log(`[A11y] getFullAXTree: ${(performance.now() - treeStartTime).toFixed(2)}ms`)
    
    if (!nodes || !Array.isArray(nodes)) {
      return []
    }

    // Step 2: Filter to interactive elements only
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio',
      'combobox', 'listbox', 'menuitem', 'tab', 'searchbox',
      'slider', 'spinbutton', 'switch', 'menuitemcheckbox',
      'menuitemradio', 'option', 'treeitem', 'gridcell',
      'cell', 'columnheader', 'rowheader',
    ])

    const interactiveNodes = nodes.filter((node: any) =>
      interactiveRoles.has(node.role?.value?.toLowerCase()) &&
      // Don't require name.value - some inputs only have placeholder/label
      // Accept if has name, value, or any accessible content
      (node.name?.value || node.value?.value || node.description?.value) &&
      node.backendDOMNodeId  // Must have DOM node for selector generation
    )

    console.log(`[A11y] Found ${interactiveNodes.length} interactive elements (filtered from ${nodes.length})`)

    // Step 3: Process in parallel batches
    const batchStartTime = performance.now()
    const results: A11yNode[] = []

    for (let i = 0; i < interactiveNodes.length; i += BATCH_SIZE) {
      const batch = interactiveNodes.slice(i, i + BATCH_SIZE)
      const batchResults = await processBatchParallel(batch)
      results.push(...batchResults)
    }

    console.log(`[A11y] Batch processing: ${(performance.now() - batchStartTime).toFixed(2)}ms`)
    console.log(`[A11y] Total extraction time: ${(performance.now() - startTime).toFixed(2)}ms`)

    return results
  } catch (error) {
    console.error('Error extracting accessibility tree:', error)
    return []
  }
}

/**
 * Process a batch of nodes in parallel
 * This is the key optimization - all CDP calls happen in parallel
 */
async function processBatchParallel(nodes: any[]): Promise<A11yNode[]> {
  // PARALLEL STEP 1: Get all DOM node IDs at once
  const nodeIdResults = await Promise.all(
    nodes.map(async (node) => {
      if (!node.backendDOMNodeId) return null
      
      try {
        // Use DOM.describeNode to get nodeId from backendNodeId
        const result = await executeCDPCommand('DOM.describeNode', {
          backendNodeId: node.backendDOMNodeId
        })
        return result?.node?.nodeId || null
      } catch (e) {
        // Node may have been removed from DOM
        return null
      }
    })
  )

  // PARALLEL STEP 2: Get all attributes at once
  const attributeResults = await Promise.all(
    nodeIdResults.map(async (nodeId) => {
      if (!nodeId) return null
      
      try {
        const result = await executeCDPCommand('DOM.getAttributes', { nodeId })
        return attributesToObject(result?.attributes || [])
      } catch (e) {
        return null
      }
    })
  )

  // PARALLEL STEP 3: Get all bounding boxes at once
  // Note: We already have boundingBox from a11y tree, but get more accurate from DOM
  const boundsResults = await Promise.all(
    nodeIdResults.map(async (nodeId) => {
      if (!nodeId) return null
      
      try {
        const result = await executeCDPCommand('DOM.getBoxModel', { nodeId })
        if (result?.model?.content) {
          const [x1, y1, x2, , , y3] = result.model.content
          return {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y3 - y1
          }
        }
        return null
      } catch (e) {
        return null
      }
    })
  )

  // STEP 4: Assemble results (no CDP calls, just data processing)
  return nodes.map((node, index): A11yNode | null => {
    const attrs = attributeResults[index]
    const bounds = boundsResults[index]
    const a11yBounds = node.boundingBox

    // Use DOM bounds if available, otherwise fall back to a11y bounds
    const finalBounds = bounds || (a11yBounds ? {
      x: a11yBounds.x || 0,
      y: a11yBounds.y || 0,
      width: a11yBounds.width || 0,
      height: a11yBounds.height || 0,
    } : undefined)

    // Skip nodes we couldn't resolve (no attributes and no bounds)
    if (!attrs && !finalBounds) return null

    return {
      role: node.role?.value?.toLowerCase() || 'unknown',
      name: node.name?.value || '',
      value: node.value?.value,
      selector: generateSelector(node, attrs || {}),
      bounds: finalBounds,
    }
  }).filter((n): n is A11yNode => n !== null)
}

/**
 * Convert attributes array to object
 */
function attributesToObject(attributes: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < attributes.length; i += 2) {
    if (attributes[i] && attributes[i + 1]) {
      result[attributes[i]] = attributes[i + 1]
    }
  }
  return result
}

/**
 * Generate selector from node and attributes
 * Improved selector generation with better priority order
 */
function generateSelector(node: any, attrs: Record<string, string>): string {
  const role = node.role?.value?.toLowerCase()
  const name = node.name?.value

  // Priority 1: ID (most reliable)
  if (attrs.id && !attrs.id.match(/^[0-9]|:/)) {
    return `#${CSS.escape(attrs.id)}`
  }

  // Priority 2: Test attributes (very reliable)
  const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test']
  for (const attr of testAttrs) {
    if (attrs[attr]) {
      return `[${attr}="${CSS.escape(attrs[attr])}"]`
    }
  }

  // Priority 3: Unique aria-label
  if (attrs['aria-label']) {
    return `[aria-label="${CSS.escape(attrs['aria-label'])}"]`
  }

  // Priority 4: Name attribute for inputs (most reliable for form inputs)
  if (attrs.name && (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'listbox')) {
    return `input[name="${CSS.escape(attrs.name)}"]`
  }

  // Priority 5: Role + accessible name (Playwright-style)
  if (role && name && name.length < 50) {
    return `${role}[name="${CSS.escape(name)}"]`
  }

  // Priority 6: Href for links
  if (role === 'link' && attrs.href) {
    const href = attrs.href
    if (href.length < 100 && !href.includes('javascript:')) {
      if (href.startsWith('/')) {
        return `a[href="${CSS.escape(href)}"]`
      }
      return `a[href*="${CSS.escape(href.substring(0, 50))}"]`
    }
  }

  // Priority 7: Class-based (less reliable, last resort)
  if (attrs.class) {
    // Filter out utility/state classes
    const skipPatterns = /^(active|hover|focus|selected|disabled|hidden|visible|open|closed|is-|has-|js-|w-|h-|p-|m-|text-|bg-|border-)/
    const classes = attrs.class
      .split(/\s+/)
      .filter(c => c && c.length > 2 && !skipPatterns.test(c))
      .slice(0, 2)  // Max 2 classes

    if (classes.length > 0) {
      return `.${classes.map(c => CSS.escape(c)).join('.')}`
    }
  }

  // Fallback: Text content selector
  if (name && name.length < 30) {
    return `text="${CSS.escape(name)}"`
  }

  // Ultimate fallback: Role-based
  if (role) {
    return `[role="${role}"]`
  }

  return ''
}

// CSS.escape polyfill for Node.js
const CSS = {
  escape: (str: string): string => {
    return str.replace(/([^\w-])/g, '\\$1')
  }
}

/**
 * Formats accessibility tree for LLM context
 */
export function formatAccessibilityTree(tree: A11yNode[]): string {
  if (tree.length === 0) {
    return 'No interactive elements found on this page.'
  }

  const lines = tree.map((node, index) => {
    const parts = [
      `${index + 1}. [${node.role}] ${node.name}`,
    ]
    
    if (node.value !== undefined) {
      parts.push(`   Value: "${node.value}"`)
    }
    
    if (node.selector) {
      parts.push(`   Selector: ${node.selector}`)
    }
    
    return parts.join('\n')
  })

  return lines.join('\n\n')
}


