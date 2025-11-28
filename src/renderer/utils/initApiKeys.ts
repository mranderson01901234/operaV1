// Utility to initialize API keys on first run
// This can be called from the renderer process to set initial API keys
//
// NOTE: API keys should be configured via Settings > API Keys in the app.
// Never hardcode API keys in source code.

import { ipc } from '../lib/ipc'

export async function initializeApiKeys() {
  try {
    // Wait a bit for IPC to be ready
    await new Promise(resolve => setTimeout(resolve, 500))

    // Check if API keys are already set
    const [hasOpenAI, hasAnthropic, hasGemini] = await Promise.all([
      ipc.apiKey.has('openai'),
      ipc.apiKey.has('anthropic'),
      ipc.apiKey.has('gemini')
    ])

    if (!hasOpenAI && !hasAnthropic && !hasGemini) {
      console.log('No API keys configured. Please set API keys in Settings > API Keys.')
    } else {
      console.log('API keys status:', {
        openai: hasOpenAI ? 'configured' : 'not set',
        anthropic: hasAnthropic ? 'configured' : 'not set',
        gemini: hasGemini ? 'configured' : 'not set'
      })
    }
  } catch (error) {
    console.error('Failed to check API keys:', error)
  }
}
