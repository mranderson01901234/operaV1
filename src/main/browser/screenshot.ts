import { getBrowserView, executeCDPCommand } from './controller'

export interface ScreenshotOptions {
  fullPage?: boolean // If true, capture full page; if false, capture viewport only
  quality?: number // JPEG quality (0-100), only used for JPEG format
  format?: 'png' | 'jpeg' // Image format
  scale?: number // Scale factor (0-1), default 0.75 for cost optimization
}

/**
 * Captures a screenshot of the BrowserView
 * @param options Screenshot options
 * @returns Base64-encoded image string (with data URI prefix)
 */
export async function captureScreenshot(options: ScreenshotOptions = {}): Promise<string> {
  const browserView = getBrowserView()
  if (!browserView) {
    throw new Error('BrowserView not initialized')
  }

  const {
    fullPage = false,
    quality = 60, // Lower quality for cost optimization (was 80)
    format = 'jpeg', // JPEG is smaller than PNG (cost optimization)
    scale = 0.75, // 75% resolution for cost optimization
  } = options

  try {
    if (fullPage) {
      // For full page screenshot, we need to use CDP Page.captureScreenshot
      // First, get the page dimensions
      const pageMetrics = await executeCDPCommand('Page.getLayoutMetrics')
      const contentSize = pageMetrics.cssContentSize || pageMetrics.contentSize

      // Capture screenshot with full page dimensions (scaled for cost optimization)
      const screenshot = await executeCDPCommand('Page.captureScreenshot', {
        format: format === 'jpeg' ? 'jpeg' : 'png',
        quality: format === 'jpeg' ? quality : undefined,
        clip: {
          x: 0,
          y: 0,
          width: contentSize.width * scale,
          height: contentSize.height * scale,
          scale: scale,
        },
      })

      const imageData = screenshot.data
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
      return `data:${mimeType};base64,${imageData}`
    } else {
      // For viewport screenshot, use CDP with scaling for cost optimization
      const bounds = browserView.getBounds()
      const screenshot = await executeCDPCommand('Page.captureScreenshot', {
        format: format === 'jpeg' ? 'jpeg' : 'png',
        quality: format === 'jpeg' ? quality : undefined,
        clip: {
          x: 0,
          y: 0,
          width: bounds.width * scale,
          height: bounds.height * scale,
          scale: scale,
        },
      })
      
      const imageData = screenshot.data
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
      return `data:${mimeType};base64,${imageData}`
    }
  } catch (error) {
    console.error('Error capturing screenshot:', error)
    throw error
  }
}

/**
 * Captures a screenshot of a specific element using a CSS selector
 * @param selector CSS selector of the element to capture
 * @param options Screenshot options
 * @returns Base64-encoded image string (with data URI prefix) or null if element not found
 */
export async function captureElementScreenshot(
  selector: string,
  options: ScreenshotOptions = {}
): Promise<string | null> {
  const browserView = getBrowserView()
  if (!browserView) {
    throw new Error('BrowserView not initialized')
  }

  try {
    // Get the document
    const { root } = await executeCDPCommand('DOM.getDocument')
    
    // Find the element
    const { nodeId } = await executeCDPCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    })

    if (!nodeId) {
      return null // Element not found
    }

    // Get the box model for the element
    const { model } = await executeCDPCommand('DOM.getBoxModel', { nodeId })

    if (!model || !model.content) {
      return null
    }

    // Extract coordinates from box model
    // Box model format: [x1, y1, x2, y2, x3, y3, x4, y4]
    const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content
    const x = Math.min(x1, x2, x3, x4)
    const y = Math.min(y1, y2, y3, y4)
    const width = Math.max(x1, x2, x3, x4) - x
    const height = Math.max(y1, y2, y3, y4) - y

    // Capture screenshot with element bounds (with scaling for cost optimization)
    const scale = options.scale || 0.75
    const screenshot = await executeCDPCommand('Page.captureScreenshot', {
      format: options.format === 'jpeg' ? 'jpeg' : 'png',
      quality: options.format === 'jpeg' ? (options.quality || 60) : undefined,
      clip: {
        x,
        y,
        width: width * scale,
        height: height * scale,
        scale: scale,
      },
    })

    const imageData = screenshot.data
    const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mimeType};base64,${imageData}`
  } catch (error) {
    console.error('Error capturing element screenshot:', error)
    return null
  }
}

