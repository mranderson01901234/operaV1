# Deep Research Fixes - Pop-ups & JSON Parsing

## Issues Fixed

### 1. ✅ Pop-up Blocking Content Extraction

**Problem:** Pop-ups (like Forbes subscription modals, cookie notices, paywalls) were blocking content extraction, causing the research to get stuck or extract pop-up content instead of article content.

**Solution:** Added automatic pop-up detection and closing before content extraction.

**Implementation:**
- Added `closePopups()` method to `PageRetriever` class
- Called before content extraction in `fetchAndExtract()`
- Uses CDP to find and click common pop-up close buttons
- Handles:
  - Newsletter/paywall modals
  - Cookie notices
  - Subscription pop-ups
  - Generic modal overlays
  - ESC key fallback

**Selectors Handled:**
- `button[aria-label*="close"]`
- `.close-button`, `.modal-close`, `.popup-close`
- `[class*="paywall"] button`
- `[class*="newsletter"] button`
- `[id*="cookie"] button`
- `[class*="cyber-sale"] button` (Forbes-specific)
- And many more...

### 2. ✅ JSON Parsing Errors

**Problem:** LLM responses included markdown code blocks (```json ... ```) but the parser wasn't handling them correctly, causing `SyntaxError: Unexpected token '`'` or `Unexpected end of JSON input`.

**Solution:** Improved JSON extraction to handle multiple formats.

**Implementation:**
- Enhanced JSON extraction in:
  - `SourceEvaluator.extractFacts()`
  - `QueryDecomposer.decompose()`
  - `GapAnalyzer.analyze()`
- Handles:
  - Markdown code blocks: ` ```json {...} ``` `
  - Plain JSON: `{...}`
  - JSON with extra text: `Some text {..."facts":[...]} more text`
  - Multiple code block formats

**Error Handling:**
- Returns empty array instead of throwing errors
- Logs parsing errors for debugging
- Continues processing other sources even if one fails

## Files Modified

1. ✅ `src/main/research/page-retriever.ts`
   - Added `closePopups()` method
   - Called before content extraction
   - Added to both `PageRetriever` and `BrowserPageAdapter`

2. ✅ `src/main/research/source-evaluator.ts`
   - Improved JSON parsing with markdown handling
   - Added validation for parsed structure
   - Better error handling

3. ✅ `src/main/research/query-decomposer.ts`
   - Improved JSON parsing

4. ✅ `src/main/research/gap-analyzer.ts`
   - Improved JSON parsing

## Expected Behavior

### Before Fixes:
- ❌ Pop-ups block content → extracts pop-up text instead of article
- ❌ JSON parsing errors → research fails completely
- ❌ "Unexpected token '`'" errors

### After Fixes:
- ✅ Pop-ups automatically closed before extraction
- ✅ JSON parsing handles markdown code blocks
- ✅ Research continues even if some pages fail
- ✅ Better error messages for debugging

## Testing

Try deep research again with:
- "Compare OpenAI vs Anthropic for a startup"

You should see:
1. `[PageRetriever] Closed X pop-up(s)` logs when pop-ups are detected
2. No more JSON parsing errors
3. Successful fact extraction from articles (not pop-ups)
4. Research completes even if some pages fail

## Pop-up Detection Logs

When pop-ups are detected and closed, you'll see:
```
[PageRetriever] Closed 1 pop-up(s) on page
```

If no pop-ups found:
- No log (silent success)

If pop-up closing fails:
```
[PageRetriever] Failed to close pop-ups: [error]
```
(Research continues anyway)

## JSON Parsing Logs

If JSON parsing fails (should be rare now):
```
[SourceEvaluator] JSON parse failed for https://example.com: SyntaxError...
[SourceEvaluator] Attempted to parse: {...first 200 chars...}
```

Research continues with empty facts array for that source.

