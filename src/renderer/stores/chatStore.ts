import { create } from 'zustand'
import { ipc } from '../lib/ipc'
import type { Message, ChatParams, ToolCall, Attachment, PendingDocumentEdit } from '../../shared/types'
import { v4 as uuidv4 } from 'uuid'
import { useTabStore } from './tabStore'
// Helper functions for search operations (duplicated in renderer since we can't import from main)
// NOTE: Query sanitization happens in main process (search-helpers.ts)
// This is a simplified version for renderer that doesn't sanitize (sanitization happens before URL is built)
function buildSearchUrl(query: string, engine: 'google' | 'bing' | 'duckduckgo' = 'google'): string {
  // Query should already be sanitized by the time it reaches here
  const encodedQuery = encodeURIComponent(query)
  switch (engine) {
    case 'google':
      return `https://www.google.com/search?q=${encodedQuery}`
    case 'bing':
      return `https://www.bing.com/search?q=${encodedQuery}`
    case 'duckduckgo':
      return `https://duckduckgo.com/?q=${encodedQuery}`
    default:
      return `https://www.google.com/search?q=${encodedQuery}`
  }
}

function isSearchEngineUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    return (
      hostname.includes('google.com') ||
      hostname.includes('bing.com') ||
      hostname.includes('duckduckgo.com')
    )
  } catch {
    return false
  }
}

// Browser agent system prompt that explains tools and context
const BROWSER_AGENT_SYSTEM_PROMPT = `You are a helpful AI assistant with the ability to control a web browser and edit documents. You receive an accessibility tree listing interactive elements on the current page.

## Available Browser Tools

You have access to these browser automation tools:

1. **navigate** - Go to a URL
   - Parameters: { url: string }

2. **click** - Click an element on the page
   - Parameters: { selector: string, elementDescription?: string }
   - Use selectors from the accessibility tree, or describe what to click

3. **type** - Type text into an input field
   - Parameters: { selector: string, text: string, clearFirst?: boolean, submit?: boolean }
   - Set "submit: true" to press Enter after typing (useful for search boxes)

4. **scroll** - Scroll the page
   - Parameters: { direction: "up" | "down" | "left" | "right", amount?: number }

5. **extract** - Extract text from an element
   - Parameters: { selector?: string, attribute?: string }

6. **screenshot** - Take a screenshot (use when you need visual confirmation)
   - Parameters: { fullPage?: boolean }
   - NOTE: Screenshots are not provided by default to save costs. Use this tool when you need to see the page visually.

7. **wait** - Wait for an element to appear
   - Parameters: { selector: string, timeout?: number }

## Available Document Tools

You can read, create, and edit documents:

1. **listDocuments** - List all documents available
   - Parameters: none
   - Returns document IDs, names, types, and sizes

2. **readDocument** - Read the full content of a document
   - Parameters: { documentId: string }
   - Always read a document before making edits

3. **createDocument** - Create a new document
   - Parameters: { filename: string, content: string, mimeType?: string }
   - Creates a new file and opens it in a document tab

4. **editDocument** - Edit an existing document
   - Parameters: { documentId: string, operation: string, content?: string, target: string }
   - Operations:
     - "append" - Add content to end of file (auto-applied)
     - "insert" - Insert at a specific location (auto-applied)
     - "replace" - Replace content (requires user confirmation)
     - "delete" - Delete content (requires user confirmation)
   - The "target" uses semantic descriptions like:
     - "end of file", "beginning of file"
     - "the function handleSubmit", "the class UserService"
     - "after the imports", "the ## Installation section"
     - "lines 15-20" (explicit line numbers)
     - "the paragraph containing 'pricing'"

## How to Use Context

Before each message, you'll receive:
- **Current URL and page title**
- **Accessibility tree** - A list of the top 30 interactive elements with their roles, names, and selectors (scroll to reveal more)

Use the accessibility tree to find the correct selectors for elements you want to interact with. The accessibility tree is usually sufficient for navigation - only request a screenshot if you need visual confirmation or the accessibility tree is unclear.

## Best Practices

1. Look at the accessibility tree to find elements before clicking
2. Use descriptive elementDescription when clicking to help with fallback matching
3. After navigation or clicks, wait for the page to load if needed
4. If an action fails, try alternative selectors or approaches
5. Only use the screenshot tool when visual context is truly needed
6. Always read a document before editing it
7. Destructive edits (replace/delete) will ask the user for confirmation
8. Explain what you're doing and what you observe
9. **SEARCHING**: When searching, prefer using the navigate tool with a direct search URL (e.g., https://www.google.com/search?q=query) instead of typing into the search bar. This is faster and more reliable.
10. **CAPTCHAS**: If you encounter a CAPTCHA or "Unusual traffic" page, STOP immediately and inform the user. Do not try to solve it or retry endlessly. Try a different search engine (Bing/DuckDuckGo) if Google blocks you.

When you don't need to use browser or document tools, just respond normally to the user.`

interface ChatStore {
  messages: Message[]
  isStreaming: boolean
  streamingMessageId: string | null
  isExecutingTools: boolean
  pendingToolCalls: ToolCall[]
  isResearching: boolean
  researchProgress: string | null
  lastBrowserContext: {
    url: string
    title: string
    accessibilityTree: string
    screenshot: string | null
  } | null
  cachedBrowserContext: {
    context: {
      url: string
      title: string
      accessibilityTree: string
      screenshot: string | null
    }
    timestamp: number
    url: string
  } | null

  // Document edit confirmation state
  pendingDocumentEdit: PendingDocumentEdit | null
  isAwaitingEditConfirmation: boolean
  isProcessingConfirmation: boolean
  pendingEditToolCallContext: {
    agentId: string
    params: { provider: string; model: string; systemPrompt?: string }
    remainingToolCalls: ToolCall[]
  } | null

  // Actions
  loadMessages: (agentId: string) => Promise<void>
  sendMessage: (content: string, agentId: string, params: { provider: string; model: string; systemPrompt?: string; useDeepResearch?: boolean; attachment?: Attachment; attachments?: Attachment[] }) => Promise<void>
  executeDeepResearch: (userPrompt: string, agentId: string) => Promise<void>
  executeToolCalls: (toolCalls: ToolCall[], agentId: string, params: { provider: string; model: string; systemPrompt?: string }) => Promise<void>
  handleDocumentEditConfirmation: (approved: boolean) => Promise<void>
  clearMessages: () => void
}

// Maximum number of messages to include in conversation history (cost optimization)
const MAX_HISTORY_MESSAGES = 20

// Context cache TTL in milliseconds (5 seconds)
const CONTEXT_CACHE_TTL = 5000

// Maximum number of accessibility tree elements (cost optimization)
const MAX_A11Y_ELEMENTS = 20 // Reduced from 30 for cost savings

/**
 * Fetches current browser context (URL, title, accessibility tree)
 * Screenshot is NOT included by default for cost savings - LLM can request via screenshot tool
 * Uses caching to avoid redundant captures (cost optimization)
 * @param includeScreenshot - Only true when LLM explicitly requests via tool
 * @param maxElements - Maximum number of accessibility tree elements to include (default 30)
 * @param forceRefresh - Force refresh even if cache is valid
 */
async function getBrowserContext(
  includeScreenshot: boolean = false,
  maxElements: number = MAX_A11Y_ELEMENTS,
  forceRefresh: boolean = false
): Promise<{
  url: string
  title: string
  accessibilityTree: string
  screenshot: string | null
}> {
  // Check if we're on a document tab - skip browser context extraction
  // This prevents CDP errors when no browser view is active
  const activeTabType = useTabStore.getState().getActiveTabType()
  if (activeTabType === 'document') {
    console.log('[Context] Skipping browser context - document tab is active')
    return {
      url: '',
      title: '',
      accessibilityTree: 'No browser tab is currently active. You are viewing a document.',
      screenshot: null,
    }
  }

  const store = useChatStore.getState()
  const cached = store.cachedBrowserContext

  // Check if we can use cached context
  if (!forceRefresh && cached) {
    const currentState = await ipc.browser.getState()

    // Reuse cache if:
    // - URL hasn't changed
    // - Cache is less than TTL old
    // - Screenshot requirement matches (or cached has screenshot when we need it)
    if (currentState.success && currentState.state?.url === cached.url) {
      const age = Date.now() - cached.timestamp
      if (age < CONTEXT_CACHE_TTL) {
        // If we need screenshot but cache doesn't have it, we still need to refresh
        if (includeScreenshot && !cached.context.screenshot) {
          // Fall through to refresh
        } else {
          console.log('[Context Cache] Using cached context (age:', age, 'ms)')
          return cached.context
        }
      }
    }
  }

  try {
    // Fetch fresh context (only capture screenshot if requested)
    const response = await ipc.browser.getContext(includeScreenshot)
    if (response.success && response.context) {
      // Format accessibility tree for LLM - prioritize inputs/textboxes, then limit others
      const a11yTree = response.context.accessibilityTree || []

      // CRITICAL FIX: Always include ALL inputs/textboxes, limit others
      // This ensures search inputs are never hidden from LLM
      const inputRoles = ['textbox', 'searchbox', 'combobox']
      const inputs = a11yTree.filter((n: any) => inputRoles.includes(n.role))
      const others = a11yTree.filter((n: any) => !inputRoles.includes(n.role))

      // Prioritize inputs: include all inputs, then fill remaining slots with others
      const remainingSlots = Math.max(0, maxElements - inputs.length)
      const truncatedOthers = others.slice(0, remainingSlots)
      const prioritizedTree = [...inputs, ...truncatedOthers]

      const formattedTree = prioritizedTree.length > 0
        ? prioritizedTree.map((node: any, i: number) => {
          const parts = [`${i + 1}. [${node.role}] "${node.name || '(no label)'}"`]
          if (node.value) parts.push(`   Value: "${node.value}"`)
          // Add input-specific info for better LLM context
          if (inputRoles.includes(node.role)) {
            // Try to extract placeholder/type from selector or add note
            if (node.selector && node.selector.includes('[name=')) {
              const nameMatch = node.selector.match(/\[name=["']([^"']+)["']\]/);
              if (nameMatch) {
                parts.push(`   Name attribute: ${nameMatch[1]}`)
              }
            }
          }
          if (node.selector) parts.push(`   Selector: ${node.selector}`)
          return parts.join('\n')
        }).join('\n\n') + (a11yTree.length > maxElements ? `\n\n... and ${a11yTree.length - maxElements} more elements (use scroll to reveal)` : '')
        : 'No interactive elements found on this page.'

      const context = {
        url: response.context.url || '',
        title: response.context.title || '',
        accessibilityTree: formattedTree,
        // Only include screenshot if explicitly requested (saves ~1500-2500 tokens per request)
        screenshot: includeScreenshot ? (response.context.screenshot || null) : null,
      }

      // Update cache
      useChatStore.setState({
        cachedBrowserContext: {
          context,
          timestamp: Date.now(),
          url: context.url,
        },
      })

      return context
    }
  } catch (error) {
    console.error('Failed to get browser context:', error)
  }

  // Return empty context if no browser tab available or extraction failed
  return {
    url: '',
    title: '',
    accessibilityTree: 'No browser context available.',
    screenshot: null,
  }
}

/**
 * Builds the user message with browser context prepended
 */
function buildContextualMessage(userContent: string, context: {
  url: string
  title: string
  accessibilityTree: string
}): string {
  if (!context.url) {
    // No browser context available
    return userContent
  }

  return `## Current Browser State

**URL:** ${context.url}
**Title:** ${context.title}

### Interactive Elements on Page:
${context.accessibilityTree}

---

## User Request:
${userContent}`
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  isExecutingTools: false,
  pendingToolCalls: [],
  isResearching: false,
  researchProgress: null,
  lastBrowserContext: null,
  cachedBrowserContext: null,

  // Document edit confirmation state
  pendingDocumentEdit: null,
  isAwaitingEditConfirmation: false,
  isProcessingConfirmation: false,
  pendingEditToolCallContext: null,

  loadMessages: async (agentId: string) => {
    try {
      const messages = await ipc.message.getByAgent(agentId)
      set({ messages })
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ messages: [] })
    }
  },

  sendMessage: async (content: string, agentId: string, params: { provider: string; model: string; systemPrompt?: string; useDeepResearch?: boolean; attachment?: Attachment; attachments?: Attachment[] }) => {
    const { messages, executeToolCalls } = get()

    // Check if deep research is requested
    if (params.useDeepResearch) {
      await get().executeDeepResearch(content, agentId)
      return
    }

    // Collect all attachments (support both single attachment and multiple)
    const allAttachments: Attachment[] = [
      ...(params.attachments || []),
      ...(params.attachment ? [params.attachment] : []),
    ]

    // Create user message (store original content for display)
    const userMessage: Omit<Message, 'id' | 'createdAt'> = {
      agentId,
      role: 'user',
      content,
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
    }

    try {
      // Save user message
      const savedUserMessage = await ipc.message.create(userMessage)
      set({ messages: [...messages, savedUserMessage] })

      // LOCAL MODEL OPTIMIZATION: Check for search intent before expensive LLM call
      try {
        const searchIntentResult = await ipc.localModel.classifySearchIntent(content)
        if (searchIntentResult.success && searchIntentResult.intent?.isSearch) {
          const intent = searchIntentResult.intent
          console.log('[Local Model] Search intent detected:', {
            query: intent.query,
            searchEngine: intent.searchEngine,
            needsPremiumModel: intent.needsPremiumModel,
            confidence: intent.confidence,
          })

          // If it's a simple search (doesn't need premium model), handle it directly
          if (!intent.needsPremiumModel && intent.query && intent.confidence >= 0.7) {
            console.log('[Local Model] Handling simple search directly (skipping expensive LLM)')

            // Build search URL
            const searchUrl = buildSearchUrl(intent.query, intent.searchEngine || 'google')

            // Create assistant message to show we're searching
            const assistantMessage: Omit<Message, 'id' | 'createdAt'> = {
              agentId,
              role: 'assistant',
              content: `Searching for "${intent.query}"...`,
            }
            const savedAssistantMessage = await ipc.message.create(assistantMessage)
            set({
              isStreaming: true,
              streamingMessageId: savedAssistantMessage.id,
              messages: [...get().messages, savedAssistantMessage]
            })

            // Navigate to search URL
            await ipc.browser.navigate(searchUrl)

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000))

            // Try to extract search results using local model
            const browserState = await ipc.browser.getState()
            if (browserState.success && isSearchEngineUrl(browserState.state?.url || '')) {
              // Extract page text for local model processing
              const extractResult = await ipc.browser.executeTool({
                name: 'extract',
                arguments: { selector: 'body' },
                id: uuidv4(),
                timestamp: new Date(),
              })

              if (extractResult.success && extractResult.result?.value) {
                const pageText = extractResult.result.value
                const extractResults = await ipc.localModel.extractSearchResults(pageText, intent.query)

                if (extractResults.success && extractResults.results && extractResults.results.length > 0) {
                  const results = extractResults.results
                  // Format results for display
                  const resultsText = results
                    .slice(0, 5) // Top 5 results
                    .map((r: any, i: number) =>
                      `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
                    )
                    .join('\n\n')

                  // Update assistant message with results
                  const updatedMessages = get().messages.map(m =>
                    m.id === savedAssistantMessage.id
                      ? { ...m, content: `Found ${results.length} results for "${intent.query}":\n\n${resultsText}` }
                      : m
                  )
                  set({
                    messages: updatedMessages,
                    isStreaming: false,
                    streamingMessageId: null
                  })
                  return // Exit early - we've handled the search
                }
              }
            }

            // If local model extraction failed, fall through to expensive LLM
            console.log('[Local Model] Local extraction failed, falling back to expensive LLM')
            set({
              isStreaming: false,
              streamingMessageId: null
            })
            // Remove the placeholder message and continue with normal flow
            set({ messages: get().messages.filter(m => m.id !== savedAssistantMessage.id) })
          }
        }
      } catch (error) {
        console.warn('[Local Model] Search intent detection failed, continuing with normal flow:', error)
        // Continue with normal expensive LLM flow
      }

      // Capture browser context BEFORE sending to LLM
      console.log('Capturing browser context...')
      const browserContext = await getBrowserContext()
      set({ lastBrowserContext: browserContext })
      console.log('Browser context captured:', {
        url: browserContext.url,
        hasScreenshot: !!browserContext.screenshot,
        a11yTreeLength: browserContext.accessibilityTree.length,
      })

      // Create assistant message placeholder
      const assistantMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'assistant',
        content: '',
      }
      const savedAssistantMessage = await ipc.message.create(assistantMessage)

      set({
        isStreaming: true,
        streamingMessageId: savedAssistantMessage.id,
        messages: [...get().messages, savedAssistantMessage]
      })

      // Check model capabilities
      const capabilities = await ipc.llm.getModelCapabilities(params.provider, params.model)

      // Build contextual message with browser state
      // For chat-only models, use simpler context without browser automation prompts
      // If user sent only an image (no text), provide a default prompt
      const userContent = content.trim() || (params.attachment?.type === 'image' ? 'What is in this image?' : '')
      const contextualContent = capabilities?.supportsTools
        ? buildContextualMessage(userContent, browserContext)
        : userContent  // Chat-only models get plain content

      // Build the full system prompt (only include browser automation prompt if model supports tools)
      const fullSystemPrompt = capabilities?.supportsTools
        ? (params.systemPrompt
          ? `${BROWSER_AGENT_SYSTEM_PROMPT}\n\n## Additional Instructions:\n${params.systemPrompt}`
          : BROWSER_AGENT_SYSTEM_PROMPT)
        : params.systemPrompt || 'You are a helpful AI assistant.'

      // Prepare chat params with context
      // Truncate conversation history to last MAX_HISTORY_MESSAGES for cost optimization
      const allMessages = get().messages
      const historyMessages = allMessages.slice(0, -1) // Exclude current assistant placeholder
      const truncatedHistory = historyMessages.slice(-MAX_HISTORY_MESSAGES)

      console.log(`[Cost Optimization] Truncated history from ${historyMessages.length} to ${truncatedHistory.length} messages`)

      // Collect legacy images for browser screenshots (keep for backward compatibility)
      const imagesToSend: string[] = []
      if (capabilities?.supportsVision && browserContext.screenshot) {
        imagesToSend.push(browserContext.screenshot)
      }

      const chatParams: ChatParams & { provider: string } = {
        provider: params.provider,
        model: params.model,
        messages: [
          // Include truncated previous messages (without re-adding context to old messages)
          ...truncatedHistory.map(m => ({
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls,
          })),
          // Add current message with context
          { role: 'user' as const, content: contextualContent },
        ],
        systemPrompt: fullSystemPrompt,
        stream: true,
        // Include browser screenshot via legacy images field
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
        // Include user-attached files via new attachments field
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      }

      // Stream LLM response
      const chunks = await ipc.llm.stream(chatParams)

      let fullContent = ''
      let collectedToolCalls: ToolCall[] = []

      for (const chunk of chunks) {
        if (chunk.error) {
          console.error('LLM stream error:', chunk.error)
          set({
            isStreaming: false,
            streamingMessageId: null
          })
          const updatedMessages = get().messages.map(m =>
            m.id === savedAssistantMessage.id
              ? { ...m, content: `Error: ${chunk.error}` }
              : m
          )
          set({ messages: updatedMessages })
          return
        }

        if (chunk.content) {
          fullContent += chunk.content
          const updatedMessages = get().messages.map(m =>
            m.id === savedAssistantMessage.id
              ? { ...m, content: fullContent }
              : m
          )
          set({ messages: updatedMessages })
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          collectedToolCalls = [...collectedToolCalls, ...chunk.toolCalls]
          console.log('Tool calls received:', chunk.toolCalls)
        }
      }

      // Update final message content and tool calls
      const finalMessages = get().messages.map(m =>
        m.id === savedAssistantMessage.id
          ? { ...m, content: fullContent, toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined }
          : m
      )
      set({ messages: finalMessages })

      // Persist the final assistant message to database
      await ipc.message.update(savedAssistantMessage.id, {
        content: fullContent,
        toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
      })

      // Stop streaming
      set({
        isStreaming: false,
        streamingMessageId: null
      })

      // If we have tool calls, execute them
      if (collectedToolCalls.length > 0) {
        await executeToolCalls(collectedToolCalls, agentId, params)
      }

    } catch (error) {
      console.error('Failed to send message:', error)
      set({
        isStreaming: false,
        streamingMessageId: null
      })
    }
  },

  executeToolCalls: async (toolCalls: ToolCall[], agentId: string, params: { provider: string; model: string; systemPrompt?: string }) => {
    set({ isExecutingTools: true, pendingToolCalls: toolCalls })

    try {
      // Execute each tool call and collect results
      const toolResults: Array<{ toolCall: ToolCall; result: any; success: boolean; error?: string }> = []

      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i]
        const fullToolCall: ToolCall = {
          ...toolCall,
          id: toolCall.id || uuidv4(),
          timestamp: toolCall.timestamp || new Date(),
          agentId, // Add agentId for document tools
        }

        console.log(`Executing tool: ${fullToolCall.name}`, fullToolCall.arguments)

        const response = await ipc.browser.executeTool(fullToolCall)

        // Check if this is a document edit that requires confirmation
        if (
          fullToolCall.name === 'editDocument' &&
          response.success &&
          response.result?.requiresConfirmation &&
          response.result?.pendingEditId
        ) {
          console.log('[ChatStore] Document edit requires confirmation, pausing execution')

          // Fetch the pending edit details
          const pendingResult = await ipc.documentEdit.getPending(agentId)
          const pendingEdit = pendingResult.edits?.find(
            (e: { id: string }) => e.id === response.result.pendingEditId
          )

          if (pendingEdit) {
            // Store remaining tool calls and pause
            const remainingToolCalls = toolCalls.slice(i + 1)

            set({
              pendingDocumentEdit: pendingEdit,
              isAwaitingEditConfirmation: true,
              isExecutingTools: false,
              pendingEditToolCallContext: {
                agentId,
                params,
                remainingToolCalls,
              },
            })

            // Add partial tool result to chat
            const partialToolMessage: Omit<Message, 'id' | 'createdAt'> = {
              agentId,
              role: 'tool',
              content: `**editDocument** requires your confirmation. Please review the proposed changes.`,
              toolCalls: [
                {
                  ...fullToolCall,
                  result: { requiresConfirmation: true, operation: pendingEdit.operation },
                },
              ],
            }
            const savedPartialMessage = await ipc.message.create(partialToolMessage)
            set({ messages: [...get().messages, savedPartialMessage] })

            return // Exit tool execution loop - will resume after confirmation
          }
        }

        toolResults.push({
          toolCall: fullToolCall,
          result: response.result,
          success: response.success,
          error: response.error,
        })

        console.log(`Tool ${fullToolCall.name} result:`, response)
      }

      // Create tool result message for display
      const toolResultContent = toolResults.map(tr => {
        const status = tr.success ? '✓' : '✗'
        const resultStr = tr.success
          ? JSON.stringify(tr.result, null, 2)
          : tr.error
        return `${status} **${tr.toolCall.name}**${tr.toolCall.arguments?.elementDescription ? ` (${tr.toolCall.arguments.elementDescription})` : ''}\n\`\`\`json\n${resultStr}\n\`\`\``
      }).join('\n\n')

      // Save tool message
      const toolMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'tool',
        content: toolResultContent,
        toolCalls: toolCalls.map((tc, i) => ({
          ...tc,
          id: tc.id || uuidv4(),
          timestamp: tc.timestamp || new Date(),
          result: toolResults[i]?.result,
          error: toolResults[i]?.error,
        })),
      }

      const savedToolMessage = await ipc.message.create(toolMessage)
      set({ messages: [...get().messages, savedToolMessage] })

      // Wait a moment for the page to update after tool execution
      await new Promise(resolve => setTimeout(resolve, 500))

      // Check if any tool call was a screenshot request
      const hasScreenshotRequest = toolCalls.some(tc => tc.name === 'screenshot')

      // Capture FRESH browser context after tool execution
      // Force refresh since page may have changed, and include screenshot if requested
      console.log('Capturing fresh browser context after tool execution...')
      const freshContext = await getBrowserContext(hasScreenshotRequest, MAX_A11Y_ELEMENTS, true) // forceRefresh = true
      set({ lastBrowserContext: freshContext })
      console.log('Fresh context captured:', {
        url: freshContext.url,
        hasScreenshot: !!freshContext.screenshot,
      })

      // Build follow-up message with fresh context
      // Truncate history again for cost optimization
      const allMessagesForFollowUp = get().messages
      const followUpHistory = allMessagesForFollowUp.slice(0, -1) // Exclude current follow-up assistant placeholder
      const truncatedFollowUpHistory = followUpHistory.slice(-MAX_HISTORY_MESSAGES)

      console.log(`[Cost Optimization] Truncated follow-up history from ${followUpHistory.length} to ${truncatedFollowUpHistory.length} messages`)

      const followUpMessages = truncatedFollowUpHistory.map(m => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
      }))

      // Add tool results WITH fresh browser context
      const contextWithResults = `## Tool Execution Results:
${toolResultContent}

## Updated Browser State After Actions:

**URL:** ${freshContext.url}
**Title:** ${freshContext.title}

### Current Interactive Elements:
${freshContext.accessibilityTree}

---

Based on the tool results and current page state, please continue with the task or let the user know what was accomplished.`

      followUpMessages.push({
        role: 'tool' as const,
        content: contextWithResults,
        toolCalls: undefined,
      })

      // Create assistant placeholder for follow-up
      const followUpAssistant: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'assistant',
        content: '',
      }
      const savedFollowUp = await ipc.message.create(followUpAssistant)

      set({
        isStreaming: true,
        streamingMessageId: savedFollowUp.id,
        messages: [...get().messages, savedFollowUp],
        isExecutingTools: false,
        pendingToolCalls: [],
      })

      // Check model capabilities
      const capabilities = await ipc.llm.getModelCapabilities(params.provider, params.model)

      // Build system prompt (only include browser automation prompt if model supports tools)
      const fullSystemPrompt = capabilities?.supportsTools
        ? (params.systemPrompt
          ? `${BROWSER_AGENT_SYSTEM_PROMPT}\n\n## Additional Instructions:\n${params.systemPrompt}`
          : BROWSER_AGENT_SYSTEM_PROMPT)
        : params.systemPrompt || 'You are a helpful AI assistant.'

      // Get LLM follow-up response with fresh context
      const chatParams: ChatParams & { provider: string } = {
        provider: params.provider,
        model: params.model,
        messages: followUpMessages,
        systemPrompt: fullSystemPrompt,
        stream: true,
        // Include fresh screenshot only if model supports vision
        images: (capabilities?.supportsVision && freshContext.screenshot) ? [freshContext.screenshot] : undefined,
      }

      const chunks = await ipc.llm.stream(chatParams)

      let fullContent = ''
      let newToolCalls: ToolCall[] = []

      for (const chunk of chunks) {
        if (chunk.error) {
          console.error('LLM follow-up error:', chunk.error)
          const updatedMessages = get().messages.map(m =>
            m.id === savedFollowUp.id
              ? { ...m, content: `Error: ${chunk.error}` }
              : m
          )
          set({ messages: updatedMessages, isStreaming: false, streamingMessageId: null })
          return
        }

        if (chunk.content) {
          fullContent += chunk.content
          const updatedMessages = get().messages.map(m =>
            m.id === savedFollowUp.id
              ? { ...m, content: fullContent }
              : m
          )
          set({ messages: updatedMessages })
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          newToolCalls = [...newToolCalls, ...chunk.toolCalls]
        }
      }

      // Final update
      const finalMessages = get().messages.map(m =>
        m.id === savedFollowUp.id
          ? { ...m, content: fullContent, toolCalls: newToolCalls.length > 0 ? newToolCalls : undefined }
          : m
      )
      set({ messages: finalMessages, isStreaming: false, streamingMessageId: null })

      // Persist the follow-up assistant message to database
      await ipc.message.update(savedFollowUp.id, {
        content: fullContent,
        toolCalls: newToolCalls.length > 0 ? newToolCalls : undefined,
      })

      // If there are more tool calls, continue the loop
      if (newToolCalls.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500))
        await get().executeToolCalls(newToolCalls, agentId, params)
      }

    } catch (error) {
      console.error('Failed to execute tool calls:', error)
      set({
        isExecutingTools: false,
        pendingToolCalls: [],
        isStreaming: false,
        streamingMessageId: null,
      })
    }
  },

  executeDeepResearch: async (userPrompt: string, agentId: string) => {
    const { messages } = get()

    try {
      console.log('[Deep Research] Starting research for:', userPrompt)

      // Save user message
      const userMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'user',
        content: userPrompt,
      }
      const savedUserMessage = await ipc.message.create(userMessage)
      set({ messages: [...messages, savedUserMessage] })

      // Start research
      set({ isResearching: true, researchProgress: 'Starting deep research...' })

      // Execute deep research with agentId
      const result = await ipc.research.deepResearch(userPrompt, agentId)

      if (!result.success) {
        throw new Error(result.error || 'Deep research failed')
      }

      const researchResult = result.result

      // Create assistant message with research results
      const assistantMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'assistant',
        content: researchResult.response + '\n\n---\n\n**Sources:**\n' +
          researchResult.sources.map((s: any, i: number) =>
            `${i + 1}. [${s.title || s.domain}](${s.url})`
          ).join('\n'),
      }

      const savedAssistantMessage = await ipc.message.create(assistantMessage)
      set({
        messages: [...get().messages, savedAssistantMessage],
        isResearching: false,
        researchProgress: null,
      })

      console.log('[Deep Research] Complete:', {
        sources: researchResult.sources.length,
        facts: researchResult.factsVerified,
        time: `${(researchResult.stats.totalTimeMs / 1000).toFixed(1)}s`,
        confidence: researchResult.confidence
      })
    } catch (error) {
      console.error('[Deep Research] Error:', error)
      set({
        isResearching: false,
        researchProgress: null,
      })

      // Create error message
      const errorMessage: Omit<Message, 'id' | 'createdAt'> = {
        agentId,
        role: 'assistant',
        content: `Deep research failed: ${error instanceof Error ? error.message : String(error)}`,
      }

      const savedErrorMessage = await ipc.message.create(errorMessage)
      set({ messages: [...get().messages, savedErrorMessage] })
    }
  },

  handleDocumentEditConfirmation: async (approved: boolean) => {
    const { pendingDocumentEdit, pendingEditToolCallContext } = get()

    if (!pendingDocumentEdit || !pendingEditToolCallContext) {
      console.error('[ChatStore] No pending document edit to confirm')
      return
    }

    set({ isProcessingConfirmation: true })

    try {
      if (approved) {
        // Approve the edit
        const result = await ipc.documentEdit.approve(pendingDocumentEdit.id)
        if (!result.success) {
          console.error('[ChatStore] Failed to apply document edit:', result.error)
          // Add error message to chat
          const errorMessage: Message = {
            id: uuidv4(),
            agentId: pendingEditToolCallContext.agentId,
            role: 'tool',
            content: `Document edit failed: ${result.error}`,
            createdAt: new Date(),
          }
          const savedError = await ipc.message.create(errorMessage)
          set({ messages: [...get().messages, savedError] })
        } else {
          console.log('[ChatStore] Document edit applied successfully')
        }
      } else {
        // Reject the edit
        await ipc.documentEdit.reject(pendingDocumentEdit.id)
        console.log('[ChatStore] Document edit rejected by user')
      }

      // Clear confirmation state
      set({
        pendingDocumentEdit: null,
        isAwaitingEditConfirmation: false,
        isProcessingConfirmation: false,
      })

      // Resume remaining tool calls if any
      const { remainingToolCalls, agentId, params } = pendingEditToolCallContext
      set({ pendingEditToolCallContext: null })

      if (remainingToolCalls.length > 0) {
        console.log('[ChatStore] Resuming remaining tool calls:', remainingToolCalls.length)
        await get().executeToolCalls(remainingToolCalls, agentId, params)
      }
    } catch (error) {
      console.error('[ChatStore] Error handling document edit confirmation:', error)
      set({
        pendingDocumentEdit: null,
        isAwaitingEditConfirmation: false,
        isProcessingConfirmation: false,
        pendingEditToolCallContext: null,
      })
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      isStreaming: false,
      streamingMessageId: null,
      isExecutingTools: false,
      pendingToolCalls: [],
      lastBrowserContext: null,
      cachedBrowserContext: null,
      pendingDocumentEdit: null,
      isAwaitingEditConfirmation: false,
      isProcessingConfirmation: false,
      pendingEditToolCallContext: null,
    })
  },
}))
