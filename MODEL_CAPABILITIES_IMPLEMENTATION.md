# Model Capabilities Implementation

## Summary

Implemented per-model capability checking to allow chat-only models to work alongside full browser automation models without breaking functionality.

## Changes Made

### 1. Type System Updates
- Added `ModelCapabilities` interface to `src/shared/types.ts`
- Updated `LLMProvider` interface to include optional `getModelCapabilities()` method

### 2. Provider Updates
- **BaseProvider** (`src/main/llm/providers/base.ts`):
  - Added `modelCapabilities` Map to store per-model capabilities
  - Added `getModelCapabilities()` method with fallback to provider defaults

- **OpenAIProvider** (`src/main/llm/providers/openai.ts`):
  - Configured capabilities in constructor:
    - **Full Browser**: GPT-5, GPT-4o, GPT-4 Turbo, GPT-4 (vision + tools)
    - **Chat Only**: GPT-3.5 Turbo (tools only, no vision)
    - **Reasoning**: o1/o3 series (no vision, no tools)
  - Updated `chat()` to check model capabilities before including images/tools

- **AnthropicProvider** (`src/main/llm/providers/anthropic.ts`):
  - All Claude models support full browser automation
  - Updated to check model capabilities

- **GeminiProvider** (`src/main/llm/providers/gemini.ts`):
  - All Gemini models support full browser automation
  - Updated to check model capabilities

### 3. Router Updates
- **LLMRouter** (`src/main/llm/router.ts`):
  - Added `getModelCapabilities()` method to expose capabilities via IPC

### 4. IPC Updates
- **LLM IPC** (`src/main/ipc/llm.ts`):
  - Added `llm:getModelCapabilities` handler

- **Renderer IPC** (`src/renderer/lib/ipc.ts`):
  - Added `ipc.llm.getModelCapabilities()` method

### 5. Chat Store Updates
- **ChatStore** (`src/renderer/stores/chatStore.ts`):
  - Checks model capabilities before including:
    - Screenshots (only if `supportsVision`)
    - Browser automation system prompt (only if `supportsTools`)
  - Chat-only models get plain conversation without browser context

### 6. UI Updates
- **SettingsModal** (`src/renderer/components/Settings/SettingsModal.tsx`):
  - Loads model capabilities on open
  - **CustomSelect** component updated to:
    - Show sections: "🌐 Full Browser Automation" and "💬 Chat Only"
    - Display "(Chat Only)" badge for limited models
    - Show warning when chat-only model is selected
  - Models are automatically grouped by capabilities

## How It Works

### For Full Browser Automation Models
1. Browser context (screenshot + accessibility tree) is included
2. Browser automation system prompt is used
3. Tools are passed to the model
4. Model can execute browser actions

### For Chat-Only Models
1. No screenshots included (even if available)
2. Simple system prompt ("You are a helpful AI assistant")
3. No tools passed to the model
4. Works for regular conversation only

### For Reasoning Models (o1/o3)
1. No screenshots
2. Simple system prompt
3. No tools
4. Pure text conversation

## Model Categories

### 🌐 Full Browser Automation
- **OpenAI**: GPT-5, GPT-4o, GPT-4 Turbo, GPT-4
- **Anthropic**: All Claude models
- **Gemini**: All Gemini models

### 💬 Chat Only
- **OpenAI**: GPT-3.5 Turbo (has function calling but no vision)

### Reasoning Only
- **OpenAI**: o1, o1-preview, o1-mini, o3-mini, o3-preview

## Benefits

1. **No Breaking Changes**: Chat-only models work seamlessly
2. **Clear UI**: Users can see which models support what features
3. **Automatic Handling**: System automatically adapts based on model capabilities
4. **Future-Proof**: Easy to add new models with different capabilities

## Testing

To test:
1. Select a chat-only model (e.g., GPT-3.5 Turbo)
2. Send a message - should work normally
3. Try browser automation - should gracefully skip tools
4. Select a full browser model (e.g., GPT-4o)
5. Send a message - should include browser context and tools




