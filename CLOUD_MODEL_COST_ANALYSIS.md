# Cloud Model Cost Analysis for Silent Preprocessing

## Cheapest Available Model

Based on the pricing data in `cost-tracker.ts`, the **cheapest cloud model** is:

### **Gemini 2.5 Flash/Latest** (Google)
- **Input**: $0.075 per 1M tokens
- **Output**: $0.30 per 1M tokens
- **Model ID**: `gemini-2.5-flash` or `gemini-2.5-flash-lite`

### Comparison with Other Cheap Models

| Model | Input ($/1M) | Output ($/1M) | Total Cost (600 tokens) |
|-------|--------------|---------------|--------------------------|
| **Gemini 2.5 Flash** | **$0.075** | **$0.30** | **$0.0000675** |
| GPT-4o-mini | $0.15 | $0.60 | $0.000135 |
| Claude 3.5 Haiku | $0.25 | $1.25 | $0.000275 |

**Gemini 2.5 Flash is 2x cheaper than GPT-4o-mini and 4x cheaper than Claude Haiku.**

## Silent Functionality Tasks

The local model was handling these preprocessing tasks:

1. **Search Intent Classification** (`classifySearchIntent`)
   - Analyzes user message to detect if it's a search query
   - Extracts search query, search engine preference, complexity
   - Called: **Every user message** (before expensive LLM)

2. **Search Result Extraction** (`extractSearchResults`)
   - Extracts structured data from search result pages
   - Filters and ranks results by relevance
   - Called: **After each search** (to reduce content sent to expensive LLM)

3. **Search Strategy Planning** (`planSearchStrategy`)
   - Breaks down complex searches into multiple steps
   - Determines if premium model synthesis is needed
   - Called: **For complex multi-step searches**

4. **Query Similarity Detection** (`detectSimilarQuery`)
   - Detects if new query is similar to previous queries
   - Helps avoid redundant searches
   - Called: **Before each search** (if previous queries exist)

## Cost Estimation

### Per-Task Token Usage

#### 1. Search Intent Classification
- **Input prompt**: ~500 tokens (user message + instructions)
- **Output**: ~100 tokens (JSON response)
- **Total**: ~600 tokens per classification
- **Cost per classification**: 
  - Input: 500 tokens × $0.075/1M = **$0.0000375**
  - Output: 100 tokens × $0.30/1M = **$0.00003**
  - **Total: $0.0000675 per classification**

#### 2. Search Result Extraction
- **Input prompt**: ~2,500 tokens (query + page content up to 10KB)
- **Output**: ~200 tokens (JSON array of results)
- **Total**: ~2,700 tokens per extraction
- **Cost per extraction**:
  - Input: 2,500 tokens × $0.075/1M = **$0.0001875**
  - Output: 200 tokens × $0.30/1M = **$0.00006**
  - **Total: $0.0002475 per extraction**

#### 3. Search Strategy Planning
- **Input prompt**: ~800 tokens (user message + conversation history)
- **Output**: ~150 tokens (JSON plan)
- **Total**: ~950 tokens per plan
- **Cost per plan**:
  - Input: 800 tokens × $0.075/1M = **$0.00006**
  - Output: 150 tokens × $0.30/1M = **$0.000045**
  - **Total: $0.000105 per plan**

#### 4. Query Similarity Detection
- **Input prompt**: ~400 tokens (new query + previous queries)
- **Output**: ~50 tokens (JSON similarity result)
- **Total**: ~450 tokens per detection
- **Cost per detection**:
  - Input: 400 tokens × $0.075/1M = **$0.00003**
  - Output: 50 tokens × $0.30/1M = **$0.000015**
  - **Total: $0.000045 per detection**

## Monthly Cost Estimates

### Scenario 1: Light Usage
- **100 user messages/day** (30% are searches = 30 searches/day)
- **Intent classifications**: 100/day × $0.0000675 = **$0.00675/day**
- **Result extractions**: 30/day × $0.0002475 = **$0.007425/day**
- **Strategy plans**: 5/day × $0.000105 = **$0.000525/day**
- **Similarity checks**: 20/day × $0.000045 = **$0.0009/day**
- **Daily total**: **$0.0156/day**
- **Monthly total**: **~$0.47/month**

### Scenario 2: Moderate Usage
- **500 user messages/day** (40% are searches = 200 searches/day)
- **Intent classifications**: 500/day × $0.0000675 = **$0.03375/day**
- **Result extractions**: 200/day × $0.0002475 = **$0.0495/day**
- **Strategy plans**: 20/day × $0.000105 = **$0.0021/day**
- **Similarity checks**: 100/day × $0.000045 = **$0.0045/day**
- **Daily total**: **$0.08985/day**
- **Monthly total**: **~$2.70/month**

### Scenario 3: Heavy Usage
- **2,000 user messages/day** (50% are searches = 1,000 searches/day)
- **Intent classifications**: 2,000/day × $0.0000675 = **$0.135/day**
- **Result extractions**: 1,000/day × $0.0002475 = **$0.2475/day**
- **Strategy plans**: 100/day × $0.000105 = **$0.0105/day**
- **Similarity checks**: 500/day × $0.000045 = **$0.0225/day**
- **Daily total**: **$0.4155/day**
- **Monthly total**: **~$12.47/month**

## Cost Savings vs. Premium Models

### Without Silent Preprocessing (Current Fallback)
- All queries go to premium model (e.g., Claude Sonnet 4.5)
- Cost: ~$0.01-0.05 per query (depending on complexity)
- **200 searches/day**: $2-10/day = **$60-300/month**

### With Silent Preprocessing (Gemini 2.5 Flash)
- Only complex queries go to premium model
- Simple queries handled by cheap model
- **Estimated savings**: 70-80% reduction
- **200 searches/day**: 
  - Preprocessing: $0.09/day
  - Premium (30% complex): $0.60-3/day
  - **Total: $0.69-3.09/day = $20.70-92.70/month**
  - **Savings: $39.30-207.30/month**

## Implementation Recommendation

### Use Gemini 2.5 Flash for Silent Tasks

**Advantages:**
- ✅ **Cheapest option**: 2x cheaper than GPT-4o-mini
- ✅ **Fast**: Typically responds in 1-3 seconds
- ✅ **Reliable**: Google's infrastructure
- ✅ **Good JSON output**: Handles structured responses well
- ✅ **No local setup**: No need for Ollama installation

**Configuration:**
```typescript
// In local-model.ts or new cloud-preprocessor.ts
private cloudModel = 'gemini-2.5-flash'
private cloudProvider = 'gemini'
private cloudTimeout = 10000 // 10 seconds (much faster than local)
```

**Cost Impact:**
- **Light usage**: ~$0.50/month (negligible)
- **Moderate usage**: ~$2.70/month (very affordable)
- **Heavy usage**: ~$12.50/month (still reasonable)

## Comparison: Local vs Cloud

| Metric | Local (Ollama) | Cloud (Gemini 2.5 Flash) |
|--------|----------------|--------------------------|
| **Cost** | $0/month | $0.50-12.50/month |
| **Speed** | 10-30 seconds | 1-3 seconds |
| **Setup** | Requires Ollama install | No setup needed |
| **Reliability** | Depends on local hardware | High (Google infrastructure) |
| **Maintenance** | Model updates, disk space | None |

## Recommendation

**Use Gemini 2.5 Flash for silent preprocessing tasks** because:
1. **Cost is negligible**: Even heavy usage is only ~$12/month
2. **Much faster**: 1-3 seconds vs 10-30 seconds
3. **No setup required**: Works immediately
4. **More reliable**: No timeout issues, no local resource constraints
5. **Better UX**: Faster responses = better user experience

The cost savings from using cheap preprocessing (70-80% reduction in premium model calls) far outweigh the small cost of the preprocessing itself.




