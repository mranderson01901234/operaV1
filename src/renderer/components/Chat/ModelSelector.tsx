import React, { useState, useEffect, useRef } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { ipc } from '../../lib/ipc'
import type { Agent } from '../../../shared/types'

// Available providers and their models for the model selector
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', notes: 'Multimodal flagship', cost: '$$' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', notes: 'Budget multimodal', cost: '$' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    models: [
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', notes: 'Best for agents/computer use', cost: '$$$' },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', notes: 'Fast + capable', cost: '$$' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', notes: 'High performance', cost: '$$' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5', notes: 'Fastest, budget-friendly', cost: '$' },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', notes: 'Advanced reasoning', cost: '$$$' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', notes: 'Best price-performance', cost: '$' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', notes: '1M context', cost: '$' },
    ],
  },
  // DeepSeek is hidden from manual selection - only used automatically for silent tasks
} as const

type ProviderKey = keyof typeof PROVIDERS

interface ModelSelectorProps {
  className?: string
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [modelCapabilities, setModelCapabilities] = useState<Map<string, { supportsVision: boolean; supportsTools: boolean }>>(new Map())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { activeAgentId, getActiveAgent, createAgent, updateAgent } = useAgentStore()

  const activeAgent = getActiveAgent()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      loadModelCapabilities()
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadModelCapabilities = async () => {
    const capabilities = new Map<string, { supportsVision: boolean; supportsTools: boolean }>()
    
    for (const [providerKey, provider] of Object.entries(PROVIDERS)) {
      for (const model of provider.models) {
        try {
          const caps = await ipc.llm.getModelCapabilities(providerKey as ProviderKey, model.id)
          if (caps) {
            capabilities.set(model.id, caps)
          }
        } catch (error) {
          console.error(`Failed to load capabilities for ${model.id}:`, error)
        }
      }
    }
    
    setModelCapabilities(capabilities)
  }

  const handleModelSelect = async (provider: ProviderKey, modelId: string) => {
    setIsOpen(false)
    
    if (activeAgent) {
      // Update existing agent
      await updateAgent(activeAgent.id, {
        provider,
        model: modelId,
      })
    } else {
      // Create new agent with selected model
      await createAgent(undefined, modelId, provider)
    }
  }

  const getCurrentModelName = () => {
    if (!activeAgent) {
      return 'Select Model'
    }

    const provider = PROVIDERS[activeAgent.provider]
    const model = provider?.models.find(m => m.id === activeAgent.model)
    return model?.name || activeAgent.model
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm text-dark-text hover:text-dark-text bg-dark-bg rounded border border-dark-border hover:border-dark-text-secondary transition-colors flex items-center gap-2 min-w-[180px] justify-between"
      >
        <span className="flex items-center gap-2 truncate flex-1 min-w-0">
          <span className="truncate font-medium">{getCurrentModelName()}</span>
        </span>
        <svg
          className={`w-4 h-4 text-dark-text-secondary flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-[420px] bg-dark-panel border border-dark-border rounded-lg shadow-xl max-h-[600px] overflow-y-auto scrollbar-dark-premium z-50">
          {(Object.keys(PROVIDERS) as ProviderKey[]).map((providerKey) => {
            const provider = PROVIDERS[providerKey]
            return (
              <div key={providerKey} className="border-b border-dark-border last:border-b-0">
                <div className="px-4 py-2 bg-dark-bg sticky top-0 border-b border-dark-border">
                  <h3 className="text-sm font-semibold text-dark-text">{provider.name}</h3>
                </div>
                {provider.models.map((model) => {
                  const isSelected = activeAgent?.provider === providerKey && activeAgent?.model === model.id
                  const caps = modelCapabilities.get(model.id)
                  
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => handleModelSelect(providerKey, model.id)}
                      className={`w-full px-4 py-3 text-left transition-colors border-b border-dark-border/50 last:border-b-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'text-dark-text hover:bg-dark-bg'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{model.name}</div>
                          {model.notes && (
                            <div className={`text-xs mt-1 ${isSelected ? 'text-blue-100' : 'text-dark-text-secondary'}`}>
                              {model.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {model.cost && (
                            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${isSelected ? 'border-blue-400/50 text-blue-100 bg-blue-500/20' : 'border-dark-border text-dark-text-secondary bg-dark-bg'}`}>
                              {model.cost}
                            </span>
                          )}
                          {caps && (
                            <>
                              {caps.supportsVision && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-500' : 'bg-dark-border'} ${isSelected ? 'text-white' : 'text-dark-text-secondary'}`}>
                                  👁️
                                </span>
                              )}
                              {caps.supportsTools && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-500' : 'bg-dark-border'} ${isSelected ? 'text-white' : 'text-dark-text-secondary'}`}>
                                  🔧
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ModelSelector

