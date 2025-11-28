# Usage Tracking Requirements

## Overview

This document outlines the usage tracking requirements for billing and limit enforcement across all business model options.

---

## Business Model Requirements

### Option A: Pay-Per-Usage
**Required Tracking**:
- Real-time token counting per request
- Cost calculation per request
- Cumulative spending per user
- Spending limit checking
- Notification triggers (80%, 90%, 95%)
- Auto-reload processing

### Option B: Monthly Subscription
**Required Tracking**:
- Token usage per request
- Cumulative tokens used per subscription period
- Token limit checking
- Account status management (active/inactive)
- Billing cycle tracking

### Option C: One-Time Purchase
**Required Tracking**:
- Minimal tracking (for analytics only)
- No billing/limit enforcement needed
- Users manage their own API costs

### Free Tier (All Options)
**Required Tracking**:
- Token usage per free user
- Time limit tracking
- Usage limit tracking
- Model restriction enforcement

---

## Usage Tracking Architecture

### Core Components

#### 1. Token Counter
**Purpose**: Count tokens for each API request

**Location**: `src/main/llm/cost-tracker.ts`

**Functions**:
- `estimateTokens(text: string): number` - Estimate tokens from text
- `countImageTokens(base64Image: string): number` - Count tokens for images
- `countRequestTokens(params: ChatParams): number` - Count total input tokens

**Usage**:
```typescript
const inputTokens = countRequestTokens(chatParams)
const outputTokens = estimateTokens(responseContent)
const totalTokens = inputTokens + outputTokens
```

#### 2. Usage Tracker
**Purpose**: Track usage per user for billing/limits

**Location**: `src/main/billing/usage-tracker.ts` (NEW)

**Functions**:
- `trackUsage(userId: string, usage: UsageRecord): Promise<void>`
- `getUserUsage(userId: string, period?: Period): Promise<UsageSummary>`
- `checkLimit(userId: string): Promise<LimitStatus>`
- `resetUsage(userId: string, period: Period): Promise<void>`

**Usage**:
```typescript
// Track usage
await usageTracker.trackUsage(userId, {
  tokens: totalTokens,
  cost: estimatedCost,
  model: params.model,
  timestamp: Date.now(),
})

// Check limit
const limitStatus = await usageTracker.checkLimit(userId)
if (limitStatus.exceeded) {
  // Block request or trigger notification
}
```

#### 3. Limit Enforcer
**Purpose**: Enforce spending/token limits

**Location**: `src/main/billing/limit-enforcer.ts` (NEW)

**Functions**:
- `checkSpendingLimit(userId: string): Promise<boolean>` - Check if under limit
- `checkTokenLimit(userId: string): Promise<boolean>` - Check if under token limit
- `enforceLimit(userId: string): Promise<void>` - Block user if limit exceeded
- `getLimitStatus(userId: string): Promise<LimitStatus>` - Get current limit status

**Usage**:
```typescript
// Before API call
const canProceed = await limitEnforcer.checkSpendingLimit(userId)
if (!canProceed) {
  throw new Error('Spending limit reached')
}

// After API call
await limitEnforcer.enforceLimit(userId)
```

#### 4. Notification Manager
**Purpose**: Send limit warnings and notifications

**Location**: `src/main/billing/notifications.ts` (NEW)

**Functions**:
- `checkNotificationThresholds(userId: string): Promise<void>` - Check if notifications needed
- `sendLimitWarning(userId: string, percentage: number): Promise<void>` - Send warning
- `sendLimitReached(userId: string): Promise<void>` - Send limit reached notification
- `sendAutoReloadConfirmation(userId: string): Promise<void>` - Send auto-reload confirmation

**Usage**:
```typescript
// After tracking usage
await notificationManager.checkNotificationThresholds(userId)
// Automatically sends notifications at 80%, 90%, 95%
```

---

## Database Schema

### Usage Records Table
```sql
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tokensUsed INTEGER NOT NULL,
  cost REAL NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  requestId TEXT, -- For debugging/tracking
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE INDEX idx_usage_user_timestamp ON usage_records(userId, timestamp);
CREATE INDEX idx_usage_user_period ON usage_records(userId, timestamp);
```

### Spending Limits Table (Option A)
```sql
CREATE TABLE spending_limits (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  limitAmount REAL NOT NULL,
  currentSpend REAL DEFAULT 0,
  periodStart INTEGER NOT NULL,
  periodEnd INTEGER,
  autoReload BOOLEAN DEFAULT FALSE,
  reloadAmount REAL,
  notificationThresholds TEXT, -- JSON: [80, 90, 95]
  lastNotificationPercentage INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

### Token Limits Table (Option B)
```sql
CREATE TABLE token_limits (
  id TEXT PRIMARY KEY,
  subscriptionId TEXT UNIQUE NOT NULL,
  tokenLimit INTEGER NOT NULL,
  tokensUsed INTEGER DEFAULT 0,
  periodStart INTEGER NOT NULL,
  periodEnd INTEGER NOT NULL,
  FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id)
);
```

### Free Tier Limits Table
```sql
CREATE TABLE free_tier_limits (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  tokensUsed INTEGER DEFAULT 0,
  tokenLimit INTEGER NOT NULL, -- e.g., 10,000 tokens
  timeLimitStart INTEGER,
  timeLimitEnd INTEGER, -- e.g., 7 days from start
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## Implementation Flow

### Request Flow with Usage Tracking

```
User Request
  ↓
1. Check User Tier (free/paid)
  ↓
2. Check Limits (spending/tokens)
  ↓
3. If limit exceeded → Block request
  ↓
4. Execute API call
  ↓
5. Count tokens (input + output)
  ↓
6. Calculate cost
  ↓
7. Track usage in database
  ↓
8. Update limit counters
  ↓
9. Check notification thresholds
  ↓
10. Send notifications if needed
  ↓
11. Return response to user
```

### Limit Checking Flow

```
Before API Call:
  ↓
Get user's current usage
  ↓
Check if under limit
  ↓
If Option A: Check spending limit
If Option B: Check token limit
If Free Tier: Check both time and token limits
  ↓
If exceeded:
  - Block request
  - Return error to user
  - Trigger notification (if not already sent)
  ↓
If under limit:
  - Allow request
  - Continue to API call
```

---

## Integration Points

### 1. LLM Router Integration
**File**: `src/main/llm/router.ts`

**Changes**:
```typescript
async *chat(providerId: string, params: ChatParams & { userId?: string }): AsyncIterable<ChatChunk> {
  // Check limits before API call
  if (params.userId) {
    const canProceed = await limitEnforcer.checkLimit(params.userId)
    if (!canProceed) {
      yield {
        done: true,
        error: 'Usage limit reached. Please upgrade or wait for next billing cycle.',
      }
      return
    }
  }
  
  // Count input tokens
  const inputTokens = countRequestTokens(params)
  
  // Execute API call
  let outputTokens = 0
  for await (const chunk of provider.chat(params)) {
    if (chunk.content) {
      outputTokens += estimateTokens(chunk.content)
    }
    yield chunk
  }
  
  // Track usage after request
  if (params.userId) {
    const cost = estimateCost(params.model, inputTokens, outputTokens)
    await usageTracker.trackUsage(params.userId, {
      tokens: inputTokens + outputTokens,
      cost,
      model: params.model,
      provider: providerId,
    })
    
    // Check notification thresholds
    await notificationManager.checkNotificationThresholds(params.userId)
  }
}
```

### 2. Chat Store Integration
**File**: `src/renderer/stores/chatStore.ts`

**Changes**:
```typescript
sendMessage: async (content: string, agentId: string, params: { 
  provider: string
  model: string
  systemPrompt?: string
  userId?: string  // ADD THIS
}) => {
  // ... existing code ...
  
  const chatParams: ChatParams & { provider: string; userId?: string } = {
    provider: params.provider,
    model: params.model,
    userId: params.userId,  // ADD THIS
    // ... rest of params
  }
  
  // ... rest of code ...
}
```

### 3. Free Tier Enforcement
**File**: `src/main/llm/model-router.ts`

**Changes**:
```typescript
export function selectModelForTask(
  provider: string,
  complexity: 'simple' | 'medium' | 'complex',
  userTier: 'free' | 'paid',  // ADD THIS
  userSelectedModel?: string
): string {
  // Free tier restrictions
  if (userTier === 'free') {
    // Only allow cheap models
    if (provider === 'openai') {
      return 'gpt-4o-mini'
    }
    if (provider === 'anthropic') {
      return 'claude-3-5-haiku-20241022'
    }
    if (provider === 'gemini') {
      return 'gemini-2.5-latest'
    }
  }
  
  // Paid tier: use routing logic
  // ... existing routing logic ...
}
```

---

## Notification Thresholds

### Option A: Pay-Per-Usage
- **80%**: "You've used 80% of your spending limit"
- **90%**: "You've used 90% of your spending limit"
- **95%**: "You've used 95% of your spending limit. Auto-reload will trigger at 100%"
- **100%**: "Spending limit reached. Service paused" OR "Auto-reload triggered"

### Option B: Monthly Subscription
- **80%**: "You've used 80% of your monthly token limit"
- **90%**: "You've used 90% of your monthly token limit"
- **95%**: "You've used 95% of your monthly token limit"
- **100%**: "Token limit reached. Account inactive until next billing cycle"

### Free Tier
- **50%**: "You've used 50% of your free trial tokens"
- **80%**: "You've used 80% of your free trial tokens"
- **90%**: "You've used 90% of your free trial tokens"
- **100%**: "Free trial limit reached. Upgrade to continue"

---

## Testing Requirements

### Unit Tests
- [ ] Token counting accuracy
- [ ] Cost calculation accuracy
- [ ] Limit checking logic
- [ ] Notification threshold triggers
- [ ] Usage tracking persistence

### Integration Tests
- [ ] End-to-end usage tracking flow
- [ ] Limit enforcement blocking
- [ ] Notification sending
- [ ] Auto-reload processing (Option A)
- [ ] Billing cycle reset (Option B)

### Edge Cases
- [ ] Concurrent requests (race conditions)
- [ ] Database failures
- [ ] Notification failures
- [ ] Limit boundary conditions
- [ ] Free tier expiration

---

## Performance Considerations

### Optimization Strategies
1. **Batch Usage Updates**: Don't write to DB on every request
2. **Caching**: Cache limit status for 1-2 seconds
3. **Async Processing**: Process notifications asynchronously
4. **Database Indexing**: Index on userId + timestamp
5. **Rate Limiting**: Prevent abuse

### Monitoring
- Track usage tracking latency
- Monitor database write performance
- Alert on tracking failures
- Track notification delivery rates

---

## Security Considerations

1. **User Isolation**: Ensure users can only see their own usage
2. **Limit Bypass Prevention**: Server-side enforcement only
3. **Cost Calculation**: Server-side only, never trust client
4. **API Key Security**: Secure storage (if Option C)
5. **Payment Data**: PCI compliance (if Options A & B)

---

## Migration Strategy

### Existing Users (if any)
1. **Option A/B**: Migrate to Option A**: Migrate to new tracking system
2. **Option C to Option A/B**: Remove API keys, add billing
3. **Free Tier**: Track separately, enforce limits

### Data Migration
- Migrate existing usage data (if any)
- Set initial limits for existing users
- Preserve historical data for analytics

---

## Next Steps

1. **Choose Business Model**: A, B, or C
2. **Implement Core Tracking**: Token counting + usage tracking
3. **Implement Limit Enforcement**: Based on chosen model
4. **Implement Notifications**: Threshold-based alerts
5. **Add Free Tier**: Restrictions + limits
6. **Testing**: Comprehensive test suite
7. **Monitoring**: Set up alerts and dashboards




