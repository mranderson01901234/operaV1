/**
 * Bundled .doc file extractor
 * Uses bundled antiword binaries for cross-platform support without requiring user installation
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the path to the bundled antiword binary for the current platform
 */
function getBundledAntiwordPath(): string | null {
  const platform = process.platform
  const isDev = process.env.NODE_ENV === 'development'
  
  let binaryPath: string
  
  if (isDev) {
    // In development, use binaries from project root resources directory
    binaryPath = path.join(__dirname, '../../../resources/binaries', platform, 'antiword')
  } else {
    // In production, binaries are bundled with the app
    // Try multiple possible locations
    const appPath = app.getAppPath()
    const resourcesPath = process.resourcesPath || appPath
    
    // Check multiple possible paths
    const possiblePaths = [
      path.join(resourcesPath, 'resources', 'binaries', platform, 'antiword'),
      path.join(appPath, 'resources', 'binaries', platform, 'antiword'),
      path.join(__dirname, '../../resources/binaries', platform, 'antiword'),
    ]
    
    let foundPath: string | null = null
    for (const possiblePath of possiblePaths) {
      const testPath = platform === 'win32' ? possiblePath + '.exe' : possiblePath
      if (existsSync(testPath)) {
        foundPath = testPath
        break
      }
    }
    
    if (foundPath) {
      return foundPath
    }
    
    return null
  }
  
  // Add platform-specific extension
  if (platform === 'win32') {
    binaryPath += '.exe'
  }
  
  // Check if binary exists
  if (existsSync(binaryPath)) {
    return binaryPath
  }
  
  return null
}

/**
 * Extract text from .doc file using bundled antiword binary
 */
export async function extractDocTextWithBundledBinary(
  docFilePath: string
): Promise<string> {
  const antiwordPath = getBundledAntiwordPath()
  
  if (!antiwordPath) {
    throw new Error(
      `Bundled antiword binary not found for platform: ${process.platform}. ` +
      `Please ensure binaries are included in the app bundle.`
    )
  }
  
  try {
    // Use bundled antiword to extract text
    // -m flag outputs as text, -x flag extracts text only
    const { stdout, stderr } = await execAsync(
      `"${antiwordPath}" -m UTF-8.txt "${docFilePath}"`
    )
    
    if (stderr && !stderr.includes('antiword')) {
      console.warn('antiword stderr:', stderr)
    }
    
    return stdout || ''
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract text from .doc file: ${errorMessage}`)
  }
}

/**
 * Check if bundled binary is available
 */
export function isBundledBinaryAvailable(): boolean {
  return getBundledAntiwordPath() !== null
}

