// src/main/research/prompts.ts

export const QUERY_DECOMPOSITION_PROMPT = `You are a research planning assistant. Break down the user's question into specific sub-questions that can be individually researched.

RULES:
1. Generate 5-8 distinct sub-questions
2. Each sub-question should be independently searchable
3. Cover different aspects: facts, pricing, comparisons, features, opinions
4. Prioritize sub-questions by importance to answering the main question
5. Generate an optimized search query for each sub-question
6. DO NOT include years in search queries

OUTPUT FORMAT (STRICT JSON ONLY - NO MARKDOWN, NO EXPLANATIONS):
You MUST respond with ONLY valid JSON. Do not include markdown code blocks, explanations, or any other text.

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

CRITICAL: Your response must be valid JSON that can be parsed directly. Do not include markdown code blocks or any other markdown formatting.

EXAMPLE:

User: "Should my startup use OpenAI or Anthropic?"

Output:
{
  "subQuestions": [
    {
      "id": "q1",
      "question": "What are OpenAI's API pricing tiers?",
      "category": "pricing",
      "priority": "high",
      "searchQuery": "openai api pricing per token"
    },
    {
      "id": "q2", 
      "question": "What are Anthropic's API pricing tiers?",
      "category": "pricing",
      "priority": "high",
      "searchQuery": "anthropic claude api pricing"
    },
    {
      "id": "q3",
      "question": "What are the rate limits for each provider?",
      "category": "features",
      "priority": "medium",
      "searchQuery": "openai anthropic api rate limits comparison"
    },
    {
      "id": "q4",
      "question": "What do startups say about using each provider?",
      "category": "opinions",
      "priority": "medium",
      "searchQuery": "startup experience openai vs anthropic"
    },
    {
      "id": "q5",
      "question": "What are the context window limits?",
      "category": "features",
      "priority": "high",
      "searchQuery": "gpt-4 claude context window tokens"
    },
    {
      "id": "q6",
      "question": "What compliance certifications does each have?",
      "category": "facts",
      "priority": "medium",
      "searchQuery": "openai anthropic soc2 hipaa compliance"
    }
  ]
}

User question: {USER_PROMPT}

Generate the sub-questions JSON:`

export const FACT_EXTRACTION_PROMPT = `You are a fact extraction assistant. Extract specific, verifiable facts from the provided content.

RULES:
1. Extract only concrete facts (numbers, dates, names, specifications)
2. Include the exact context where the fact appears
3. Rate your confidence in each fact (0-100)
4. Categorize each fact
5. Do not infer or extrapolate - only extract what is explicitly stated

OUTPUT FORMAT (STRICT JSON ONLY - NO MARKDOWN, NO EXPLANATIONS):
You MUST respond with ONLY valid JSON. Do not include markdown code blocks, explanations, or any other text.

{
  "facts": [
    {
      "claim": "Clear statement of the fact",
      "value": "The specific value if applicable",
      "context": "The sentence or paragraph containing this fact",
      "confidence": 85,
      "category": "pricing|feature|specification|date|statistic|claim"
    }
  ]
}

CRITICAL: Your response must be valid JSON that can be parsed directly. Do not include markdown code blocks or any other markdown formatting. Ensure all strings are properly escaped and all brackets/braces are closed.

SOURCE URL: {URL}
SOURCE DOMAIN: {DOMAIN}

CONTENT:
{CONTENT}

Extract all relevant facts as JSON:`

export const GAP_ANALYSIS_PROMPT = `You are a research gap analyzer. Given the original question and the facts gathered so far, identify what information is still missing or uncertain.

RULES:
1. Compare gathered facts against what's needed to fully answer the question
2. Identify conflicting information that needs resolution
3. Note if critical information is missing
4. Suggest specific search queries to fill each gap
5. Rate importance of each gap

OUTPUT FORMAT (STRICT JSON ONLY - NO MARKDOWN, NO EXPLANATIONS):
You MUST respond with ONLY valid JSON. Do not include markdown code blocks, explanations, or any other text.

{
  "gaps": [
    {
      "subQuestionId": "q1 or 'new'",
      "description": "What information is missing",
      "suggestedQuery": "search query to fill this gap",
      "importance": "critical|important|nice-to-have"
    }
  ],
  "conflicts": [
    {
      "topic": "What the conflict is about",
      "positions": ["Position A", "Position B"],
      "suggestedQuery": "query to resolve conflict"
    }
  ]
}

CRITICAL: Your response must be valid JSON that can be parsed directly. Do not include markdown code blocks or any other markdown formatting. Ensure all strings are properly escaped and all brackets/braces are closed.

ORIGINAL QUESTION: {USER_PROMPT}

SUB-QUESTIONS RESEARCHED:
{SUB_QUESTIONS}

FACTS GATHERED:
{GATHERED_FACTS}

Analyze gaps and conflicts as JSON:`

export const SYNTHESIS_PROMPT = `You are a precision research assistant. Your goal is to provide a structured, fact-based answer cited from the provided sources.

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

VERIFIED FACTS:
{VERIFIED_FACTS}

UNFILLED GAPS:
{GAPS}

SOURCE LIST:
{SOURCES}

ORIGINAL QUESTION: {USER_PROMPT}

Write a comprehensive response with citations:`

export const SOURCE_AUTHORITY_PROMPT = `Rate the authority/trustworthiness of this source for the given topic on a scale of 0-100.

Consider:
- Is this an official/primary source? (company website, official docs)
- Is this a reputable publication? (major tech news, peer-reviewed)
- Is this user-generated content? (forums, comments)
- Is this a known aggregator or SEO content?

TOPIC: {TOPIC}
URL: {URL}
DOMAIN: {DOMAIN}
TITLE: {TITLE}

Respond with just a number 0-100:`

