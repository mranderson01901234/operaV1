# Cost Optimization Audit: Chat & Browser Features

## Executive Summary

This audit analyzes the current implementation of chat and browser automation features to identify cost drivers and optimization opportunities, especially for expensive models like GPT-5 and Claude Opus.

**Key Finding**: The current implementation can result in **3-10+ API calls per user interaction** when using browser automation, with each call including full conversation history, screenshots, and large accessibility trees. For expensive models, this creates unsustainable costs.

---

## Current Architecture & Cost Drivers

### 1. Message Flow Analysis

#### Initial User Message Flow:
1. **User sends message** → `sendMessage()` in `chatStore.ts:167`
2. **Browser context captured** → `getBrowserContext()` called (line 184)
   - Screenshot captured (even if not used) - **~1500-2500 tokens**
   - Accessibility tree extracted (limited to 30 elements) - **~500-1000 tokens**
   - URL + title - **~50 tokens**
3. **Full conversation history sent** → All previous messages included (line 228)
4. **LLM API call #1** → Initial response with potential tool calls
5. **If tool calls exist** → Tools executed
6. **Fresh browser context captured AGAIN** → After tool execution (line 367)
7. **Follow-up LLM API call #2** → With fresh context + tool results
8. **If more tool calls** → Loop continues (line 481)

**Cost per user interaction**: 2-10+ API calls × (conversation history + context + screenshots)

### 2. Major Cost Drivers

#### A. Screenshots (Vision Models)
- **Location**: `src/main/ipc/browser.ts:85` - Screenshot captured on EVERY `getBrowserContext()` call
- **Current optimization**: Screenshot only included if model supports vision (line 239 in chatStore.ts)
- **Problem**: Screenshot is still CAPTURED even when not needed
- **Cost**: ~1500-2500 tokens per screenshot (base64 PNG)
- **Frequency**: 2+ times per user interaction (initial + after tool execution)

#### B. Full Conversation History
- **Location**: `src/renderer/stores/chatStore.ts:228` - All messages included
- **Problem**: No truncation, summarization, or sliding window
- **Cost**: Grows linearly with conversation length
- **Example**: 50-message conversation = ~10,000-20,000 tokens of history per API call

#### C. Accessibility Tree
- **Location**: `src/renderer/stores/chatStore.ts:92` - Limited to 30 elements (GOOD)
- **Current**: ~500-1000 tokens per request
- **Optimization**: Already limited, but could be further optimized

#### D. Multiple API Calls Per Interaction
- **Location**: `src/renderer/stores/chatStore.ts:308` - Tool execution loop
- **Problem**: Each tool execution triggers a new API call with full context
- **Cost**: 2-10+ API calls per user request

#### E. No Token/Cost Tracking
- **Location**: No implementation found
- **Problem**: Cannot monitor or limit costs
- **Impact**: No visibility into actual spending

#### F. No Model Routing
- **Location**: User selects model directly
- **Problem**: Expensive models used for simple tasks
- **Example**: GPT-5 used for simple text extraction

---

## Detailed Cost Analysis

### Cost Breakdown Per User Interaction (GPT-5 / Claude Opus)

**Scenario**: User asks "Click the login button and tell me what's on the page"

1. **Initial API Call**:
   - System prompt: ~500 tokens
   - Conversation history (10 messages): ~2,000 tokens
   - Browser context (URL, title, a11y tree): ~1,000 tokens
   - Screenshot (if vision): ~2,000 tokens
   - User message: ~50 tokens
   - **Total Input**: ~5,550 tokens
   - **Output**: ~200 tokens (tool calls)
   - **Cost**: ~$0.055 (GPT-5) or ~$0.027 (Opus)

2. **Tool Execution**: Click button (no API call)

3. **Follow-up API Call**:
   - System prompt: ~500 tokens
   - Full conversation history: ~2,200 tokens (includes previous call)
   - Fresh browser context: ~1,000 tokens
   - Fresh screenshot: ~2,000 tokens
   - Tool results: ~300 tokens
   - **Total Input**: ~6,000 tokens
   - **Output**: ~500 tokens
   - **Cost**: ~$0.060 (GPT-5) or ~$0.030 (Opus)

**Total per interaction**: ~$0.115 (GPT-5) or ~$0.057 (Opus)

**For a 30-minute research session**: 20-50 interactions = **$2.30-$5.75 (GPT-5)** or **$1.14-$2.85 (Opus)**

---

## Optimization Opportunities

### Priority 1: Critical Cost Reductions

#### 1.1 Lazy Screenshot Capture
**Current**: Screenshot captured on every `getBrowserContext()` call
**Fix**: Only capture when explicitly requested (via screenshot tool or vision model needs it)

**Implementation**:
- Modify `getBrowserContext()` to accept `includeScreenshot: boolean` parameter
- Only capture screenshot when `includeScreenshot === true`
- Update `chatStore.ts` to pass `false` by default
- Only pass `true` when model supports vision AND screenshot tool was called

**Savings**: ~2,000 tokens × 50% of requests = **~1,000 tokens per interaction**

#### 1.2 Conversation History Truncation
**Current**: Full history sent with every request
**Fix**: Implement sliding window or summarization

**Options**:
- **Sliding Window**: Keep last N messages (e.g., 10-20)
- **Summarization**: Summarize old messages using cheaper model
- **Smart Truncation**: Keep recent messages + important context

**Implementation**:
- Add `maxHistoryMessages` parameter (default: 20)
- Truncate messages before sending to API
- Optionally summarize truncated messages

**Savings**: For 50-message conversation, reduce from ~20,000 to ~4,000 tokens = **~16,000 tokens saved**

#### 1.3 Context Caching
**Current**: Browser context captured multiple times per interaction
**Fix**: Cache context and only refresh when page changes

**Implementation**:
- Cache browser context with URL + timestamp
- Only refresh if URL changed or >5 seconds elapsed
- Reuse cached context for follow-up calls

**Savings**: Eliminate 1-2 redundant context captures = **~1,000-2,000 tokens per interaction**

#### 1.4 Batch Tool Execution
**Current**: Each tool execution triggers new API call
**Fix**: Batch multiple tool calls and execute together

**Implementation**:
- Collect all tool calls from initial response
- Execute all tools before follow-up API call
- Single follow-up call with all results

**Savings**: Reduce from 3-5 API calls to 2 per interaction = **50-60% reduction**

### Priority 2: Model & Token Optimization

#### 2.1 Model Routing / Tiered Models
**Current**: User selects model directly
**Fix**: Route tasks to appropriate model tier

**Implementation**:
- **Tier 1 (Expensive)**: Complex reasoning, multi-step tasks
- **Tier 2 (Mid)**: Standard browser automation
- **Tier 3 (Cheap)**: Simple extractions, text processing

**Example**:
- Simple text extraction → GPT-4o-mini ($0.15/1M tokens)
- Complex research → GPT-5 ($10/1M tokens)
- **Savings**: 98% cost reduction for simple tasks

#### 2.2 Token Counting & Budget Limits
**Current**: No token tracking
**Fix**: Track tokens and enforce limits

**Implementation**:
- Count input/output tokens per request
- Track per-user/per-session budgets
- Warn/block when approaching limits
- Provide cost estimates before API calls

**Benefits**: Visibility + cost control

#### 2.3 Reduce Screenshot Resolution/Quality
**Current**: Full-resolution PNG screenshots
**Fix**: Lower resolution for vision models

**Implementation**:
- Reduce screenshot dimensions (e.g., 1024x768 instead of full screen)
- Use JPEG with lower quality (80% → 60%)
- Only full resolution when explicitly needed

**Savings**: ~30-50% token reduction for vision = **~600-1,000 tokens per screenshot**

#### 2.4 Optimize Accessibility Tree
**Current**: 30 elements included
**Fix**: Further optimization

**Options**:
- Reduce to 20 elements for initial context
- Only include visible elements (viewport)
- Compress tree format
- Use more efficient encoding

**Savings**: ~200-400 tokens per request

### Priority 3: Architecture Improvements

#### 3.1 Request Deduplication
**Current**: Multiple identical requests possible
**Fix**: Cache recent requests/responses

**Implementation**:
- Cache last N requests with responses
- Check cache before API call
- Return cached response if identical

**Savings**: Eliminate redundant calls

#### 3.2 Streaming Optimization
**Current**: Full streaming implementation
**Fix**: Optimize for cost (already good, but can improve)

**Note**: Streaming is already implemented correctly

#### 3.3 Message Compression
**Current**: Full message content sent
**Fix**: Compress redundant information

**Implementation**:
- Remove redundant context from messages
- Compress tool results
- Use shorter system prompts

**Savings**: ~10-20% token reduction

---

## Recommended Implementation Plan

### Phase 1: Quick Wins (1-2 days)
1. ✅ Lazy screenshot capture
2. ✅ Conversation history truncation (sliding window)
3. ✅ Context caching

**Expected Savings**: 40-60% cost reduction

### Phase 2: Model Optimization (3-5 days)
1. ✅ Token counting and tracking
2. ✅ Model routing/tiered models
3. ✅ Budget limits and warnings

**Expected Savings**: Additional 30-50% reduction (70-80% total)

### Phase 3: Advanced Optimizations (1-2 weeks)
1. ✅ Message summarization
2. ✅ Request deduplication
3. ✅ Screenshot optimization
4. ✅ Advanced context management

**Expected Savings**: Additional 10-20% reduction (80-90% total)

---

## Code Locations for Implementation

### Key Files to Modify:

1. **`src/renderer/stores/chatStore.ts`**
   - Line 81: `getBrowserContext()` - Add lazy screenshot parameter
   - Line 184: Initial context capture - Pass `false` for screenshot
   - Line 228: Message history - Add truncation logic
   - Line 367: Follow-up context - Use cached context if available

2. **`src/main/ipc/browser.ts`**
   - Line 78: `BROWSER_GET_CONTEXT` handler - Add screenshot parameter
   - Add context caching logic

3. **`src/main/llm/router.ts`**
   - Add token counting
   - Add model routing logic

4. **`src/main/llm/providers/base.ts`**
   - Add token counting utilities
   - Add cost estimation methods

5. **New File: `src/main/llm/cost-tracker.ts`**
   - Token counting
   - Cost calculation
   - Budget management

6. **New File: `src/main/llm/model-router.ts`**
   - Task classification
   - Model selection logic
   - Tier management

---

## Cost Comparison: Before vs After

### Before Optimization (Current):
- **Per interaction**: ~$0.115 (GPT-5) or ~$0.057 (Opus)
- **30-min session**: ~$2.30-$5.75 (GPT-5) or ~$1.14-$2.85 (Opus)
- **Daily (100 users)**: ~$230-$575 (GPT-5) or ~$114-$285 (Opus)

### After Phase 1 Optimizations:
- **Per interaction**: ~$0.046-$0.069 (GPT-5) or ~$0.023-$0.034 (Opus)
- **30-min session**: ~$0.92-$2.30 (GPT-5) or ~$0.46-$1.14 (Opus)
- **Daily (100 users)**: ~$92-$230 (GPT-5) or ~$46-$114 (Opus)
- **Savings**: ~60% reduction

### After Phase 2 Optimizations:
- **Per interaction**: ~$0.023-$0.035 (GPT-5) or ~$0.011-$0.017 (Opus)
- **30-min session**: ~$0.46-$1.15 (GPT-5) or ~$0.23-$0.57 (Opus)
- **Daily (100 users)**: ~$46-$115 (GPT-5) or ~$23-$57 (Opus)
- **Savings**: ~80% reduction from original

### After Phase 3 Optimizations:
- **Per interaction**: ~$0.011-$0.023 (GPT-5) or ~$0.006-$0.011 (Opus)
- **30-min session**: ~$0.23-$0.69 (GPT-5) or ~$0.11-$0.34 (Opus)
- **Daily (100 users)**: ~$23-$69 (GPT-5) or ~$11-$34 (Opus)
- **Savings**: ~90% reduction from original

---

## Additional Recommendations

### 1. User-Facing Features
- **NO cost transparency** (per business decision)
- Show abstract usage indicators (e.g., "50% of limit used")
- Display model being used (but not costs)
- Show account status (active/inactive for subscriptions)

### 2. Monitoring & Analytics (Backend Only)
- Track costs per user/session (internal only)
- Monitor token usage patterns
- Alert on unusual spending (internal alerts)
- Generate cost reports (for business, not users)
- Usage tracking for billing (Options A & B)

### 3. Business Model Considerations

#### Option A: Pay-Per-Usage
- **Critical**: Cost optimization directly impacts user costs
- **Required**: Usage tracking system
- **Required**: Spending limit enforcement
- **Required**: Notification system (80%, 90%, 95% warnings)
- **Required**: Auto-reload functionality
- **Remove**: API key settings (users don't need their own keys)

#### Option B: Monthly Subscription
- **Important**: Cost optimization improves margins
- **Required**: Token limit tracking per subscription
- **Required**: Account status management (active/inactive)
- **Required**: Billing cycle management
- **Remove**: API key settings (users don't need their own keys)

#### Option C: One-Time Purchase
- **Less Critical**: Users pay their own API costs
- **Keep**: API key management (users use their own keys)
- **Required**: License key system
- **Required**: License validation

#### Free Tier (All Options)
- **Restrictions**: Gemini 2.5 latest or cheap models only
- **Limits**: Time/usage limits (TBD)
- **Required**: Model restriction enforcement
- **Required**: Usage limit tracking

### 4. Technical Debt
- Add comprehensive error handling
- Implement retry logic with exponential backoff
- Add request timeout handling
- Improve logging for debugging
- Add user authentication system (for Options A & B)
- Add payment processing integration (for Options A & B)

---

## Conclusion

The current implementation has significant cost optimization opportunities. The most impactful changes are:

1. **Lazy screenshot capture** - Eliminates unnecessary vision token costs
2. **Conversation history truncation** - Prevents exponential cost growth
3. **Context caching** - Reduces redundant API calls
4. **Model routing** - Uses appropriate model for task complexity

Implementing Phase 1 optimizations alone can reduce costs by **60%**, making the service more sustainable while maintaining functionality. Phase 2 and 3 optimizations can bring total savings to **80-90%**.

## Business Model Impact

### Cost Optimization Priority by Business Model

**Option A (Pay-Per-Usage)**: 
- **CRITICAL** - Cost optimization directly impacts user costs and business margins
- Users pay for actual usage, so optimizations reduce their bills
- Must optimize aggressively to remain competitive

**Option B (Monthly Subscription)**:
- **HIGH** - Cost optimization improves profit margins
- More efficient token usage = more value per subscription
- Optimizations allow higher token limits or lower prices

**Option C (One-Time Purchase)**:
- **MEDIUM** - Users pay their own API costs
- Still important for user satisfaction and experience
- Less critical for business margins

**Conclusion**: Cost optimization is essential for Options A and B where the business pays API costs. For Option C, it's still valuable for user experience but less critical for business sustainability.

### Implementation Requirements by Business Model

**All Options Require**:
- Usage tracking (for billing/limits)
- Token counting (internal tracking)
- Model restrictions for free tier

**Options A & B Require**:
- Remove API key settings UI
- Add user authentication
- Add payment processing
- Add limit enforcement
- Add notification system

**Option C Requires**:
- Keep API key management
- Add license key system
- Add license validation

