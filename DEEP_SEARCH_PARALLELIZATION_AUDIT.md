# Deep Search Parallelization Audit

## Current Flow Analysis

### Sequential Bottlenecks Identified

1. **Phase 2: Search** ✅ **ALREADY PARALLEL**
   - Processes 3 searches concurrently in batches
   - Status: Optimized

2. **Phase 3: Page Retrieval** ❌ **SEQUENTIAL**
   - Processes one URL at a time (`for (const url of urlsToFetch)`)
   - Each page takes ~3-5 seconds (navigation + wait + extraction)
   - **20 pages × 4 seconds = ~80 seconds sequential time**
   - Constraint: Single BrowserView (can't navigate multiple pages)

3. **Phase 4: Source Evaluation** ❌ **SEQUENTIAL**
   - Processes one content at a time (`for (const content of contents)`)
   - Each evaluation includes:
     - Authority/recency/relevance scoring (fast, synchronous)
     - LLM fact extraction (~2-5 seconds per page)
   - **20 pages × 3 seconds = ~60 seconds sequential time**
   - **NO CONSTRAINT** - Can be fully parallelized!

4. **Phase 5: Gap Analysis** ⚠️ **SINGLE LLM CALL**
   - Single LLM call analyzing all facts
   - Must wait for all evaluations to complete
   - Status: Appropriate (needs all facts)

5. **Phase 6: Follow-up Searches** ✅ **ALREADY PARALLEL**
   - Uses same parallel searcher
   - Status: Optimized

6. **Phase 7: Cross-Reference** ⚠️ **FAST SEQUENTIAL**
   - Grouping and verification logic
   - ~100-500ms total
   - Status: Acceptable (fast enough)

---

## Optimization Opportunities

### Priority 1: Parallelize Source Evaluation (HIGHEST IMPACT)

**Current**: Sequential processing
```typescript
for (const content of contents) {
  const evaluation = await this.evaluateSource(content, subQuestions)
  evaluations.push(evaluation)
}
```

**Optimized**: Parallel processing with concurrency limit
```typescript
// Process 5-10 evaluations concurrently
const batches = chunk(contents, 5)
for (const batch of batches) {
  const batchEvaluations = await Promise.all(
    batch.map(c => this.evaluateSource(c, subQuestions))
  )
  evaluations.push(...batchEvaluations)
}
```

**Expected Speedup**: 
- Current: 20 pages × 3s = 60s
- Optimized: 20 pages ÷ 5 concurrent × 3s = 12s
- **~5x faster**

**Why Safe**: 
- Each evaluation is independent
- LLM calls can be made concurrently
- No shared state

---

### Priority 2: Early Fact Validation Pipeline

**Current**: Extract all facts → Validate all facts → Cross-reference

**Optimized**: Extract → Validate immediately → Cross-reference as facts arrive

**Benefits**:
- Filter invalid facts early (save processing time)
- Can start cross-referencing as facts arrive
- Better user feedback (show progress)

**Implementation**:
```typescript
// Stream facts as they're validated
const factStream = new EventEmitter()
for (const content of contents) {
  const rawFacts = await extractFacts(content)
  const validFacts = filterValidFacts(rawFacts) // Immediate validation
  factStream.emit('facts', validFacts)
}
```

---

### Priority 3: Page Retrieval Optimization (CONSTRAINED)

**Constraint**: Single BrowserView - can only navigate one URL at a time

**Options**:

#### Option A: Keep Sequential (Current)
- Simple, reliable
- No browser conflicts
- **Slow**: ~80s for 20 pages

#### Option B: Multiple BrowserViews (Complex)
- Requires managing multiple BrowserView instances
- Memory overhead
- **Fast**: ~20s for 20 pages (4 concurrent)
- **Risk**: Browser crashes, memory issues

#### Option C: Optimize Sequential Flow
- Reduce wait times where possible
- Better error handling (skip slow pages faster)
- Prefetch next URL while processing current
- **Moderate speedup**: ~60s for 20 pages

**Recommendation**: Option C (optimize sequential) + Option A (keep simple)
- Add timeout per page (skip after 5s)
- Better caching
- Optimize wait times

---

## Recommended Implementation Plan

### Phase 1: Quick Wins (Immediate)

1. ✅ **Parallelize SourceEvaluator.evaluateAll()**
   - Change sequential loop to batched Promise.all()
   - Add concurrency limit (5-10 concurrent)
   - **Impact**: ~5x faster evaluation phase

2. ✅ **Add Early Fact Validation**
   - Validate facts immediately after extraction
   - Filter invalid facts before cross-referencing
   - **Impact**: Faster processing, better quality

### Phase 2: Optimizations (Next)

3. ⚠️ **Optimize Page Retrieval**
   - Add per-page timeout (5s max)
   - Better error recovery
   - Optimize wait times
   - **Impact**: ~20-30% faster retrieval

4. ⚠️ **Streaming Fact Processing**
   - Process facts as they arrive
   - Start cross-referencing early
   - **Impact**: Better perceived performance

### Phase 3: Advanced (Future)

5. 🔮 **Multiple BrowserViews** (if needed)
   - Only if single BrowserView becomes bottleneck
   - Requires careful memory management
   - **Impact**: 4x faster retrieval (but risky)

---

## Expected Performance Improvements

### Current Performance (Estimated)
- Phase 1 (Decomposition): 2s
- Phase 2 (Search): 15s (parallel, 3 concurrent)
- Phase 3 (Retrieval): 80s (sequential, 20 pages)
- Phase 4 (Evaluation): 60s (sequential, 20 pages)
- Phase 5 (Gap Analysis): 3s
- Phase 6 (Follow-up): 10s (if needed)
- Phase 7 (Cross-ref): 0.5s
- Phase 8 (Synthesis): 5s
- **Total: ~175s (~3 minutes)**

### After Phase 1 Optimizations
- Phase 1 (Decomposition): 2s
- Phase 2 (Search): 15s
- Phase 3 (Retrieval): 80s (no change)
- Phase 4 (Evaluation): **12s** (5x faster, 5 concurrent)
- Phase 5 (Gap Analysis): 3s
- Phase 6 (Follow-up): 10s
- Phase 7 (Cross-ref): 0.5s
- Phase 8 (Synthesis): 5s
- **Total: ~127s (~2 minutes)**
- **Improvement: ~48s faster (27% reduction)**

### After Phase 2 Optimizations
- Phase 3 (Retrieval): **60s** (timeouts, optimized waits)
- **Total: ~107s (~1.8 minutes)**
- **Improvement: ~68s faster (39% reduction)**

---

## Implementation Notes

### Concurrency Limits

**Source Evaluation**: 
- Recommended: 5-10 concurrent
- Reason: LLM API rate limits, memory usage
- Can be tuned based on API limits

**Page Retrieval**:
- Current: 1 (BrowserView constraint)
- Future: 2-4 (if multiple BrowserViews)

### Error Handling

- Parallel operations should handle failures gracefully
- One failed evaluation shouldn't block others
- Collect errors and continue processing

### Memory Considerations

- Parallel LLM calls increase memory usage
- Monitor memory when increasing concurrency
- Consider streaming responses for large batches

---

## Conclusion

**Immediate Action**: Parallelize SourceEvaluator (Phase 1)
- High impact, low risk
- ~5x speedup for evaluation phase
- Easy to implement

**Next Steps**: Optimize Page Retrieval (Phase 2)
- Moderate impact, low risk
- ~20-30% speedup
- Requires careful testing

**Future Consideration**: Multiple BrowserViews (Phase 3)
- High impact, high risk
- Requires significant refactoring
- Only if retrieval becomes bottleneck




