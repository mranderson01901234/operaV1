/**
 * System Dependency Checker for .doc file support
 * Checks if required system dependencies are available
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

export interface DependencyCheckResult {
  available: boolean
  error?: string
  installInstructions?: string
}

/**
 * Check if antiword is available on the system
 */
export async function checkAntiwordAvailable(): Promise<DependencyCheckResult> {
  const platform = process.platform

  try {
    // Try to execute antiword --version
    await execAsync('antiword --version')
    return { available: true }
  } catch (error) {
    // antiword is not available
    let installInstructions = ''

    switch (platform) {
      case 'win32':
        installInstructions = `Windows: Install antiword manually:
1. Download from: https://www.winfield.demon.nl/
2. Extract and add to PATH
OR use Chocolatey: choco install antiword`
        break
      case 'darwin':
        installInstructions = `macOS: Install using Homebrew:
brew install antiword`
        break
      case 'linux':
        installInstructions = `Linux (Ubuntu/Debian):
sudo apt-get update && sudo apt-get install -y antiword

Linux (Fedora/RHEL):
sudo dnf install antiword

Linux (Arch):
sudo pacman -S antiword`
        break
      default:
        installInstructions = `Please install antiword for your operating system.
Visit: https://www.winfield.demon.nl/`
    }

    return {
      available: false,
      error: 'antiword is not installed or not in PATH',
      installInstructions,
    }
  }
}

/**
 * Get platform-specific installation command
 */
export function getInstallCommand(): string {
  const platform = process.platform

  switch (platform) {
    case 'win32':
      return 'choco install antiword'
    case 'darwin':
      return 'brew install antiword'
    case 'linux':
      // Try to detect package manager
      if (existsSync('/usr/bin/apt-get')) {
        return 'sudo apt-get update && sudo apt-get install -y antiword'
      } else if (existsSync('/usr/bin/dnf')) {
        return 'sudo dnf install antiword'
      } else if (existsSync('/usr/bin/pacman')) {
        return 'sudo pacman -S antiword'
      }
      return 'sudo apt-get install antiword' // Default to apt-get
    default:
      return 'Please install antiword manually'
  }
}

