/**
 * Summarization Service
 * Uses LLM to generate summaries of web page content
 */

import { llmRouter } from '../llm/router'
import type { ChatParams } from '../../shared/types'

export interface SummarizationOptions {
  content: string
  type: 'summary' | 'keyPoints'
  length?: 'brief' | 'medium' | 'detailed'
  focus?: string
  maxPoints?: number
  sectionName?: string
  metadata?: {
    title?: string
    url?: string
    wordCount?: number
  }
}

/**
 * Generates a summary or key points from content using LLM
 */
export async function summarizeContent(options: SummarizationOptions): Promise<string | string[]> {
  const { content, type, length = 'medium', focus, maxPoints = 10, sectionName, metadata } = options

  // Truncate content if too long (to save tokens)
  const MAX_CONTENT_LENGTH = 50000 // ~12,500 tokens
  const truncatedContent = content.length > MAX_CONTENT_LENGTH
    ? content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[... content truncated ...]'
    : content

  // Build prompt based on type
  let systemPrompt: string
  let userPrompt: string

  if (type === 'summary') {
    systemPrompt = `You are an expert at summarizing web content. Create clear, concise summaries that capture the essential information.`
    
    const lengthInstructions = {
      brief: '2-3 sentences',
      medium: '1-2 paragraphs',
      detailed: '3-5 paragraphs',
    }

    const focusInstruction = focus
      ? ` Focus specifically on: ${focus}.`
      : ''

    const sectionContext = sectionName
      ? ` This is the "${sectionName}" section of the page.`
      : ''

    userPrompt = `Summarize the following web content in ${lengthInstructions[length]}${focusInstruction}${sectionContext}

${metadata?.title ? `Page Title: ${metadata.title}\n` : ''}${metadata?.url ? `URL: ${metadata.url}\n` : ''}${metadata?.wordCount ? `Word Count: ${metadata.wordCount}\n` : ''}

Content:
${truncatedContent}

Provide a clear, well-structured summary that captures the main points and essential information.`
  } else {
    // keyPoints
    systemPrompt = `You are an expert at extracting key points from web content. Identify the most important facts, ideas, and takeaways.`
    
    userPrompt = `Extract the ${maxPoints} most important key points from the following web content. Return them as a numbered list of concise bullet points.

${metadata?.title ? `Page Title: ${metadata.title}\n` : ''}${metadata?.url ? `URL: ${metadata.url}\n` : ''}${metadata?.wordCount ? `Word Count: ${metadata.wordCount}\n` : ''}

Content:
${truncatedContent}

Return ONLY a numbered list of key points, one per line. Each point should be concise but informative.`
  }

  // Use a cost-effective model for summarization (simple task)
  // Default to OpenAI GPT-4o-mini or similar for cost efficiency
  const provider = 'openai' // Could be made configurable
  const model = 'gpt-4o-mini' // Cost-effective model for summarization

  try {
    const chatParams: ChatParams = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      maxTokens: length === 'detailed' ? 1000 : length === 'medium' ? 500 : 250,
      temperature: 0.3, // Lower temperature for more consistent summaries
    }

    // Get summary from LLM
    const chunks: string[] = []
    for await (const chunk of llmRouter.chat(provider, chatParams)) {
      if (chunk.content) {
        chunks.push(chunk.content)
      }
      if (chunk.error) {
        throw new Error(chunk.error)
      }
    }

    const fullResponse = chunks.join('')

    if (type === 'keyPoints') {
      // Parse key points from response
      // Try to extract numbered list items
      const points = fullResponse
        .split(/\n+/)
        .map(line => line.trim())
        .filter(line => {
          // Match numbered list items (1., 2., etc.) or bullet points (-, •, etc.)
          return /^(\d+[\.\)]\s*|[-•*]\s*)/.test(line) && line.length > 10
        })
        .map(line => line.replace(/^(\d+[\.\)]\s*|[-•*]\s*)/, '').trim())
        .filter(point => point.length > 0)
        .slice(0, maxPoints)

      return points.length > 0 ? points : [fullResponse]
    }

    return fullResponse.trim()
  } catch (error) {
    console.error('Summarization error:', error)
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

