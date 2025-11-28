import type { BrowserTool } from '../../shared/types'

export const BROWSER_TOOLS: BrowserTool[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL. Use this to go to a new webpage.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to (e.g., "https://example.com")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'click',
    description: 'Click an element on the page. Use the selector from the accessibility tree to target the element.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to click (from accessibility tree)',
        },
        elementDescription: {
          type: 'string',
          description: 'Description of what you are clicking (for logging/debugging)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input field, textarea, or contenteditable element.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the input element to type into',
        },
        text: {
          type: 'string',
          description: 'The text to type into the field',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Whether to clear existing text before typing (default: false)',
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page in a specific direction. Useful for revealing content below the fold.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          description: 'Direction to scroll',
          enum: ['up', 'down', 'left', 'right'],
        },
        amount: {
          type: 'number',
          description: 'Number of pixels to scroll (default: 500)',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'extract',
    description: 'Extract text content or attribute value from an element on the page.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to extract from',
        },
        attribute: {
          type: 'string',
          description: 'Attribute to extract (e.g., "textContent", "innerText", "href", "value"). Default: "textContent"',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page. Useful for visual context or verification.',
    parameters: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Whether to capture the full page or just the viewport (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'wait',
    description: 'Wait for an element to appear on the page or for a specified timeout. Useful after navigation or actions that trigger dynamic content.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of the element to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds (default: 5000)',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'extractSearchResults',
    description: 'Extract search results from a search engine results page (Google, Bing, or DuckDuckGo). Returns structured list of results with title, URL, and snippet. Use this after navigating to a search results page to get clickable links.',
    parameters: {
      type: 'object',
      properties: {
        engine: {
          type: 'string',
          description: 'Search engine to extract from (google, bing, or duckduckgo). If not specified, will auto-detect from current URL.',
          enum: ['google', 'bing', 'duckduckgo'],
        },
      },
      required: [],
    },
  },
  // Tab management tools
  {
    name: 'createTab',
    description: 'Create a new browser tab. Optionally navigate to a URL. Use this to open multiple pages simultaneously.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional URL to load in the new tab',
        },
        makeActive: {
          type: 'boolean',
          description: 'Whether to switch to the new tab (default: true)',
        },
      },
      required: [],
    },
  },
  {
    name: 'switchTab',
    description: 'Switch to a different browser tab by its ID or index. Use listTabs first to see available tabs.',
    parameters: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'The ID of the tab to switch to',
        },
        index: {
          type: 'number',
          description: 'The index (0-based) of the tab to switch to. Used if tabId is not specified.',
        },
      },
      required: [],
    },
  },
  {
    name: 'closeTab',
    description: 'Close a browser tab. Closes the current tab if no ID specified.',
    parameters: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'The ID of the tab to close. If not specified, closes the current active tab.',
        },
      },
      required: [],
    },
  },
  {
    name: 'listTabs',
    description: 'List all open browser tabs with their IDs, titles, and URLs. Use this to see what tabs are available before switching.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  // Content Summarization Tools
  {
    name: 'summarize',
    description: 'Summarize the current page or a specific section. Returns a concise summary of the content. Use this to quickly understand what a page is about without reading everything.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to summarize a specific element. If not provided, summarizes the entire page.',
        },
        length: {
          type: 'string',
          description: 'Desired summary length',
          enum: ['brief', 'medium', 'detailed'],
        },
        focus: {
          type: 'string',
          description: 'What to focus on in the summary (e.g., "main points", "key takeaways", "technical details", "overview")',
        },
      },
      required: [],
    },
  },
  {
    name: 'extractKeyPoints',
    description: 'Extract key points or bullet points from the current page. Returns a structured list of main ideas, facts, or takeaways. Useful for quickly understanding the main content.',
    parameters: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'Optional CSS selector to extract key points from a specific element. If not provided, extracts from the entire page.',
        },
        maxPoints: {
          type: 'number',
          description: 'Maximum number of key points to extract (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'summarizeSection',
    description: 'Summarize a specific section of the page identified by a heading or section name. Useful for long articles where you want to understand specific parts.',
    parameters: {
      type: 'object',
      properties: {
        sectionName: {
          type: 'string',
          description: 'Name or heading of the section to summarize (e.g., "Introduction", "Methodology", "Conclusion", "Pricing")',
        },
        length: {
          type: 'string',
          description: 'Desired summary length',
          enum: ['brief', 'medium', 'detailed'],
        },
      },
      required: ['sectionName'],
    },
  },
]

/**
 * Document editing tools - LLM-triggered document modification
 * These tools allow the LLM to read, create, and edit documents.
 */
export const DOCUMENT_TOOLS = [
  {
    name: 'listDocuments',
    description: 'List all documents available in the current agent context. Returns document IDs, names, types, and sizes. Use this to discover what documents are available before reading or editing.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'readDocument',
    description: `Read the content of a document. For Excel files, supports chunking to handle large files efficiently.

⚠️ COST WARNING: Reading large files can be expensive. For large file reviews, ALWAYS use gemini-2.5-flash model (~$0.075/1M tokens) to minimize costs. Other models can be 10-100x more expensive.

For Excel files (.xlsx, .xls):
- Use maxRows to limit rows returned (default: 1000 rows)
- Use startRow/endRow to read specific row ranges
- Use sheet to specify which sheet to read (default: first sheet)
- Use columns to filter specific columns by name

For large Excel files, start with maxRows=1000 to get an overview, then use startRow/endRow to read specific sections.

For text/code files, returns the full content.`,
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to read (get this from listDocuments)',
        },
        sheet: {
          type: 'string',
          description: 'For Excel files: name of the sheet to read (optional, defaults to first sheet)',
        },
        startRow: {
          type: 'number',
          description: 'For Excel files: starting row index (0-based, optional). Use with endRow to read a specific range.',
        },
        endRow: {
          type: 'number',
          description: 'For Excel files: ending row index (0-based, optional). Use with startRow to read a specific range.',
        },
        maxRows: {
          type: 'number',
          description: 'For Excel files: maximum number of rows to return (default: 1000). Use this to limit the size of large files.',
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'For Excel files: array of column names to include (optional). Filters to only these columns.',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'getDocumentSummary',
    description: `Get a summary and metadata about a document without reading the full content. Especially useful for Excel files to quickly understand structure before reading specific sections.

⚠️ COST WARNING: For large file reviews, ALWAYS use gemini-2.5-flash model (~$0.075/1M tokens). This tool is cost-efficient (~$0.0004), but reading full content can be expensive.

For Excel files, returns:
- Sheet names and row/column counts per sheet
- Column names for each sheet
- Sample data (first 5 rows)
- Total file statistics

Use this tool first for large Excel files to understand the structure, then use readDocument with specific parameters to read relevant sections.`,
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to summarize (get this from listDocuments)',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'createDocument',
    description: 'Create a new document with the specified content. Use this to create new text files, markdown documents, or code files. The file will be opened in a new document tab.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to create including extension (e.g., "notes.md", "script.py", "data.json")',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the new document',
        },
        mimeType: {
          type: 'string',
          description: 'Optional MIME type. If not specified, will be auto-detected from the file extension.',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'editDocument',
    description: `Edit an existing document. Supports four operations:
- "append": Add content to the end of the file (SAFE - applied immediately)
- "insert": Insert content at a specific location (SAFE - applied immediately)
- "replace": Replace content at a specific location (DESTRUCTIVE - requires user confirmation)
- "delete": Delete content at a specific location (DESTRUCTIVE - requires user confirmation)

The "target" parameter uses semantic descriptions to specify WHERE to apply the edit. Examples:
- "end of file" - Append at the very end
- "beginning of file" - Insert at line 1
- "after the imports" - After import/require statements
- "the function handleSubmit" - Target a specific function by name
- "the ## Installation section" - Target a markdown heading
- "lines 15-20" - Explicit line range
- "the paragraph containing 'pricing'" - Find by content`,
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document to edit',
        },
        operation: {
          type: 'string',
          description: 'Type of edit operation. "append" and "insert" are safe (auto-applied). "replace" and "delete" are destructive (require user confirmation).',
          enum: ['append', 'insert', 'replace', 'delete'],
        },
        content: {
          type: 'string',
          description: 'Content to add/insert/replace with. Required for append, insert, and replace operations. Not needed for delete.',
        },
        target: {
          type: 'string',
          description: 'Semantic description of WHERE to apply the edit. Use natural language like "end of file", "the function X", "after the imports", or explicit "lines 10-15".',
        },
      },
      required: ['documentId', 'operation', 'target'],
    },
  },
] as const

// Combined list of all tools (browser + document)
export const ALL_TOOLS = [...BROWSER_TOOLS, ...DOCUMENT_TOOLS]

// Helper to check if a tool is a document tool
export function isDocumentTool(toolName: string): boolean {
  return DOCUMENT_TOOLS.some(t => t.name === toolName)
}

/**
 * Converts all tools (browser + document) to provider-specific format
 */
export function getToolsForProvider(provider: string): any[] {
  return ALL_TOOLS.map((tool) => {
    if (provider === 'openai') {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }
    } else if (provider === 'anthropic') {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }
    } else if (provider === 'gemini') {
      // Gemini uses functionDeclarations format
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }
    } else {
      // Default format (OpenAI-style)
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }
    }
  })
}

