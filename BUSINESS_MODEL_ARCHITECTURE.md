# Business Model Architecture

## Overview

This document outlines the business model options and their technical implementation requirements for the OperaBrowser application.

---

## Business Model Options

### Option A: Pay-Per-Usage (Credit Card + Custom Limits)

**Model**: Users add credit card, set custom spending limit, pay for what they use

**Features**:
- Credit card on file
- Custom spending limit per user
- Notifications when approaching limit (e.g., 80%, 90%, 95%)
- Auto-reload option (automatically add credits when limit reached)
- Real-time usage tracking
- Usage-based billing

**User Flow**:
1. User signs up → Adds credit card → Sets spending limit
2. User uses app → Costs accrue → Real-time tracking
3. At 80% limit → Notification sent
4. At 100% limit → Service paused OR auto-reload (if enabled)
5. Monthly billing cycle → Charge for actual usage

**Technical Requirements**:
- Payment processor integration (Stripe/Paddle)
- Usage tracking system
- Limit enforcement
- Notification system
- Auto-reload logic
- Billing/subscription management
- **NO API key management** (users don't need their own keys)

**Pros**:
- Fair pricing (pay for what you use)
- Flexible limits
- Good for occasional users

**Cons**:
- More complex billing
- Requires payment infrastructure
- Users may hit limits unexpectedly

---

### Option B: Monthly Subscription (Token Limits)

**Model**: Monthly fee with token/usage limits, account inactive when limit reached

**Features**:
- Monthly subscription fee (e.g., $29/month)
- Token/usage limit per month (e.g., 1M tokens)
- Account inactive when limit reached
- No rollover of unused tokens
- Reset at billing cycle

**User Flow**:
1. User subscribes → Monthly payment → Token limit allocated
2. User uses app → Tokens consumed → Real-time tracking
3. At limit → Account paused → Wait for next billing cycle
4. Next month → Limit resets → Account reactivated

**Technical Requirements**:
- Subscription management (Stripe/Paddle)
- Token limit tracking
- Account status management (active/inactive)
- Billing cycle management
- Limit enforcement
- **NO API key management** (users don't need their own keys)

**Pros**:
- Predictable revenue
- Simple for users
- Easy to understand

**Cons**:
- Unused tokens wasted
- May be expensive for heavy users
- Less flexible than pay-per-use

---

### Option C: One-Time Purchase (Bring Your Own API Keys)

**Model**: One-time purchase desktop app, users use their own API keys

**Features**:
- One-time purchase (e.g., $99 one-time)
- Desktop application download
- Users add their own API keys
- Lifetime access
- No usage limits (user's own API keys)

**User Flow**:
1. User purchases → One-time payment → Download app
2. User adds API keys → Uses app → Costs on their own accounts
3. No limits or billing → User manages their own API costs

**Technical Requirements**:
- Payment processing (one-time)
- License key generation/validation
- API key management (user-provided)
- License validation on startup
- **KEEP API key settings** (users manage their own keys)

**Pros**:
- Simple for users (one-time cost)
- No ongoing billing complexity
- Users control their own costs
- Good for power users

**Cons**:
- Lower recurring revenue
- Users may not understand API costs
- Support burden for API key issues

---

## Free Tier (All Options)

**Model**: Limited free trial with cheap models

**Features**:
- Free users can try app
- Limited to Gemini 2.5 latest or cheap models only
- Time/usage limits (TBD)
- Conversion to paid required for full features

**Technical Requirements**:
- User tier management (free/paid)
- Model restrictions for free users
- Usage limits for free tier
- Conversion flow

**Free Tier Limits** (TBD):
- Time limit: e.g., 7 days or 30 days
- Usage limit: e.g., 10,000 tokens total
- Model restrictions: Only Gemini 2.5 or GPT-4o-mini
- Feature restrictions: May limit browser automation features

---

## Cost Transparency

**Decision**: NO cost transparency to users

**Implementation**:
- Do NOT show token counts to users
- Do NOT show cost estimates
- Do NOT show spending breakdowns
- Track costs internally only
- Show usage in abstract terms if needed (e.g., "You've used 50% of your limit")

**Rationale**:
- Simpler UX
- Less confusion
- Focus on value, not costs

---

## Premium Features

**Status**: Undecided

**Potential Premium Features**:
- Advanced browser automation
- Custom model selection
- Higher usage limits
- Priority support
- Advanced analytics
- API access
- Custom integrations

**Implementation**: TBD based on business model choice

---

## Technical Architecture by Option

### Option A: Pay-Per-Usage

```
┌─────────────────────────────────────────┐
│         User Account System             │
├─────────────────────────────────────────┤
│ - Credit card on file                   │
│ - Custom spending limit                  │
│ - Usage tracking                         │
│ - Notification preferences               │
│ - Auto-reload settings                   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Usage Tracking System              │
├─────────────────────────────────────────┤
│ - Real-time token counting              │
│ - Cost calculation                      │
│ - Limit checking                        │
│ - Usage history                         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Payment & Billing System           │
├─────────────────────────────────────────┤
│ - Stripe/Paddle integration             │
│ - Usage-based billing                   │
│ - Invoice generation                    │
│ - Payment processing                    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Notification System                 │
├─────────────────────────────────────────┤
│ - Limit warnings (80%, 90%, 95%)         │
│ - Limit reached alerts                   │
│ - Auto-reload confirmations             │
│ - Billing notifications                  │
└─────────────────────────────────────────┘
```

**Key Components**:
- `src/main/billing/usage-tracker.ts` - Track usage per user
- `src/main/billing/limit-enforcer.ts` - Enforce spending limits
- `src/main/billing/payment-processor.ts` - Handle payments
- `src/main/billing/notifications.ts` - Send limit warnings
- `src/main/db/schema.ts` - Add billing tables

**Database Schema**:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  tier TEXT DEFAULT 'free', -- free, paid
  createdAt INTEGER
);

CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  userId TEXT,
  provider TEXT, -- stripe, paddle
  providerCustomerId TEXT,
  last4 TEXT,
  brand TEXT,
  expiresAt INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  userId TEXT,
  tokensUsed INTEGER,
  cost REAL,
  model TEXT,
  timestamp INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE spending_limits (
  id TEXT PRIMARY KEY,
  userId TEXT,
  limitAmount REAL,
  currentSpend REAL,
  periodStart INTEGER,
  periodEnd INTEGER,
  autoReload BOOLEAN DEFAULT FALSE,
  reloadAmount REAL,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

### Option B: Monthly Subscription

```
┌─────────────────────────────────────────┐
│      Subscription Management            │
├─────────────────────────────────────────┤
│ - Monthly subscription                  │
│ - Token limit allocation                │
│ - Billing cycle tracking                │
│ - Account status (active/inactive)     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Token Limit Tracking               │
├─────────────────────────────────────────┤
│ - Monthly token allocation              │
│ - Usage tracking                        │
│ - Limit enforcement                     │
│ - Reset on billing cycle                │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      Account Status Management          │
├─────────────────────────────────────────┤
│ - Active when under limit               │
│ - Inactive when limit reached           │
│ - Reactivate on billing cycle           │
│ - Status notifications                  │
└─────────────────────────────────────────┘
```

**Key Components**:
- `src/main/billing/subscription-manager.ts` - Manage subscriptions
- `src/main/billing/token-limits.ts` - Track token limits
- `src/main/billing/account-status.ts` - Manage account status
- `src/main/db/schema.ts` - Add subscription tables

**Database Schema**:
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  userId TEXT,
  planId TEXT, -- basic, pro, enterprise
  status TEXT, -- active, inactive, cancelled
  currentPeriodStart INTEGER,
  currentPeriodEnd INTEGER,
  tokenLimit INTEGER,
  tokensUsed INTEGER DEFAULT 0,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  userId TEXT,
  subscriptionId TEXT,
  tokensUsed INTEGER,
  model TEXT,
  timestamp INTEGER,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (subscriptionId) REFERENCES subscriptions(id)
);
```

---

### Option C: One-Time Purchase

```
┌─────────────────────────────────────────┐
│      License Management                 │
├─────────────────────────────────────────┤
│ - License key generation                │
│ - License validation                    │
│ - Activation tracking                   │
│ - Device binding (optional)             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      API Key Management                 │
├─────────────────────────────────────────┤
│ - User-provided API keys                │
│ - Secure storage                        │
│ - Key validation                        │
│ - Multi-provider support                │
└─────────────────────────────────────────┘
```

**Key Components**:
- `src/main/licensing/license-manager.ts` - Validate licenses
- `src/main/apiKeys.ts` - **KEEP EXISTING** - User API key management
- `src/main/db/schema.ts` - Add license tables

**Database Schema**:
```sql
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  licenseKey TEXT UNIQUE,
  userId TEXT,
  purchaseDate INTEGER,
  activatedAt INTEGER,
  deviceId TEXT, -- Optional device binding
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

---

## Implementation Considerations

### Common Components (All Options)

1. **User Authentication**
   - Email/password or OAuth
   - Session management
   - User tier detection

2. **Usage Tracking**
   - Token counting
   - Cost calculation
   - Usage history

3. **Model Restrictions**
   - Free tier: Gemini 2.5 or GPT-4o-mini only
   - Paid tier: All models

4. **Feature Gating**
   - Free tier limitations
   - Paid tier full access

### Option-Specific Components

**Option A (Pay-Per-Usage)**:
- Payment processor integration
- Spending limit management
- Auto-reload logic
- Usage-based billing

**Option B (Monthly Subscription)**:
- Subscription management
- Token limit allocation
- Account status management
- Billing cycle handling

**Option C (One-Time Purchase)**:
- License key system
- License validation
- Keep existing API key management

---

## Migration Path

### Current State → Option A/B
1. Remove API key settings UI
2. Add user authentication
3. Add payment processing
4. Add usage tracking
5. Add limit enforcement
6. Migrate existing users (if any)

### Current State → Option C
1. Add license key system
2. Add license validation
3. Keep API key management
4. Add purchase flow
5. Migrate existing users to licenses

---

## Recommendation Matrix

| Factor | Option A | Option B | Option C |
|-------|----------|----------|----------|
| **Revenue Predictability** | Low | High | Low |
| **Implementation Complexity** | High | Medium | Low |
| **User Experience** | Complex | Simple | Simple |
| **Scalability** | High | Medium | Low |
| **Support Burden** | Medium | Low | High |
| **Best For** | Power users | Casual users | Power users |

---

## Next Steps

1. **Decision**: Choose business model (A, B, or C)
2. **Payment Provider**: Select Stripe or Paddle
3. **Free Tier Limits**: Define time/usage limits
4. **Pricing**: Set pricing for each option
5. **Implementation**: Build required components
6. **Testing**: Test billing and limits
7. **Launch**: Roll out to users

---

## Questions to Answer

1. **Which business model?** (A, B, or C)
2. **Free tier limits?** (Time and usage)
3. **Pricing?** (For each option)
4. **Payment provider?** (Stripe vs Paddle)
5. **Premium features?** (What to include)
6. **Migration strategy?** (For existing users)

---

## Cost Optimization Impact

### Option A (Pay-Per-Usage)
- **Critical**: Cost optimization directly impacts user costs
- **Benefit**: Users see value in optimizations
- **Requirement**: Must optimize aggressively

### Option B (Monthly Subscription)
- **Important**: Cost optimization improves margins
- **Benefit**: More tokens available per dollar
- **Requirement**: Optimize to maximize token efficiency

### Option C (One-Time Purchase)
- **Less Critical**: Users pay their own API costs
- **Benefit**: Still improves user experience
- **Requirement**: Optimize for user satisfaction

**Conclusion**: Cost optimization is important for all options, but most critical for Options A and B where the business pays API costs.




