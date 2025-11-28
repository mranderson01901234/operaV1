import React, { useState, useEffect } from 'react'
import { ipc } from '../../lib/ipc'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  // API Keys
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [openaiHasKey, setOpenaiHasKey] = useState(false)
  const [anthropicHasKey, setAnthropicHasKey] = useState(false)
  const [geminiHasKey, setGeminiHasKey] = useState(false)

  // UI state
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    // Load API key status
    const [hasOpenAI, hasAnthropic, hasGemini] = await Promise.all([
      ipc.apiKey.has('openai'),
      ipc.apiKey.has('anthropic'),
      ipc.apiKey.has('gemini'),
    ])

    setOpenaiHasKey(hasOpenAI)
    setAnthropicHasKey(hasAnthropic)
    setGeminiHasKey(hasGemini)
    setOpenaiKey(hasOpenAI ? '••••••••••••••••' : '')
    setAnthropicKey(hasAnthropic ? '••••••••••••••••' : '')
    setGeminiKey(hasGemini ? '••••••••••••••••' : '')
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    try {
      // Save API keys if changed
      const openaiValue = openaiKey.includes('••••') ? null : openaiKey.trim()
      const anthropicValue = anthropicKey.includes('••••') ? null : anthropicKey.trim()
      const geminiValue = geminiKey.includes('••••') ? null : geminiKey.trim()

      if (openaiValue && openaiValue.length > 0) {
        await ipc.apiKey.set('openai', openaiValue)
      }
      if (anthropicValue && anthropicValue.length > 0) {
        await ipc.apiKey.set('anthropic', anthropicValue)
      }
      if (geminiValue && geminiValue.length > 0) {
        await ipc.apiKey.set('gemini', geminiValue)
      }

      setMessage({ type: 'success', text: 'API keys saved successfully!' })

      // Reload to show masked keys
      setTimeout(() => {
        loadSettings()
        setTimeout(() => {
          onClose()
        }, 1000)
      }, 500)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save API keys'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteKey = async (provider: 'openai' | 'anthropic' | 'gemini') => {
    try {
      await ipc.apiKey.delete(provider)
      if (provider === 'openai') {
        setOpenaiKey('')
        setOpenaiHasKey(false)
      } else if (provider === 'anthropic') {
        setAnthropicKey('')
        setAnthropicHasKey(false)
      } else {
        setGeminiKey('')
        setGeminiHasKey(false)
      }
      const providerName = provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Google Gemini'
      setMessage({ type: 'success', text: `${providerName} API key deleted` })
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete API key' })
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed top-0 left-0 bottom-0 z-50 flex items-center justify-center pl-[240px]"
      style={{ width: 'calc(50% + 120px)' }}
    >
      {/* Backdrop only over the left panel area */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      {/* Modal centered within the chat panel area (after sidebar) */}
      <div className="relative bg-dark-panel border border-dark-border rounded-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-xl font-semibold text-dark-text">Settings</h2>
          <button
            onClick={onClose}
            className="text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
              {/* OpenAI Key */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">
                  OpenAI API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={openaiKey}
                    onFocus={() => {
                      if (openaiHasKey && openaiKey.includes('••••')) {
                        setOpenaiKey('')
                      }
                    }}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors"
                  />
                  {openaiHasKey && (
                    <button
                      onClick={() => handleDeleteKey('openai')}
                      className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded border border-dark-border transition-colors"
                      title="Delete key"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-dark-text-secondary mt-1">
                  {openaiHasKey ? 'Key is set. Enter a new key to update.' : 'Required for GPT-4 models'}
                </p>
              </div>

              {/* Anthropic Key */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">
                  Anthropic API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={anthropicKey}
                    onFocus={() => {
                      if (anthropicHasKey && anthropicKey.includes('••••')) {
                        setAnthropicKey('')
                      }
                    }}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors"
                  />
                  {anthropicHasKey && (
                    <button
                      onClick={() => handleDeleteKey('anthropic')}
                      className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded border border-dark-border transition-colors"
                      title="Delete key"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-dark-text-secondary mt-1">
                  {anthropicHasKey ? 'Key is set. Enter a new key to update.' : 'Required for Claude models'}
                </p>
              </div>

              {/* Google Gemini Key */}
              <div>
                <label className="block text-sm font-medium text-dark-text mb-2">
                  Google AI API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={geminiKey}
                    onFocus={() => {
                      if (geminiHasKey && geminiKey.includes('••••')) {
                        setGeminiKey('')
                      }
                    }}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded text-dark-text placeholder-dark-text-secondary focus:outline-none focus:border-dark-text-secondary transition-colors"
                  />
                  {geminiHasKey && (
                    <button
                      onClick={() => handleDeleteKey('gemini')}
                      className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded border border-dark-border transition-colors"
                      title="Delete key"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-dark-text-secondary mt-1">
                  {geminiHasKey ? 'Key is set. Enter a new key to update.' : 'Required for Gemini models'}
                </p>
              </div>

              {/* Key status indicator */}
              <div className="flex flex-wrap gap-3 pt-2">
                <div className={`flex items-center gap-2 text-sm ${openaiHasKey ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                  <span className={`w-2 h-2 rounded-full ${openaiHasKey ? 'bg-green-400' : 'bg-dark-border'}`}></span>
                  OpenAI
                </div>
                <div className={`flex items-center gap-2 text-sm ${anthropicHasKey ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                  <span className={`w-2 h-2 rounded-full ${anthropicHasKey ? 'bg-green-400' : 'bg-dark-border'}`}></span>
                  Anthropic
                </div>
                <div className={`flex items-center gap-2 text-sm ${geminiHasKey ? 'text-green-400' : 'text-dark-text-secondary'}`}>
                  <span className={`w-2 h-2 rounded-full ${geminiHasKey ? 'bg-green-400' : 'bg-dark-border'}`}></span>
                  Gemini
                </div>
              </div>

          {/* Message */}
          {message && (
            <div className={`p-3 rounded ${
              message.type === 'success'
                ? 'bg-green-900/30 text-green-400 border border-green-800'
                : 'bg-red-900/30 text-red-400 border border-red-800'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-dark-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-dark-bg hover:bg-dark-border border border-dark-border rounded text-dark-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white transition-colors"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
