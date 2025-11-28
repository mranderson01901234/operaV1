# LLM Research System Audit Report

**Date:** 2025-11-27
**Codebase:** Opera Browser - Deep Research Module
**Auditor:** AI Engineer

---

## PHASE 1: Research-Related Entry Points

### Summary Table

| Area | File(s) | Description | Role in Research Flow |
|------|---------|-------------|------------------------|
| **Core Research Engine** | `src/main/research/index.ts` | DeepResearchEngine orchestrator (8-phase pipeline) | Main entry point - coordinates entire research workflow |
| **Query Decomposition** | `src/main/research/query-decomposer.ts` | Breaks user query into 5-8 searchable sub-questions | Phase 1 - LLM-powered query planning |
| **Parallel Search** | `src/main/research/parallel-searcher.ts` | Executes concurrent searches via browser | Phase 2 - Web search execution |
| **Page Retrieval** | `src/main/research/page-retriever.ts` | Fetches and extracts content from URLs | Phase 3 - Content acquisition |
| **Source Evaluation** | `src/main/research/source-evaluator.ts` | Scores sources and extracts facts | Phase 4 - LLM fact extraction |
| **Gap Analysis** | `src/main/research/gap-analyzer.ts` | Identifies missing information | Phase 5 - LLM gap detection |
| **Cross-Reference** | `src/main/research/cross-referencer.ts` | Verifies facts across sources | Phase 7 - Fact verification |
| **Synthesis** | `src/main/research/synthesizer.ts` | Generates final research report | Phase 8 - LLM response generation |
| **Research Prompts** | `src/main/research/prompts.ts` | 5 system prompts for research tasks | Prompt templates for all LLM calls |
| **LLM Adapter** | `src/main/research/llm-adapter.ts` | Bridges research to LLM router | Routes research LLM calls |
| **IPC Handler** | `src/main/ipc/research.ts` | IPC handlers for research requests | Entry point from renderer |
| **LLM Router** | `src/main/llm/router.ts` | Routes to providers with cost optimization | Core LLM infrastructure |
| **Browser Tools** | `src/main/llm/tools.ts` | 17 browser + 5 document tools defined | Tool definitions |
| **Tool Executor** | `src/main/browser/tool-executor.ts` | Executes browser automation tools | Browser interaction layer |
| **Chat Store** | `src/renderer/stores/chatStore.ts` | Browser agent system prompt + state | UI-initiated research |
| **Research UI** | `src/renderer/components/Chat/ResearchResponse.tsx` | Renders research results with citations | Result presentation |

### Supporting Infrastructure

| Area | File(s) | Description | Role |
|------|---------|-------------|------|
| JSON Utilities | `src/main/research/json-utils.ts` | Robust JSON parsing with 5 repair strategies | Handles malformed LLM output |
| Fact Validator | `src/main/research/fact-validator.ts` | Filters CSS/JS garbage from facts | Quality control |
| Content Cleaner | `src/main/research/content-cleaner.ts` | HTML cleaning, content extraction | Pre-processing |
| Types | `src/main/research/types.ts` | TypeScript interfaces for research data | Type definitions |
| Search Utils | `src/main/browser/search-utils.ts` | Query sanitization (removes years, filler) | Search optimization |

---

## PHASE 2: End-to-End Research Flow

### Primary Flow: Deep Research (via IPC)

```
User Input (Renderer)
    │
    ▼
[IPC: RESEARCH_DEEP] ─────────────── src/main/ipc/research.ts:11
    │
    ▼
ResearchLLMAdapter ────────────────── src/main/research/llm-adapter.ts
    │
    ▼
DeepResearchEngine.research() ────── src/main/research/index.ts:50
    │
    ├──▶ Phase 1: QueryDecomposer.decompose()
    │         └─ LLM Call (gemini-2.5-flash)
    │         └─ Produces 5-8 sub-questions
    │
    ├──▶ Phase 2: ParallelSearcher.searchAll()
    │         └─ 3 concurrent searches per sub-question
    │         └─ Uses BrowserSearchAdapter (navigate + extract)
    │
    ├──▶ Phase 3: PageRetriever.retrieveAll()
    │         └─ 5 concurrent page fetches
    │         └─ 8-second timeout per page
    │         └─ Content cleaning + validation
    │
    ├──▶ Phase 4: SourceEvaluator.evaluateAll()
    │         └─ 5 concurrent LLM calls
    │         └─ Fact extraction + validation
    │         └─ Domain authority scoring
    │
    ├──▶ Phase 5: GapAnalyzer.analyze()
    │         └─ LLM Call for gap detection
    │
    ├──▶ Phase 6: Follow-up searches (if critical gaps)
    │         └─ Additional search + retrieval
    │
    ├──▶ Phase 7: CrossReferencer.verify()
    │         └─ Groups similar facts
    │         └─ Calculates confidence levels
    │
    └──▶ Phase 8: Synthesizer.synthesize()
              └─ LLM Call for final response
              └─ Citation generation
              └─ Follow-up questions
    │
    ▼
ResearchResult returned to renderer
```

### Sequence Table

| Step | File / Function | Description | Notes / Risks |
|------|-----------------|-------------|---------------|
| 1 | `ipc/research.ts:11` | IPC handler receives prompt + agentId | No input validation |
| 2 | `research/llm-adapter.ts:16` | Creates LLM client wrapper | Hardcoded to Gemini default |
| 3 | `research/index.ts:59` | Query decomposition | 2 retries, fallback if fails |
| 4 | `research/parallel-searcher.ts:22` | Execute searches in batches of 3 | Fixed 2-second delay, no retry |
| 5 | `research/page-retriever.ts:30` | Fetch pages in batches of 5 | 8-sec timeout, crash handling |
| 6 | `research/source-evaluator.ts:47` | Extract facts via LLM | 5 concurrent, 2 retries each |
| 7 | `research/gap-analyzer.ts:15` | Identify missing info | 2 retries, returns empty on fail |
| 8 | `research/index.ts:117` | Follow-up searches | Only for critical gaps |
| 9 | `research/cross-referencer.ts:6` | Verify facts | Simple word-based grouping |
| 10 | `research/synthesizer.ts:13` | Generate final response | Single LLM call, no retry |

---

## PHASE 3: System Prompts and Prompt Design Audit

### Research-Specific Prompts

#### 1. QUERY_DECOMPOSITION_PROMPT
**Location:** `src/main/research/prompts.ts:3-84`

```
You are a research planning assistant. Break down the user's question into specific sub-questions that can be individually researched.

RULES:
1. Generate 5-8 distinct sub-questions
2. Each sub-question should be independently searchable
3. Cover different aspects: facts, pricing, comparisons, features, opinions
4. Prioritize sub-questions by importance to answering the main question
5. Generate an optimized search query for each sub-question
6. DO NOT include years in search queries

OUTPUT FORMAT (STRICT JSON ONLY - NO MARKDOWN, NO EXPLANATIONS):
{
  "subQuestions": [
    {
      "id": "q1",
      "question": "What is the specific sub-question?",
      "category": "pricing|features|comparison|facts|opinions|news",
      "priority": "high|medium|low",
      "searchQuery": "optimized search query without years"
    }
  ]
}
```

**Analysis:**
- Purpose: Break complex queries into searchable components
- Strengths: Clear JSON schema, good category system, year removal
- Issues: No guidance on query length limits, no deduplication instruction

#### 2. FACT_EXTRACTION_PROMPT
**Location:** `src/main/research/prompts.ts:86-118`

```
You are a fact extraction assistant. Extract specific, verifiable facts from the provided content.

RULES:
1. Extract only concrete facts (numbers, dates, names, specifications)
2. Include the exact context where the fact appears
3. Rate your confidence in each fact (0-100)
4. Categorize each fact
5. Do not infer or extrapolate - only extract what is explicitly stated
```

**Analysis:**
- Purpose: Extract verifiable facts from page content
- Strengths: Clear extraction rules, confidence scoring, categorization
- Issues: No max fact limit in prompt (handled in code with 15 limit), no guidance on handling conflicting info

#### 3. GAP_ANALYSIS_PROMPT
**Location:** `src/main/research/prompts.ts:120-160`

```
You are a research gap analyzer. Given the original question and the facts gathered so far, identify what information is still missing or uncertain.

RULES:
1. Compare gathered facts against what's needed to fully answer the question
2. Identify conflicting information that needs resolution
3. Note if critical information is missing
4. Suggest specific search queries to fill each gap
5. Rate importance of each gap
```

**Analysis:**
- Purpose: Identify missing information after initial research
- Strengths: Good importance rating, conflict detection
- Issues: No limit on number of gaps, could generate many follow-ups

#### 4. SYNTHESIS_PROMPT
**Location:** `src/main/research/prompts.ts:162-187`

```
You are a precision research assistant. Your goal is to provide a structured, fact-based answer cited from the provided sources.

STRUCTURE:
1. **Direct Answer**: A concise 2-3 sentence summary answering the main question.
2. **Key Findings**: A bulleted list of the 3-5 most critical facts or stats.
3. **Detailed Analysis**: Use H2 headers (##) to break down the answer into logical sections based on the sub-questions.
4. **Conclusion**: A brief wrap-up.

RULES:
- CITATIONS: You MUST cite your sources using [1], [2] format at the end of sentences.
- ACCURACY: Use ONLY the provided verified facts. Do not hallucinate.
- TONE: Professional, objective, and concise. No fluff.
- FORMAT: Use Markdown (bold for emphasis, ## for section headers, - for bullets).
```

**Analysis:**
- Purpose: Generate final research report with citations
- Strengths: Clear structure, citation format, anti-hallucination instruction
- Issues: No length guidance, no instruction on handling gaps/uncertainties

#### 5. SOURCE_AUTHORITY_PROMPT
**Location:** `src/main/research/prompts.ts:189-202`

```
Rate the authority/trustworthiness of this source for the given topic on a scale of 0-100.

Consider:
- Is this an official/primary source? (company website, official docs)
- Is this a reputable publication? (major tech news, peer-reviewed)
- Is this user-generated content? (forums, comments)
- Is this a known aggregator or SEO content?
```

**Analysis:**
- Purpose: Score source trustworthiness
- Status: **NOT USED** - Code uses hardcoded domain scores instead
- Issues: Dead code, should be removed or integrated

### Browser Agent System Prompt

**Location:** `src/renderer/stores/chatStore.ts:39-120`

**Key Behaviors:**
- Lists 7 browser tools with parameters
- Lists 4 document tools
- Instructions for using accessibility tree
- Best practices including CAPTCHA handling
- Preference for direct search URLs over typing

**Issues:**
- No rate limiting guidance
- No cost awareness
- Mixed concerns (browser + document in one prompt)

### Prompt Audit Table

| Name / Location | Used For | Key Behaviors / Instructions | Problems / Smells |
|-----------------|----------|------------------------------|-------------------|
| QUERY_DECOMPOSITION_PROMPT | Breaking query into sub-questions | 5-8 questions, no years, JSON output | No query length limits, no deduplication |
| FACT_EXTRACTION_PROMPT | Extracting facts from content | Concrete facts only, confidence scoring | Max limit (15) is in code, not prompt |
| GAP_ANALYSIS_PROMPT | Finding missing information | Gap + conflict detection, importance rating | No max gaps limit, could trigger many follow-ups |
| SYNTHESIS_PROMPT | Final report generation | Structure, citations, anti-hallucination | No length guidance, no uncertainty handling |
| SOURCE_AUTHORITY_PROMPT | Source scoring | 0-100 rating criteria | **DEAD CODE** - not actually used |
| BROWSER_AGENT_SYSTEM_PROMPT | Browser automation | Tool descriptions, best practices | No rate limiting, no cost awareness |

---

## PHASE 4: Research Capabilities

### Tools Table

| Tool | Input Schema | Output Schema | LLM Instructions | Error Handling | Issues |
|------|--------------|---------------|------------------|----------------|--------|
| `navigate` | `{url: string}` | `{url, title, loaded}` | "Go to a URL" | CAPTCHA fallback to Bing/DDG | 10s timeout, no retry |
| `click` | `{selector, elementDescription?}` | `{clicked, coordinates, tagName}` | "Click element, use a11y tree selector" | 6 fallback strategies | Verbose 400-line script |
| `type` | `{selector, text, clearFirst?, submit?}` | `{typed, selector, submitted}` | "Type into input field" | 7 fallback strategies | Complex, hard to debug |
| `scroll` | `{direction, amount?}` | `{direction, amount}` | "Scroll the page" | Basic | No boundary detection |
| `extract` | `{selector?, attribute?}` | `{selector, attribute, value}` | "Extract text content" | Disposed check | 10KB limit hardcoded |
| `screenshot` | `{fullPage?}` | `{fullPage, format} + image` | "Take screenshot, saves costs" | Basic | Not used by default |
| `wait` | `{selector, timeout?}` | `{selector, found, elapsed}` | "Wait for element" | Timeout return | Fixed 5s default |
| `extractSearchResults` | `{engine?}` | `{engine, results, count}` | "Extract from SERP" | Auto-detect engine | Engine detection fragile |
| `createTab` | `{url?, makeActive?}` | `{tabId, url, title}` | "Open new tab" | TabManager check | |
| `switchTab` | `{tabId?, index?}` | `{tabId, url, title}` | "Switch tabs" | Index bounds check | |
| `closeTab` | `{tabId?}` | `{closedTabId}` | "Close tab" | Basic | |
| `listTabs` | `{}` | `{tabs, count, activeTabId}` | "List all tabs" | Basic | |
| `summarize` | `{selector?, length?, focus?}` | `{summary, wordCount, source}` | "Summarize page/element" | Content validation | Adds LLM call |
| `extractKeyPoints` | `{selector?, maxPoints?}` | `{keyPoints, count}` | "Extract key points" | Content validation | Adds LLM call |
| `summarizeSection` | `{sectionName, length?}` | `{summary, sectionName}` | "Summarize specific section" | Section not found | |
| `listDocuments` | `{agentId}` | `{documents}` | "List available docs" | Basic | |
| `readDocument` | `{documentId, sheet?, startRow?, endRow?, maxRows?, columns?}` | `{content, metadata}` | "Read document content" | Cost warning in desc | |

### RAG / Embeddings / Retrieval

**Status:** **NOT IMPLEMENTED**

The codebase does not use:
- Vector databases (no FAISS, Qdrant, pgvector)
- Embeddings (no embedding model calls)
- Semantic search
- Document chunking with overlap
- Reranking

**Current Approach:**
- All retrieval is via live web search
- No persistent knowledge base
- No RAG pipeline

### Browser Automation Table

| Component | Implementation | LLM Guidance | Safeguards | Issues |
|-----------|----------------|--------------|------------|--------|
| Browser Driver | Electron BrowserView + CDP | A11y tree provided | CAPTCHA detection, search engine fallback | No Puppeteer/Playwright |
| Page State Exposure | Accessibility tree (top 30 elements) | Selectors in tree | 30-element limit | Limited visibility |
| Navigation | `navigateToUrl()` via CDP | Direct URL preferred | 10s timeout, CAPTCHA check | No retry on failure |
| Content Extraction | CDP Runtime.evaluate | N/A | Disposed checks | BrowserView crashes |
| Search Results | DOM extraction script | Auto-detect engine | Video URL filtering | Fragile selectors |
| Parallel Tabs | TabManager with background tabs | N/A | Cleanup on timeout | Research partition |
| Pop-up Handling | CSS selector click script | N/A | Escape key fallback | 20+ selectors, fragile |

**Known Issues in Code:**
```typescript
// src/main/research/page-retriever.ts:240-246
// Handle crashes gracefully - if BrowserView crashes, skip this page
try {
  await this.closePopups()
} catch (error: any) {
  if (error?.message?.includes('crashed') || error?.message?.includes('Target crashed')) {
    console.error(`[PageRetriever] BrowserView crashed while processing ${url}, skipping page`)
    return null
  }
}
```

---

## PHASE 5: Weaknesses, Bottlenecks, and Inconsistencies

### Critical Issues

| Issue | Area | Location | Impact | Difficulty | Notes |
|-------|------|----------|--------|------------|-------|
| **1. No RAG/Vector Search** | Architecture | N/A | Can't leverage prior research, always starts fresh | High | Major feature gap |
| **2. Single Model (Gemini Flash)** | LLM | All research modules | No fallback if Gemini fails, limited quality | Medium | Should support model rotation |
| **3. SOURCE_AUTHORITY_PROMPT dead code** | Prompts | `prompts.ts:189-202` | Misleading, maintainability | Low | Delete or integrate |
| **4. No retry on synthesis** | Reliability | `synthesizer.ts:50` | Single point of failure for final output | Low | Add retry logic |
| **5. BrowserView crashes** | Browser | `page-retriever.ts` | Pages skipped, reduced research coverage | Medium | Need better recovery |
| **6. Fixed delays (2s search, 1s nav)** | Performance | Multiple files | Slow research, no adaptive timing | Medium | Use waitForLoad instead |
| **7. Fact grouping too simple** | Accuracy | `cross-referencer.ts:53` | Unrelated facts grouped, missed duplicates | Medium | Need semantic similarity |
| **8. No cost tracking** | Operations | Research flow | Unknown cost per research query | Medium | Add token counting |
| **9. JSON repair complexity** | Maintainability | `json-utils.ts` | 400+ lines, hard to debug | Low | Consider structured output |
| **10. Pop-up selectors fragile** | Reliability | `page-retriever.ts:502-525` | 20+ hardcoded selectors, breaks on new sites | Medium | Need smarter detection |

### Detailed Analysis

#### 1. No RAG / Vector Search
- **What's Wrong:** Every research query starts from scratch with live web searches
- **Impact:** Cannot leverage previous research, higher latency, higher costs, no institutional knowledge
- **Fix Difficulty:** High - requires adding vector DB, embedding pipeline, retrieval logic

#### 2. Single Model Hardcoding
- **Where:** `query-decomposer.ts:26`, `source-evaluator.ts:235`, `gap-analyzer.ts:47`, `synthesizer.ts:51`
- **What's Wrong:** All use `gemini-2.5-flash` hardcoded, no fallback
- **Impact:** If Gemini fails/rate-limits, entire research fails
- **Fix Difficulty:** Medium - add model parameter to config, implement fallback chain

#### 3. Dead Code (SOURCE_AUTHORITY_PROMPT)
- **Where:** `prompts.ts:189-202`
- **What's Wrong:** Defined but never used - `source-evaluator.ts` uses `DOMAIN_AUTHORITY` hardcoded map instead
- **Impact:** Confusing for maintainers, false sense of dynamic scoring
- **Fix Difficulty:** Low - either delete or integrate

#### 4. No Retry on Synthesis
- **Where:** `synthesizer.ts:50-55`
- **What's Wrong:** Final synthesis has no retry logic, unlike other phases
- **Impact:** If LLM call fails at the end, all previous work is wasted
- **Fix Difficulty:** Low - wrap in retry loop like other phases

#### 5. BrowserView Crash Handling
- **Where:** `page-retriever.ts:240-246`, `BrowserPageAdapter.navigate()`
- **What's Wrong:** When BrowserView crashes, page is silently skipped
- **Impact:** Reduced research coverage, no recovery attempt
- **Fix Difficulty:** Medium - need BrowserView recreation logic

#### 6. Fixed Delays Instead of Wait-for-Load
- **Where:** `parallel-searcher.ts:113` (2000ms), `page-retriever.ts:168` (1000ms), `tool-executor.ts:142` (500ms)
- **What's Wrong:** Fixed `await delay()` instead of waiting for actual load
- **Impact:** Either too slow (wastes time) or too fast (misses content)
- **Fix Difficulty:** Medium - replace with `waitForPageLoad()` or `did-finish-load` event

#### 7. Simple Fact Grouping
- **Where:** `cross-referencer.ts:53-63`
- **What's Wrong:** Groups facts by sorted first 5 words (4+ chars) - purely lexical
- **Impact:** Semantically similar facts missed, unrelated facts grouped
- **Fix Difficulty:** Medium - need embedding-based similarity

#### 8. No Cost Tracking for Research
- **Where:** Research flow bypasses `cost-tracker.ts`
- **What's Wrong:** `ResearchLLMAdapter` doesn't track tokens
- **Impact:** No visibility into research costs
- **Fix Difficulty:** Medium - add token counting to adapter

#### 9. JSON Repair Complexity
- **Where:** `json-utils.ts` (410 lines)
- **What's Wrong:** 5 repair strategies, regex-heavy, hard to debug
- **Impact:** Maintenance burden, edge cases cause silent failures
- **Fix Difficulty:** Low - consider using Gemini's structured output mode

#### 10. Fragile Pop-up Selectors
- **Where:** `page-retriever.ts:505-525`
- **What's Wrong:** 20+ hardcoded CSS selectors for pop-ups
- **Impact:** Breaks on new sites, maintenance burden
- **Fix Difficulty:** Medium - need ML-based or heuristic detection

---

## PHASE 6: Concrete Optimization Recommendations

### Priority 1: Critical Fixes (Do First)

| Priority | Change | Files / Modules | Expected Benefit | Notes |
|----------|--------|-----------------|------------------|-------|
| P1.1 | Add retry logic to synthesis | `synthesizer.ts` | Prevent wasted research on final failure | Wrap `llm.complete()` in retry loop (2 attempts) |
| P1.2 | Remove dead SOURCE_AUTHORITY_PROMPT | `prompts.ts` | Cleaner code, less confusion | Delete lines 189-202 |
| P1.3 | Add model fallback chain | All research modules | Reliability when Gemini fails | Add config option, try Gemini -> OpenAI -> Anthropic |
| P1.4 | Add cost tracking to research | `llm-adapter.ts` | Visibility into research costs | Call `countRequestTokens()` and `logCostInfo()` |

### Priority 2: Performance Improvements

| Priority | Change | Files / Modules | Expected Benefit | Notes |
|----------|--------|-----------------|------------------|-------|
| P2.1 | Replace fixed delays with wait-for-load | `parallel-searcher.ts`, `page-retriever.ts` | 30-50% faster research | Use `waitForPageLoad()` or CDP Page.loadEventFired |
| P2.2 | Increase parallel concurrency | `page-retriever.ts`, `source-evaluator.ts` | Faster research | Increase from 5 to 10 concurrent (test stability) |
| P2.3 | Add request batching | `source-evaluator.ts` | Fewer LLM calls | Batch 3-5 fact extractions per call |
| P2.4 | Cache page content | `page-retriever.ts` | Avoid re-fetching | Extend cache TTL from 5min, persist to disk |

### Priority 3: Reliability Improvements

| Priority | Change | Files / Modules | Expected Benefit | Notes |
|----------|--------|-----------------|------------------|-------|
| P3.1 | BrowserView crash recovery | `page-retriever.ts`, `controller.ts` | Better coverage | Recreate BrowserView after crash, retry page |
| P3.2 | Smarter pop-up detection | `page-retriever.ts` | Fewer missed pages | Use heuristics: z-index, position:fixed, viewport coverage |
| P3.3 | Add timeout to all LLM calls | All research modules | Prevent hangs | Add 30s timeout, handle gracefully |
| P3.4 | Improve CAPTCHA handling | `tool-executor.ts` | Better search reliability | Add delay between searches, rotate user agents |

### Priority 4: Quality Improvements

| Priority | Change | Files / Modules | Expected Benefit | Notes |
|----------|--------|-----------------|------------------|-------|
| P4.1 | Use structured output for JSON | All LLM calls | Eliminate JSON repair code | Use Gemini's `response_mime_type: "application/json"` |
| P4.2 | Add semantic fact grouping | `cross-referencer.ts` | Better fact deduplication | Use embeddings or LLM-based similarity |
| P4.3 | Add length guidance to synthesis prompt | `prompts.ts` | Consistent output length | Add "Generate 500-1000 word response" |
| P4.4 | Handle uncertainty in synthesis | `prompts.ts`, `synthesizer.ts` | More honest responses | Add instruction to acknowledge gaps/low confidence |

### Priority 5: Future Architecture (Major)

| Priority | Change | Files / Modules | Expected Benefit | Notes |
|----------|--------|-----------------|------------------|-------|
| P5.1 | Add RAG pipeline | New module | Leverage prior research | Add vector DB, embeddings, retrieval |
| P5.2 | Research orchestrator class | Refactor `index.ts` | Better separation of concerns | Extract phase logic to separate coordinator |
| P5.3 | Add research streaming | IPC, renderer | Better UX | Stream phase progress to UI |
| P5.4 | Multi-model synthesis | `synthesizer.ts` | Higher quality | Use Claude/GPT-4 for synthesis (Gemini for earlier phases) |

---

## Appendix A: File Inventory

### Research Core (8 files)
```
src/main/research/
├── index.ts           # DeepResearchEngine orchestrator
├── types.ts           # TypeScript interfaces
├── prompts.ts         # 5 LLM prompts
├── query-decomposer.ts
├── parallel-searcher.ts
├── page-retriever.ts
├── source-evaluator.ts
├── gap-analyzer.ts
├── cross-referencer.ts
├── synthesizer.ts
├── llm-adapter.ts
├── json-utils.ts
├── fact-validator.ts
└── content-cleaner.ts
```

### LLM Infrastructure (9 files)
```
src/main/llm/
├── router.ts          # Main LLM router
├── tools.ts           # Tool definitions
├── cost-tracker.ts    # Token counting
├── model-router.ts    # Task complexity routing
├── apiKeys.ts         # API key management
├── search-helpers.ts  # Search utilities
└── providers/
    ├── base.ts
    ├── openai.ts
    ├── anthropic.ts
    ├── gemini.ts
    └── deepseek.ts
```

### Browser Infrastructure (11 files)
```
src/main/browser/
├── tool-executor.ts   # Tool execution
├── controller.ts      # BrowserView management
├── tab-manager.ts     # Tab management
├── a11y-extractor.ts  # Accessibility tree
├── a11y-cache.ts
├── content-extractor.ts
├── screenshot.ts
├── search-utils.ts
└── summarization-service.ts
```

---

## Appendix B: Default Configuration

```typescript
// src/main/research/types.ts:118-126
export const DEFAULT_CONFIG: DeepResearchConfig = {
  maxSubQuestions: 8,          // Max decomposed queries
  maxSearchesPerQuestion: 3,   // Searches per sub-question
  maxPagesToFetch: 20,         // Total pages to retrieve
  maxFollowUpSearches: 5,      // Follow-up for critical gaps
  minSourceConfidence: 60,     // Minimum source score
  requireMultipleSources: true,// Require fact verification
  timeoutMs: 120000,           // 2 minute total timeout
}
```

---

## Appendix C: Domain Authority Scores

```typescript
// src/main/research/source-evaluator.ts:13-40
const DOMAIN_AUTHORITY: Record<string, number> = {
  // Official sources (100)
  'openai.com': 100,
  'anthropic.com': 100,
  'cloud.google.com': 100,
  'azure.microsoft.com': 100,
  'aws.amazon.com': 100,

  // High-quality publications (85-90)
  'techcrunch.com': 85,
  'theverge.com': 85,
  'wired.com': 85,
  'reuters.com': 90,
  'bloomberg.com': 90,

  // Developer resources (65-80)
  'github.com': 80,
  'stackoverflow.com': 75,
  'dev.to': 65,
  'medium.com': 60,

  // Lower quality (40-50)
  'reddit.com': 50,
  'quora.com': 45,
  'twitter.com': 40,
  'x.com': 40,
}

// Default for unknown domains: 50
```

---

*End of Audit Report*
