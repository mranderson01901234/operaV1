# Additional Cost Optimization Opportunities

## Phase 3: Advanced Optimizations (Target: 90% Total Reduction)

### ✅ 1. Screenshot Resolution/Quality Optimization
**Priority**: HIGH  
**Impact**: ~30-50% token reduction for vision (~600-1,000 tokens per screenshot)

**Current**: Full-resolution PNG screenshots (~1500-2500 tokens)
**Optimization**: 
- Reduce resolution (e.g., 75% scale)
- Use JPEG with lower quality (60% instead of 80%)
- Only full resolution when explicitly needed

**Implementation**:
- Add `scale` parameter to `captureScreenshot()`
- Default to 0.75 scale for cost optimization
- Allow full resolution when needed

**Savings**: ~600-1,000 tokens per screenshot

---

### ✅ 2. Max Tokens Optimization
**Priority**: MEDIUM  
**Impact**: Prevents over-generation, reduces output costs

**Current**: Default `maxTokens = 4096` for all requests
**Optimization**:
- Simple tasks: 512-1024 tokens
- Medium tasks: 2048 tokens
- Complex tasks: 4096 tokens

**Implementation**:
- Route max tokens based on task complexity
- Reduce for simple tasks (less output = less cost)

**Savings**: ~20-30% output token reduction for simple tasks

---

### ✅ 3. System Prompt Optimization
**Priority**: MEDIUM  
**Impact**: ~200-400 tokens per request

**Current**: Long system prompt with detailed instructions
**Optimization**:
- Make prompts more concise
- Remove redundant information
- Use shorter tool descriptions

**Implementation**:
- Compress `BROWSER_AGENT_SYSTEM_PROMPT`
- Shorter tool descriptions in `tools.ts`

**Savings**: ~200-400 tokens per request

---

### ✅ 4. Accessibility Tree Optimization
**Priority**: MEDIUM  
**Impact**: ~200-400 tokens per request

**Current**: 30 elements, verbose format
**Optimization**:
- Reduce to 20 elements for initial context
- More compact format
- Only include visible elements (viewport)

**Implementation**:
- Change `maxElements` default from 30 to 20
- Compress tree format (shorter strings)

**Savings**: ~200-400 tokens per request

---

### ✅ 5. Tool Call Batching Optimization
**Priority**: LOW  
**Impact**: Reduces API calls (but tools already execute sequentially)

**Current**: Tools execute sequentially, each triggers follow-up API call
**Optimization**:
- Batch multiple tool calls before follow-up
- Single follow-up with all results

**Note**: Already partially optimized - tools execute before follow-up. Could optimize further by batching tool execution.

**Savings**: Minimal (already optimized)

---

### ✅ 6. Request Deduplication
**Priority**: LOW  
**Impact**: Eliminates redundant identical requests

**Current**: No caching of requests
**Optimization**:
- Cache recent requests/responses
- Return cached response if identical

**Implementation**:
- Create request cache with hash
- Check cache before API call
- TTL: 1 minute

**Savings**: Eliminates redundant calls (varies)

---

### ✅ 7. Message Content Compression
**Priority**: LOW  
**Impact**: ~10-20% token reduction

**Current**: Full message content sent
**Optimization**:
- Remove redundant context from messages
- Compress tool results
- Remove duplicate information

**Implementation**:
- Clean message content before sending
- Remove redundant context

**Savings**: ~10-20% token reduction

---

### ✅ 8. Tool Description Optimization
**Priority**: LOW  
**Impact**: ~50-100 tokens per request

**Current**: Verbose tool descriptions
**Optimization**:
- Shorter, more concise descriptions
- Remove redundant information

**Implementation**:
- Update tool descriptions in `tools.ts`
- Keep essential info only

**Savings**: ~50-100 tokens per request

---

## Quick Wins (Easy to Implement)

### 1. Screenshot Resolution (HIGH PRIORITY)
- **Effort**: 30 minutes
- **Savings**: ~600-1,000 tokens per screenshot
- **Impact**: High for vision models

### 2. Max Tokens Routing (MEDIUM PRIORITY)
- **Effort**: 1 hour
- **Savings**: ~20-30% output tokens
- **Impact**: Medium

### 3. System Prompt Compression (MEDIUM PRIORITY)
- **Effort**: 1 hour
- **Savings**: ~200-400 tokens
- **Impact**: Medium

### 4. Accessibility Tree Reduction (MEDIUM PRIORITY)
- **Effort**: 15 minutes
- **Savings**: ~200-400 tokens
- **Impact**: Medium

---

## Implementation Priority

### Week 1: High-Impact Quick Wins
1. ✅ Screenshot resolution optimization
2. ✅ Max tokens routing
3. ✅ System prompt compression
4. ✅ Accessibility tree reduction

**Expected**: Additional 10-15% cost reduction (90% total)

### Week 2: Advanced Optimizations
1. ✅ Request deduplication
2. ✅ Message compression
3. ✅ Tool description optimization

**Expected**: Additional 5-10% cost reduction (95% total)

---

## Estimated Total Savings

### Current (After Phase 1 & 2)
- **Per interaction**: $0.02-$0.10 (80% reduction)

### After Phase 3 Quick Wins
- **Per interaction**: $0.01-$0.05 (90% reduction)

### After All Optimizations
- **Per interaction**: $0.005-$0.025 (95% reduction)

---

## Cost Breakdown by Optimization

| Optimization | Tokens Saved | Cost Saved (GPT-5) | Priority |
|-------------|--------------|-------------------|----------|
| Screenshot Resolution | 600-1,000 | $0.006-$0.01 | HIGH |
| Max Tokens Routing | 500-1,000 | $0.005-$0.01 | MEDIUM |
| System Prompt | 200-400 | $0.002-$0.004 | MEDIUM |
| A11y Tree Reduction | 200-400 | $0.002-$0.004 | MEDIUM |
| Request Deduplication | Variable | Variable | LOW |
| Message Compression | 500-1,000 | $0.005-$0.01 | LOW |
| Tool Descriptions | 50-100 | $0.0005-$0.001 | LOW |

---

## Next Steps

1. **Implement screenshot optimization** (highest impact)
2. **Add max tokens routing** (easy win)
3. **Compress system prompts** (quick fix)
4. **Reduce accessibility tree** (simple change)

These optimizations will bring total savings to **~90-95%** while maintaining full functionality.




