# Deep Research - Example Prompts & Usage

## How to Trigger Deep Research

### Option 1: Direct IPC Call (Quick Test)

Open your browser console (DevTools) and run:

```javascript
// Test deep research
const result = await window.electronAPI.invoke('research:deep', 'Compare OpenAI vs Anthropic for a startup')
console.log('Research Result:', result)
```

### Option 2: Add Temporary Test Button

Add this to any React component temporarily:

```typescript
import { ipc } from '../lib/ipc'

const handleTestDeepResearch = async () => {
  const prompt = 'Compare OpenAI vs Anthropic for a startup'
  console.log('Starting deep research...')
  
  const result = await ipc.research.deep(prompt)
  
  if (result.success) {
    console.log('✅ Research Complete!')
    console.log('Response:', result.result?.response)
    console.log('Sources:', result.result?.sources)
    console.log('Stats:', result.result?.stats)
    
    // Display in UI or alert
    alert(`Research complete!\n\nFound ${result.result?.sources.length} sources\nTime: ${(result.result?.stats.totalTimeMs / 1000).toFixed(1)}s`)
  } else {
    (result.error) {
    console.error('❌ Research failed:', result.error)
    alert('Research failed: ' + result.error)
  }
}

// In your component JSX:
<button onClick={handleTestDeepResearch}>
  Test Deep Research
</button>
```

### Option 3: Integrate into Chat Input

Modify `chatStore.ts` to add a "Deep Research" button or keyboard shortcut:

```typescript
// In chatStore.ts, add a new function:
async function executeDeepResearch(userPrompt: string, agentId: string) {
  set({ isResearching: true, researchProgress: 'Starting deep research...' })
  
  try {
    const result = await ipc.research.deep(userPrompt)
    
    if (result.success && result.result) {
      // Create assistant message with research results
      const assistantMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'assistant',
        content: result.result.response,
        // You could add metadata here for sources
      }
      
      const savedMessage = await ipc.message.create(assistantMessage)
      set({ 
        messages: [...get().messages, savedMessage],
        isResearching: false 
      })
    }
  } catch (error) {
    console.error('Deep research failed:', error)
    set({ isResearching: false })
  }
}
```

---

## Example Prompts for Deep Research

### Comparison Queries (Best Use Case)

1. **"Compare OpenAI vs Anthropic for a startup"**
   - Will break down into: pricing, features, rate limits, context windows, compliance, startup experiences
   - Expected: 5-8 sub-questions, 15-30 sources, comprehensive comparison

2. **"Should I use GPT-4 or Claude for code generation?"**
   - Will research: code quality, token limits, pricing, developer experiences, benchmarks
   - Expected: Detailed comparison with citations

3. **"What are the best LLM providers for enterprise use?"**
   - Will research: enterprise features, compliance, security, support, pricing
   - Expected: Multi-provider comparison with authority sources

### Pricing & Cost Analysis

4. **"What's the total cost of running GPT-4 API for 1M tokens?"**
   - Will research: current pricing, input/output rates, any discounts
   - Expected: Accurate pricing with official sources

5. **"Compare API costs: OpenAI, Anthropic, and Google Gemini"**
   - Will research: pricing tiers, token costs, rate limits
   - Expected: Side-by-side cost comparison

### Feature & Specification Queries

6. **"What are the context window limits for major LLM providers?"**
   - Will research: GPT-4, Claude, Gemini context windows
   - Expected: Verified specifications with sources

7. **"Which LLM providers support function calling and vision?"**
   - Will research: capabilities across providers
   - Expected: Feature matrix with citations

### Market & Industry Analysis

8. **"What's the current market share of LLM providers?"**
   - Will research: market data, analyst reports, usage statistics
   - Expected: Recent data with multiple sources

9. **"What are the latest developments in LLM technology?"**
   - Will research: recent announcements, releases, research papers
   - Expected: Current information with recency filters

### Complex Multi-Part Questions

10. **"For a SaaS startup building an AI feature, should I use OpenAI or Anthropic? Consider pricing, reliability, and developer experience."**
    - Will break down into multiple aspects
    - Expected: Comprehensive analysis covering all aspects

---

## What Makes a Good Deep Research Prompt?

✅ **Good prompts:**
- Require multiple sources of information
- Need current/accurate data (pricing, specs, comparisons)
- Benefit from cross-referencing facts
- Are complex enough to warrant 5-8 sub-questions

❌ **Not ideal for deep research:**
- Simple factual questions ("What is 2+2?")
- Questions that need real-time data ("What's the weather?")
- Questions that need personal context ("What should I eat?")
- Very specific technical questions with single-source answers

---

## Expected Output Format

When you call deep research, you'll get:

```typescript
{
  success: true,
  result: {
    response: `
      Based on my research, here's a comprehensive comparison:
      
      **Pricing:**
      OpenAI GPT-4 charges $0.03 per 1K input tokens [1], while 
      Anthropic Claude charges $0.015 per 1K input tokens [2].
      
      **Context Windows:**
      GPT-4 supports up to 128K tokens [1], while Claude 3.5 Sonnet 
      supports up to 200K tokens [2].
      
      [More detailed comparison...]
      
      **Sources:**
      [1] OpenAI official pricing page
      [2] Anthropic official documentation
      [3] TechCrunch comparison article
      ...
    `,
    sources: [
      {
        url: "https://openai.com/pricing",
        domain: "openai.com",
        title: "OpenAI Pricing",
        authorityScore: 100
      },
      // ... more sources
    ],
    verifiedFacts: [
      {
        claim: "OpenAI GPT-4 pricing",
        value: "$0.03 per 1K tokens",
        sources: [...],
        confidence: "high"
      },
      // ... more facts
    ],
    gaps: [], // Any unfilled gaps
    confidence: "high",
    stats: {
      totalSearches: 24,
      pagesAnalyzed: 15,
      factsExtracted: 87,
      factsVerified: 45,
      totalTimeMs: 52341, // ~52 seconds
      phases: [
        { name: "decomposition", durationMs: 1200, itemsProcessed: 6 },
        { name: "search", durationMs: 8500, itemsProcessed: 24 },
        // ... more phases
      ]
    }
  }
}
```

---

## Quick Test Script

Save this as `test-research.ts` in your project root (or run in console):

```typescript
// Quick test script
async function testDeepResearch() {
  const testPrompts = [
    'Compare OpenAI vs Anthropic for a startup',
    'What are the current API pricing tiers for major LLM providers?',
    'Which LLM has the largest context window?',
  ]
  
  for (const prompt of testPrompts) {
    console.log(`\n🔍 Testing: "${prompt}"`)
    console.log('─'.repeat(60))
    
    const start = Date.now()
    const result = await window.electronAPI.invoke('research:deep', prompt)
    const duration = ((Date.now() - start) / 1000).toFixed(1)
    
    if (result.success) {
      console.log(`✅ Completed in ${duration}s`)
      console.log(`   Sources: ${result.result?.sources.length}`)
      console.log(`   Facts: ${result.result?.factsVerified} verified`)
      console.log(`   Confidence: ${result.result?.confidence}`)
      console.log(`\n   Response preview:`)
      console.log(`   ${result.result?.response.substring(0, 200)}...`)
    } else {
      console.log(`❌ Failed: ${result.error}`)
    }
  }
}

// Run it
testDeepResearch()
```

---

## Tips

1. **Start with comparison queries** - They work best with deep research
2. **Be specific** - More specific prompts yield better sub-questions
3. **Expect 45-90 seconds** - Deep research takes time but provides comprehensive results
4. **Check the stats** - Look at `result.stats` to see what was processed
5. **Review sources** - Always check the sources for credibility

---

## Cost Estimate

Each deep research query costs approximately **$0.018** (less than 2 cents) using Gemini 2.5 Flash.

For comparison:
- Regular GPT-4 query: ~$0.10-0.50
- Deep research: ~$0.018

Very affordable for comprehensive research!

