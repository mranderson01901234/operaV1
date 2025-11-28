# Summarization Feature Test Guide

**Date:** 2025-01-27  
**Status:** ✅ Ready for Testing

---

## Pre-Testing Checklist

- [x] Code compiles successfully (`npm run build`)
- [x] No linting errors
- [x] All imports resolved correctly
- [x] Tool definitions added to `tools.ts`
- [x] Execution functions implemented in `tool-executor.ts`
- [x] Content extraction service created
- [x] Summarization service created
- [x] Types updated

---

## Manual Testing Steps

### Test 1: Basic Page Summarization

**Steps:**
1. Start the application: `npm run dev`
2. Navigate to a content-rich page (e.g., Wikipedia article, news article)
3. In the chat, type: **"Summarize this page"**
4. Verify the LLM calls the `summarize` tool
5. Check that a summary is returned

**Expected Result:**
- Tool call: `summarize({ length: 'medium' })`
- Returns: Structured summary with metadata
- Summary should be 1-2 paragraphs (medium length)

**Test URLs:**
- https://en.wikipedia.org/wiki/Artificial_intelligence
- https://www.bbc.com/news (any article)
- Any long-form article

---

### Test 2: Brief Summary

**Steps:**
1. Navigate to a long article
2. Type: **"Give me a brief summary"**
3. Verify `summarize({ length: 'brief' })` is called

**Expected Result:**
- Summary should be 2-3 sentences
- Quick, concise overview

---

### Test 3: Detailed Summary

**Steps:**
1. Navigate to a complex article
2. Type: **"Give me a detailed summary of this page"**
3. Verify `summarize({ length: 'detailed' })` is called

**Expected Result:**
- Summary should be 3-5 paragraphs
- More comprehensive coverage

---

### Test 4: Key Points Extraction

**Steps:**
1. Navigate to an article with multiple points
2. Type: **"What are the main points on this page?"**
3. Verify `extractKeyPoints()` is called

**Expected Result:**
- Returns numbered list of key points
- Default: 10 points (or fewer if content is shorter)
- Each point should be concise but informative

---

### Test 5: Custom Key Points Count

**Steps:**
1. Navigate to a long article
2. Type: **"Extract the top 5 key points"**
3. Verify `extractKeyPoints({ maxPoints: 5 })` is called

**Expected Result:**
- Returns exactly 5 key points (or fewer if content is shorter)

---

### Test 6: Section Summarization

**Steps:**
1. Navigate to an article with clear sections/headings
2. Type: **"Summarize the introduction section"**
3. Verify `summarizeSection({ sectionName: 'introduction' })` is called

**Expected Result:**
- Finds section by matching heading text
- Returns summary of that specific section only
- Should not include content from other sections

**Test URLs:**
- Wikipedia articles (have clear sections)
- Technical documentation
- Long-form articles with headings

---

### Test 7: Element-Specific Summarization

**Steps:**
1. Navigate to a page with an `<article>` element
2. Type: **"Summarize the article content"**
3. Verify `summarize({ selector: 'article' })` is called

**Expected Result:**
- Extracts content only from the article element
- Ignores navigation, sidebar, footer
- Returns summary of article content only

---

### Test 8: Focused Summary

**Steps:**
1. Navigate to a technical article
2. Type: **"Summarize the technical details"**
3. Verify `summarize({ focus: 'technical details' })` is called

**Expected Result:**
- Summary focuses on technical aspects
- Less emphasis on general overview

---

### Test 9: Error Handling - Empty Page

**Steps:**
1. Navigate to a blank page or page with minimal content
2. Type: **"Summarize this page"**
3. Verify error handling

**Expected Result:**
- Returns error: "Not enough content to summarize"
- Graceful failure

---

### Test 10: Error Handling - Non-existent Section

**Steps:**
1. Navigate to any page
2. Type: **"Summarize the nonexistent section"**
3. Verify error handling

**Expected Result:**
- Returns error: "Section 'nonexistent' not found"
- Suggests checking page headings

---

## Automated Test Scenarios

### Unit Test: Content Extraction

```typescript
// Test content extraction
const content = await extractPageContent()
expect(content.title).toBeDefined()
expect(content.text.length).toBeGreaterThan(0)
expect(content.metadata.wordCount).toBeGreaterThan(0)
```

### Unit Test: Summarization Service

```typescript
// Test summarization
const summary = await summarizeContent({
  content: "Long article text here...",
  type: 'summary',
  length: 'medium'
})
expect(summary).toBeDefined()
expect(typeof summary).toBe('string')
expect(summary.length).toBeGreaterThan(50)
```

### Integration Test: Tool Execution

```typescript
// Test tool execution
const result = await executeBrowserTool({
  name: 'summarize',
  arguments: { length: 'brief' }
})
expect(result.success).toBe(true)
expect(result.result.summary).toBeDefined()
```

---

## Performance Testing

### Test Content Length Limits

1. **Small Content** (< 1000 chars)
   - Should summarize quickly
   - Should return appropriate summary

2. **Medium Content** (1000-10000 chars)
   - Should summarize in 1-3 seconds
   - Should handle efficiently

3. **Large Content** (> 50000 chars)
   - Should truncate to 50k chars
   - Should indicate truncation in summary
   - Should complete in reasonable time

### Test Token Usage

Monitor token usage:
- Input tokens: Should be ~12.5k max (50k chars)
- Output tokens: Should be 250-1000 (depending on length)
- Total cost: ~$0.01-0.02 per summary

---

## Edge Cases to Test

1. **Very Long Pages**
   - Test truncation works correctly
   - Verify summary still makes sense

2. **Pages with Lots of Ads**
   - Verify noise removal works
   - Main content is extracted correctly

3. **Dynamic Content**
   - Test with SPAs (Single Page Apps)
   - Verify content extraction waits for load

4. **Non-English Content**
   - Test with foreign language pages
   - Verify summarization still works

5. **Pages with Images Only**
   - Test error handling
   - Verify graceful failure

6. **Multiple Summarization Calls**
   - Test caching (if implemented)
   - Verify performance

---

## Expected Behavior

### Tool Call Flow

1. User sends message: "Summarize this page"
2. LLM receives browser context (URL, title, accessibility tree)
3. LLM decides to call `summarize()` tool
4. Tool executor extracts page content
5. Content is sent to summarization service
6. LLM generates summary
7. Summary is returned to user

### Response Format

```json
{
  "success": true,
  "result": {
    "summary": "The page discusses...",
    "length": "medium",
    "focus": "general",
    "wordCount": 1234,
    "source": {
      "title": "Page Title",
      "url": "https://example.com"
    }
  }
}
```

---

## Debugging Tips

### Check Console Logs

Look for:
- `[Summarization]` logs
- Content extraction logs
- LLM call logs
- Error messages

### Verify Tool Registration

Check that tools are registered:
```typescript
// In tools.ts
console.log(BROWSER_TOOLS.find(t => t.name === 'summarize'))
```

### Verify Content Extraction

Test content extraction directly:
```typescript
// In browser console or test
const content = await extractPageContent()
console.log('Extracted:', content)
```

### Verify LLM Call

Check summarization service:
```typescript
const summary = await summarizeContent({
  content: "Test content...",
  type: 'summary',
  length: 'brief'
})
console.log('Summary:', summary)
```

---

## Success Criteria

✅ **All tests pass**
- Basic summarization works
- Key points extraction works
- Section summarization works
- Error handling works

✅ **Performance acceptable**
- Summarization completes in < 5 seconds
- Token usage is reasonable
- No memory leaks

✅ **User experience good**
- Summaries are accurate
- Key points are useful
- Error messages are helpful

---

## Known Limitations

1. **Language**: Currently optimized for English
2. **Content Types**: Works best with text-heavy pages
3. **Dynamic Content**: May need page to fully load
4. **Cost**: Uses GPT-4o-mini (cost-effective but not free)

---

## Next Steps After Testing

1. **Fix any bugs** found during testing
2. **Optimize performance** if needed
3. **Add caching** for repeated summaries
4. **Improve error messages** based on user feedback
5. **Add more summary types** (TL;DR, executive summary, etc.)

---

**Test Status**: Ready for manual testing  
**Build Status**: ✅ Successful  
**Code Quality**: ✅ No linting errors

