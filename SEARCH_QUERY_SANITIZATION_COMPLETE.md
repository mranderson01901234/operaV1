# Search Query Sanitization - COMPLETE ✅

**Date:** 2025-01-27  
**Status:** Completed

---

## Problem Solved

The LLM was injecting years (e.g., "2024") into search queries based on its training data cutoff, causing Google to return outdated articles with stale pricing and model information.

**Example:**
- **Before:** "OpenAI vs Anthropic comparison pros cons 2024 LLM provider"
- **After:** "openai vs anthropic comparison" (with recency filter)

---

## Changes Made

### 1. Search Query Sanitization Utility (`src/main/browser/search-utils.ts`) - NEW FILE

**Features:**
- Removes year references (2023, 2024, 2025, etc.)
- Removes stale knowledge patterns ("latest as of", "current in 2024", etc.)
- Removes filler words (comprehensive, detailed, complete, etc.)
- Detects queries that need recency (pricing, comparisons, news)
- Adds Google time filters for recent results when needed

**Key Functions:**
- `sanitizeSearchQuery()` - Removes years and filler words
- `queryNeedsRecency()` - Detects if query needs recent results
- `enhanceQueryForRecency()` - Adds time filters
- `prepareSearchQuery()` - Full pipeline: sanitize + enhance

### 2. Updated Cloud Preprocessor Prompt (`src/main/llm/cloud-preprocessor.ts`)

**Changes:**
- Added explicit rules to NEVER include years in queries
- Added examples showing correct vs incorrect query generation
- Added instruction to keep queries short (3-8 words)
- Added instruction to remove filler words
- Added post-processing sanitization as safety net

**Prompt Updates:**
```
CRITICAL RULES FOR QUERY GENERATION:

1. NEVER include years (2023, 2024, 2025, etc.) in your queries
2. NEVER add context from your training data
3. Keep queries SHORT (3-8 words)
4. DO NOT include filler words
5. Let Google's recency algorithms work
```

### 3. Updated Search URL Builder (`src/main/llm/search-helpers.ts`)

**Changes:**
- `buildSearchUrl()` now automatically sanitizes queries
- Adds Google time filters (`tbs=qdr:m`) for queries needing recency
- Logs when queries are modified

**Example:**
```typescript
buildSearchUrl("OpenAI vs Anthropic 2024 comprehensive comparison")
// Returns: "https://www.google.com/search?q=openai+vs+anthropic+comparison&tbs=qdr:m"
```

### 4. Search Query Logger (`src/main/browser/search-logger.ts`) - NEW FILE

**Features:**
- Tracks query transformations
- Logs user request → LLM generated → sanitized → final
- Maintains history of last 100 queries
- Provides statistics on query modifications

---

## Integration Points

### Where Sanitization Happens

1. **Cloud Preprocessor** (`cloud-preprocessor.ts:210`)
   - Sanitizes query after LLM generates it
   - First line of defense

2. **Search URL Builder** (`search-helpers.ts:buildSearchUrl`)
   - Sanitizes query when building URL
   - Safety net for any queries that bypass cloud preprocessor

3. **Future: Main LLM Tool Calls**
   - If LLM generates search queries via tools, they'll be sanitized at URL build time

---

## Expected Impact

### Before
- Query: "OpenAI vs Anthropic comparison pros cons 2024 LLM provider"
- Results: Articles from late 2024 with Claude 3.5, old pricing
- Accuracy: Low (outdated information)

### After
- Query: "openai vs anthropic comparison"
- Search params: `tbs=qdr:m` (past month filter)
- Results: Recent articles with current model names and pricing
- Accuracy: High (current information)

**Quality Improvement:** Significant accuracy improvement in pricing data and model version references.

---

## Testing Checklist

### Manual Test Cases

| User Input | Expected Search Query | Should NOT Contain |
|------------|----------------------|-------------------|
| "Compare OpenAI vs Anthropic" | "openai vs anthropic comparison" | 2024, 2023, comprehensive |
| "What's Claude's pricing?" | "anthropic claude pricing" | 2024, latest, current |
| "Best LLM for coding in 2024" | "best llm coding" | 2024 |
| "GPT-4 vs Claude 3.5 Sonnet" | "gpt-4 vs claude" | 3.5, 2024 |
| "Latest Anthropic news" | "anthropic news" | 2024, latest |

### Verification

- [ ] Years (2023, 2024, 2025) no longer appear in search queries
- [ ] Filler words stripped from queries
- [ ] Queries are shorter and cleaner
- [ ] Search results show more recent articles
- [ ] Pricing information in outputs is more accurate
- [ ] Model names in outputs reflect current versions
- [ ] Logging shows query transformations for debugging
- [ ] No regression in search relevance

---

## Files Modified

1. ✅ `src/main/browser/search-utils.ts` - NEW - Sanitization utilities
2. ✅ `src/main/browser/search-logger.ts` - NEW - Query logging
3. ✅ `src/main/llm/cloud-preprocessor.ts` - Updated prompt + sanitization
4. ✅ `src/main/llm/search-helpers.ts` - Updated buildSearchUrl
5. ✅ `src/renderer/stores/chatStore.ts` - Updated comment (no functional change)

---

## Rollback Plan

If issues arise, disable sanitization by wrapping in feature flag:

```typescript
// In search-utils.ts
const ENABLE_QUERY_SANITIZATION = true

export function sanitizeSearchQuery(query: string): string {
  if (!ENABLE_QUERY_SANITIZATION) {
    return query
  }
  // ... rest of function
}
```

---

## Notes

- Sanitization happens in two places for safety (cloud preprocessor + URL builder)
- Recency filters are automatically applied for pricing/comparison queries
- Query logging helps debug any issues
- Can be extended to track more patterns if needed

