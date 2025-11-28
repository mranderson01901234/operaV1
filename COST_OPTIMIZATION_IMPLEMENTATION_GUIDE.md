# Cost Optimization Implementation Guide

## Quick Reference: Current vs Optimized Flow

### Current Flow (Expensive)
```
User Message
  ↓
Capture Browser Context (screenshot + a11y tree) ← COST: ~2,500 tokens
  ↓
Send to LLM with FULL conversation history ← COST: ~5,000-20,000 tokens
  ↓
LLM Response (tool calls)
  ↓
Execute Tools
  ↓
Capture FRESH Browser Context AGAIN ← COST: ~2,500 tokens
  ↓
Send Follow-up with FULL history + fresh context ← COST: ~6,000-21,000 tokens
  ↓
LLM Response (more tool calls?)
  ↓
Repeat...
```

**Total per interaction**: 2-10 API calls × ~5,000-20,000 tokens = **$0.10-$0.50+**

### Optimized Flow (Target)
```
User Message
  ↓
Check Cached Context (if URL unchanged, reuse) ← SAVINGS: ~2,500 tokens
  ↓
Capture Browser Context (NO screenshot unless needed) ← SAVINGS: ~2,000 tokens
  ↓
Truncate Conversation History (last 20 messages) ← SAVINGS: ~10,000-15,000 tokens
  ↓
Route to Appropriate Model Tier ← SAVINGS: 50-98% cost reduction
  ↓
Send to LLM with optimized context
  ↓
LLM Response (tool calls)
  ↓
Batch Execute ALL Tools
  ↓
Check Cached Context (reuse if available) ← SAVINGS: ~2,500 tokens
  ↓
Single Follow-up with optimized context ← SAVINGS: ~10,000 tokens
  ↓
Done
```

**Total per interaction**: 2 API calls × ~2,000-4,000 tokens = **$0.02-$0.05**

---

## Implementation Checklist

### Phase 1: Quick Wins (Priority: HIGH)

#### ✅ 1. Lazy Screenshot Capture
**File**: `src/renderer/stores/chatStore.ts`

**Changes**:
```typescript
// Line 81: Update function signature
async function getBrowserContext(
  includeScreenshot: boolean = false,  // ADD THIS
  maxElements: number = 30
): Promise<{...}>

// Line 184: Don't capture screenshot by default
const browserContext = await getBrowserContext(false)  // CHANGE: was true

// Line 239: Only include screenshot if model supports vision AND explicitly requested
images: (capabilities?.supportsVision && browserContext.screenshot) 
  ? [browserContext.screenshot] 
  : undefined,

// Line 367: Same for follow-up
const freshContext = await getBrowserContext(false)  // CHANGE: was true
```

**File**: `src/main/ipc/browser.ts`

**Changes**:
```typescript
// Line 78: Update handler to accept screenshot parameter
ipcMain.handle(IPC_CHANNELS.BROWSER_GET_CONTEXT, async (_event, includeScreenshot: boolean = false) => {
  // ...
  let screenshot: string | null = null
  if (includeScreenshot) {  // ADD CONDITION
    try {
      screenshot = await captureScreenshot({ fullPage: false, format: 'png' })
    } catch (error) {
      console.warn('Failed to capture screenshot for context:', error)
    }
  }
  // ...
})
```

**File**: `src/renderer/lib/ipc.ts`

**Changes**:
```typescript
// Update IPC call to pass screenshot parameter
getContext: async (includeScreenshot: boolean = false): Promise<BrowserState> => {
  return window.electronAPI.invoke(IPC_CHANNELS.BROWSER_GET_CONTEXT, includeScreenshot)
}
```

**Expected Savings**: ~2,000 tokens per interaction (40% reduction)

---

#### ✅ 2. Conversation History Truncation
**File**: `src/renderer/stores/chatStore.ts`

**Changes**:
```typescript
// Add constant at top of file
const MAX_HISTORY_MESSAGES = 20  // Configurable

// Line 228: Truncate messages before sending
const chatParams: ChatParams & { provider: string } = {
  provider: params.provider,
  model: params.model,
  messages: [
    // Truncate to last MAX_HISTORY_MESSAGES
    ...get().messages
      .slice(-MAX_HISTORY_MESSAGES - 1)  // Keep last N + current
      .slice(0, -1)  // Remove current message (will add separately)
      .map(m => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
      })),
    // Add current message with context
    { role: 'user' as const, content: contextualContent },
  ],
  // ...
}
```

**Expected Savings**: ~10,000-15,000 tokens for long conversations (60-80% reduction)

---

#### ✅ 3. Context Caching
**File**: `src/renderer/stores/chatStore.ts`

**Changes**:
```typescript
// Add cache state
interface ChatStore {
  // ... existing fields
  cachedBrowserContext: {
    context: { url: string; title: string; accessibilityTree: string; screenshot: string | null }
    timestamp: number
    url: string
  } | null
}

// Update getBrowserContext to use cache
async function getBrowserContext(
  includeScreenshot: boolean = false,
  maxElements: number = 30,
  forceRefresh: boolean = false
): Promise<{...}> {
  const cached = get().cachedBrowserContext
  
  // Reuse cache if:
  // - Cache exists
  // - URL hasn't changed
  // - Less than 5 seconds old
  // - Not forcing refresh
  if (!forceRefresh && cached && cached.url === (await ipc.browser.getState()).url) {
    const age = Date.now() - cached.timestamp
    if (age < 5000) {  // 5 second cache
      return cached.context
    }
  }
  
  // Otherwise, fetch fresh context
  const response = await ipc.browser.getContext(includeScreenshot)
  // ... existing logic ...
  
  const context = { url, title, accessibilityTree, screenshot }
  
  // Update cache
  set({ cachedBrowserContext: { context, timestamp: Date.now(), url } })
  
  return context
}

// After tool execution, invalidate cache
// Line 367: Force refresh after tools
const freshContext = await getBrowserContext(false, 30, true)  // forceRefresh = true
```

**Expected Savings**: ~2,500 tokens per interaction (eliminates redundant captures)

---

### Phase 2: Model Optimization (Priority: MEDIUM)

#### ✅ 4. Token Counting & Tracking (Internal Only)
**New File**: `src/main/llm/cost-tracker.ts`

**Note**: This is for internal tracking only. Do NOT show costs to users per business decision.

```typescript
interface TokenCount {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
}

interface ModelPricing {
  inputCostPer1M: number
  outputCostPer1M: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-5': { inputCostPer1M: 10, outputCostPer1M: 30 },
  'gpt-4o': { inputCostPer1M: 2.5, outputCostPer1M: 10 },
  'gpt-4o-mini': { inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  'claude-opus-4-5-20251101': { inputCostPer1M: 5, outputCostPer1M: 15 },
  'claude-sonnet-4-5-20250929': { inputCostPer1M: 3, outputCostPer1M: 15 },
  'claude-3-5-haiku-20241022': { inputCostPer1M: 0.25, outputCostPer1M: 1.25 },
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4)
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPer1M
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPer1M
  return inputCost + outputCost
}

export function countImageTokens(base64Image: string): number {
  // Rough estimation: ~170 tokens per 512x512 image tile
  // Full screenshot ~1024x768 ≈ 4 tiles = ~680 tokens
  // But vision models charge more, estimate ~1500-2500 tokens
  const sizeKB = (base64Image.length * 3) / 4 / 1024
  return Math.ceil(sizeKB / 100) * 170  // Rough estimate
}
```

**File**: `src/main/llm/router.ts`

**Changes**:
```typescript
import { estimateTokens, estimateCost, countImageTokens } from './cost-tracker'

async *chat(providerId: string, params: ChatParams): AsyncIterable<ChatChunk> {
  // Count input tokens
  let inputTokens = 0
  
  // Count system prompt
  if (params.systemPrompt) {
    inputTokens += estimateTokens(params.systemPrompt)
  }
  
  // Count messages
  for (const msg of params.messages) {
    inputTokens += estimateTokens(msg.content)
    // Count images
    if (params.images) {
      for (const img of params.images) {
        inputTokens += countImageTokens(img)
      }
    }
  }
  
  // Estimate cost (INTERNAL ONLY - not shown to users)
  const estimatedCost = estimateCost(params.model, inputTokens, 0)
  console.log(`[Cost] Estimated input tokens: ${inputTokens}, cost: $${estimatedCost.toFixed(4)}`)
  
  // Track usage for billing (Options A & B)
  if (params.userId) {
    await trackUsage(params.userId, {
      model: params.model,
      inputTokens,
      estimatedCost,
    })
  }
  
  // ... existing chat logic ...
  
  // Track output tokens (approximate)
  let outputTokens = 0
  for await (const chunk of provider.chat(params)) {
    if (chunk.content) {
      outputTokens += estimateTokens(chunk.content)
    }
    yield chunk
  }
  
  const totalCost = estimateCost(params.model, inputTokens, outputTokens)
  console.log(`[Cost] Total tokens: ${inputTokens + outputTokens}, cost: $${totalCost.toFixed(4)}`)
  
  // Update usage tracking with final costs
  if (params.userId) {
    await updateUsage(params.userId, {
      inputTokens,
      outputTokens,
      totalCost,
    })
  }
}
```

---

#### ✅ 5. Model Routing / Tiered Models
**New File**: `src/main/llm/model-router.ts`

```typescript
interface TaskComplexity {
  level: 'simple' | 'medium' | 'complex'
  recommendedModel: string
  fallbackModel: string
}

const MODEL_TIERS = {
  simple: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-20241022',
  },
  medium: {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-5-20250929',
  },
  complex: {
    openai: 'gpt-5',
    anthropic: 'claude-opus-4-5-20251101',
  },
}

export function classifyTaskComplexity(
  userMessage: string,
  hasToolCalls: boolean,
  conversationLength: number
): 'simple' | 'medium' | 'complex' {
  // Simple: Short message, no tools, simple extraction
  if (!hasToolCalls && userMessage.length < 100 && conversationLength < 5) {
    return 'simple'
  }
  
  // Complex: Long message, multiple tools, long conversation
  if (hasToolCalls && userMessage.length > 500 && conversationLength > 20) {
    return 'complex'
  }
  
  // Default: medium
  return 'medium'
}

export function selectModelForTask(
  provider: string,
  complexity: 'simple' | 'medium' | 'complex',
  userSelectedModel?: string
): string {
  // If user explicitly selected expensive model, use it
  if (userSelectedModel && ['gpt-5', 'claude-opus-4-5-20251101'].includes(userSelectedModel)) {
    return userSelectedModel
  }
  
  // Otherwise, route based on complexity
  return MODEL_TIERS[complexity][provider as keyof typeof MODEL_TIERS.simple] || userSelectedModel || MODEL_TIERS.medium[provider as keyof typeof MODEL_TIERS.medium]
}
```

**File**: `src/renderer/stores/chatStore.ts`

**Changes**:
```typescript
import { classifyTaskComplexity, selectModelForTask } from '../../main/llm/model-router'

sendMessage: async (content: string, agentId: string, params: { provider: string; model: string; systemPrompt?: string }) => {
  // ... existing code ...
  
  // Classify task complexity
  const complexity = classifyTaskComplexity(
    content,
    false,  // Will be updated after first response
    messages.length
  )
  
  // Route to appropriate model
  const selectedModel = selectModelForTask(params.provider, complexity, params.model)
  
  console.log(`[Model Router] Complexity: ${complexity}, Selected: ${selectedModel}`)
  
  // Use selectedModel instead of params.model
  const chatParams: ChatParams & { provider: string } = {
    provider: params.provider,
    model: selectedModel,  // Use routed model
    // ... rest of params
  }
}
```

---

### Phase 3: Advanced Optimizations (Priority: LOW)

#### ✅ 6. Screenshot Optimization
**File**: `src/main/browser/screenshot.ts`

**Changes**:
```typescript
export async function captureScreenshot(options: ScreenshotOptions = {}): Promise<string> {
  // ... existing code ...
  
  // Add resolution scaling for cost optimization
  const scale = options.scale || 0.75  // Default to 75% resolution
  
  if (fullPage) {
    const screenshot = await executeCDPCommand('Page.captureScreenshot', {
      format: format === 'jpeg' ? 'jpeg' : 'png',
      quality: format === 'jpeg' ? (quality || 60) : undefined,  // Lower quality
      clip: {
        x: 0,
        y: 0,
        width: contentSize.width * scale,  // Scale down
        height: contentSize.height * scale,
        scale: scale,
      },
    })
    // ...
  }
}
```

---

#### ✅ 7. Request Deduplication
**New File**: `src/main/llm/request-cache.ts`

```typescript
interface CachedRequest {
  hash: string
  response: ChatChunk[]
  timestamp: number
  ttl: number  // Time to live in ms
}

const requestCache = new Map<string, CachedRequest>()
const CACHE_TTL = 60000  // 1 minute

export function hashRequest(params: ChatParams): string {
  // Create hash from last message + model
  const lastMessage = params.messages[params.messages.length - 1]
  return `${params.model}:${lastMessage.content}:${JSON.stringify(params.images || [])}`
}

export function getCachedResponse(params: ChatParams): ChatChunk[] | null {
  const hash = hashRequest(params)
  const cached = requestCache.get(hash)
  
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.response
  }
  
  return null
}

export function cacheResponse(params: ChatParams, response: ChatChunk[]): void {
  const hash = hashRequest(params)
  requestCache.set(hash, {
    hash,
    response,
    timestamp: Date.now(),
    ttl: CACHE_TTL,
  })
  
  // Cleanup old entries
  if (requestCache.size > 100) {
    const now = Date.now()
    for (const [key, value] of requestCache.entries()) {
      if (now - value.timestamp > value.ttl) {
        requestCache.delete(key)
      }
    }
  }
}
```

---

## Testing Checklist

### Phase 1 Tests
- [ ] Screenshot only captured when explicitly requested
- [ ] Conversation history truncated to 20 messages
- [ ] Context cached and reused when URL unchanged
- [ ] Cost reduction verified (should be ~60%)

### Phase 2 Tests
- [ ] Token counting accurate (±10%)
- [ ] Cost estimates displayed
- [ ] Model routing works correctly
- [ ] Simple tasks use cheap models
- [ ] Complex tasks use expensive models

### Phase 3 Tests
- [ ] Screenshot resolution reduced
- [ ] Request deduplication works
- [ ] Cache cleanup works correctly

---

## Monitoring & Metrics

### Key Metrics to Track (Internal Only - No User Visibility)
1. **Tokens per request**: Input + output (for billing/limits)
2. **Cost per request**: Calculated from tokens (internal only)
3. **API calls per interaction**: Should decrease
4. **Model usage**: Track which models are used
5. **Cache hit rate**: Should increase
6. **Average conversation length**: Monitor growth
7. **User usage**: Track per-user for billing (Options A & B)
8. **Free tier usage**: Track for limit enforcement

### Logging
Add structured logging (internal only):
```typescript
logger.info('LLM Request', {
  userId: params.userId, // For billing tracking
  model: params.model,
  inputTokens,
  outputTokens,
  estimatedCost,
  cacheHit: !!cachedResponse,
  complexity,
  selectedModel,
  userTier: 'free' | 'paid', // For restrictions
})
```

### User-Facing Metrics (Abstract Only)
- **DO NOT** show token counts
- **DO NOT** show cost estimates
- **DO NOT** show spending breakdowns
- **DO SHOW**: Abstract usage indicators (e.g., "50% of limit used")
- **DO SHOW**: Account status (active/inactive for subscriptions)
- **DO SHOW**: Model being used (but not costs)

---

## Rollout Strategy

1. **Week 1**: Implement Phase 1 (Quick Wins)
   - Deploy to staging
   - Monitor for 2-3 days
   - Verify cost reduction
   - Deploy to production

2. **Week 2**: Implement Phase 2 (Model Optimization)
   - Deploy to staging
   - A/B test with small user group
   - Monitor model selection accuracy
   - Full rollout

3. **Week 3-4**: Implement Phase 3 (Advanced)
   - Gradual rollout
   - Monitor performance impact
   - Fine-tune parameters

---

## Expected Results

### Before Optimization
- **Cost per interaction**: $0.10-$0.50
- **API calls per interaction**: 3-10
- **Tokens per interaction**: 10,000-50,000

### After Phase 1
- **Cost per interaction**: $0.04-$0.20 (60% reduction)
- **API calls per interaction**: 2-5 (50% reduction)
- **Tokens per interaction**: 4,000-20,000 (60% reduction)

### After Phase 2
- **Cost per interaction**: $0.02-$0.10 (80% reduction)
- **API calls per interaction**: 2-3 (70% reduction)
- **Tokens per interaction**: 2,000-10,000 (80% reduction)

### After Phase 3
- **Cost per interaction**: $0.01-$0.05 (90% reduction)
- **API calls per interaction**: 2 (80% reduction)
- **Tokens per interaction**: 1,000-5,000 (90% reduction)

---

## Risk Mitigation

### Potential Issues
1. **Model routing errors**: Simple tasks routed to expensive models
   - **Mitigation**: Log routing decisions, allow override

2. **Cache staleness**: Using outdated context
   - **Mitigation**: Short TTL (5 seconds), force refresh after tools

3. **History truncation**: Losing important context
   - **Mitigation**: Keep recent messages + system prompt, add summarization later

4. **Screenshot quality**: Too low resolution
   - **Mitigation**: Make resolution configurable, allow full-res when needed

---

## Success Criteria

### Phase 1 Success
- ✅ 50%+ cost reduction
- ✅ No functionality regressions
- ✅ User experience unchanged

### Phase 2 Success
- ✅ 70%+ cost reduction
- ✅ Model routing accuracy >90%
- ✅ User satisfaction maintained

### Phase 3 Success
- ✅ 85%+ cost reduction
- ✅ Performance maintained
- ✅ Feature parity preserved

