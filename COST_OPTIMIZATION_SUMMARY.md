# Cost Optimization Summary

## Current State Analysis

### Cost Drivers Identified

1. **Screenshots** (~2,000 tokens each)
   - Captured on every context request
   - Even when not needed for non-vision models
   - **Impact**: High

2. **Full Conversation History** (~10,000-20,000 tokens)
   - All messages sent with every request
   - No truncation or summarization
   - **Impact**: Very High

3. **Multiple API Calls** (2-10 per interaction)
   - Initial call + follow-up after tools
   - Each with full context
   - **Impact**: High

4. **No Model Routing**
   - Expensive models used for simple tasks
   - No tiered model selection
   - **Impact**: Very High

5. **No Cost Tracking**
   - No visibility into spending
   - No budget limits
   - **Impact**: Medium

### Current Cost Per Interaction

| Model | Cost Per Interaction | 30-min Session | Daily (100 users) |
|-------|---------------------|----------------|-------------------|
| GPT-5 | $0.10-$0.50 | $2.30-$5.75 | $230-$575 |
| Claude Opus | $0.05-$0.25 | $1.14-$2.85 | $114-$285 |

---

## Optimization Opportunities

### Priority 1: Quick Wins (60% savings)

1. **Lazy Screenshot Capture**
   - Only capture when explicitly needed
   - **Savings**: ~2,000 tokens per interaction

2. **Conversation History Truncation**
   - Keep last 20 messages only
   - **Savings**: ~10,000-15,000 tokens

3. **Context Caching**
   - Cache browser context for 5 seconds
   - **Savings**: ~2,500 tokens per interaction

**Total Phase 1 Savings**: ~60% cost reduction

### Priority 2: Model Optimization (80% savings)

4. **Token Counting & Tracking**
   - Track tokens and costs
   - **Benefit**: Visibility + control

5. **Model Routing**
   - Route simple tasks to cheap models
   - Route complex tasks to expensive models
   - **Savings**: 50-98% for simple tasks

**Total Phase 2 Savings**: ~80% cost reduction

### Priority 3: Advanced (90% savings)

6. **Screenshot Optimization**
   - Lower resolution/quality
   - **Savings**: ~600-1,000 tokens

7. **Request Deduplication**
   - Cache recent requests
   - **Savings**: Eliminates redundant calls

**Total Phase 3 Savings**: ~90% cost reduction

---

## Expected Results

### After All Optimizations

| Model | Cost Per Interaction | 30-min Session | Daily (100 users) |
|-------|---------------------|----------------|-------------------|
| GPT-5 | $0.01-$0.05 | $0.23-$0.69 | $23-$69 |
| Claude Opus | $0.006-$0.011 | $0.11-$0.34 | $11-$34 |

**Total Savings**: ~90% reduction

---

## Implementation Priority

### Week 1: Phase 1 (Quick Wins)
- Lazy screenshot capture
- Conversation truncation
- Context caching
- **Expected**: 60% cost reduction

### Week 2: Phase 2 (Model Optimization)
- Token counting
- Model routing
- Budget limits
- **Expected**: 80% total reduction

### Week 3-4: Phase 3 (Advanced)
- Screenshot optimization
- Request deduplication
- **Expected**: 90% total reduction

---

## Key Files to Modify

1. `src/renderer/stores/chatStore.ts` - Main chat logic
2. `src/main/ipc/browser.ts` - Browser context handler
3. `src/main/llm/router.ts` - LLM routing
4. `src/main/llm/cost-tracker.ts` - **NEW** - Token counting
5. `src/main/llm/model-router.ts` - **NEW** - Model selection

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model routing errors | Medium | Logging + override option |
| Cache staleness | Low | Short TTL + force refresh |
| History truncation | Low | Keep recent + system prompt |
| Quality degradation | Low | Configurable parameters |

---

## Success Metrics

- ✅ **Cost Reduction**: 60%+ (Phase 1), 80%+ (Phase 2), 90%+ (Phase 3)
- ✅ **API Calls**: Reduce from 3-10 to 2 per interaction
- ✅ **Tokens**: Reduce from 10,000-50,000 to 1,000-5,000 per interaction
- ✅ **User Experience**: No degradation
- ✅ **Functionality**: Feature parity maintained

---

## Next Steps

1. **Review** this audit with the team
2. **Prioritize** optimizations based on business needs
3. **Implement** Phase 1 optimizations (1-2 days)
4. **Monitor** cost reduction and user experience
5. **Iterate** on Phase 2 and 3 based on results

---

## Business Model Decisions

### Business Model Options
1. **Option A**: Pay-per-usage with credit card + custom limits
   - Users set spending limit
   - Notifications at 80%, 90%, 95%
   - Auto-reload option
   - **Remove API key settings**

2. **Option B**: Monthly subscription with token limits
   - Fixed monthly fee
   - Token limit per month
   - Account inactive when limit reached
   - No rollover
   - **Remove API key settings**

3. **Option C**: One-time purchase desktop app
   - One-time payment
   - Users bring own API keys
   - Lifetime access
   - **Keep API key settings**

### Free Tier
- Limited to Gemini 2.5 latest or cheap models
- Time/usage limits (TBD)
- Model restrictions enforced

### Cost Transparency
- **NO** - Do not show costs to users
- Track internally only
- Show abstract usage indicators (e.g., "50% of limit used")

### Premium Features
- **Undecided** - TBD

## Implementation Impact

### Options A & B Require:
- User authentication system
- Payment processing (Stripe/Paddle)
- Usage tracking system
- Limit enforcement
- Notification system
- **Remove API key settings UI**

### Option C Requires:
- License key system
- License validation
- **Keep API key management**

### All Options Require:
- Usage tracking (for billing/limits)
- Token counting (internal)
- Free tier restrictions
- Model routing (for cost optimization)

---

## Additional Resources

- **Detailed Audit**: See `COST_OPTIMIZATION_AUDIT.md`
- **Implementation Guide**: See `COST_OPTIMIZATION_IMPLEMENTATION_GUIDE.md`
- **Business Model Architecture**: See `BUSINESS_MODEL_ARCHITECTURE.md`
- **Usage Tracking Requirements**: See `USAGE_TRACKING_REQUIREMENTS.md`
- **Code Locations**: See implementation guide for specific file locations

