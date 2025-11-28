// Shared type definitions across main and renderer processes

export type LLMProviderId = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'local'

export interface Agent {
  id: string                    // UUID
  name: string                  // User-defined or auto-generated
  createdAt: Date
  updatedAt: Date
  model: string                 // e.g., "gpt-4o", "claude-sonnet-4-20250514"
  provider: LLMProviderId
  systemPrompt?: string         // Optional custom system prompt
  browserState?: BrowserState   // Current browser context
}

export interface Message {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  attachments?: Attachment[]    // Screenshots, files, etc.
  toolCalls?: ToolCall[]        // Browser actions executed
  tokenCount?: number
  createdAt: Date
}

export type AttachmentType = 'image' | 'document' | 'text' | 'code'

export interface Attachment {
  type: AttachmentType
  data: string                  // Base64 data URI (data:mimetype;base64,...)
  name: string                  // Original filename
  mimeType: string              // MIME type (e.g., 'image/png', 'application/pdf')
  size: number                  // File size in bytes
  extractedText?: string        // For non-native formats, extracted text content
}

// Supported MIME types by category
export const SUPPORTED_MIME_TYPES = {
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
  ],
  document: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/msword', // .doc
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-powerpoint', // .ppt
    'application/rtf',
  ],
  text: [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/xml',
    'application/json',
    'application/xml',
  ],
  code: [
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-c++',
    'text/x-go',
    'text/x-rust',
    'text/x-ruby',
    'text/x-php',
    'text/x-swift',
    'text/x-kotlin',
    'text/x-scala',
    'text/x-sql',
    'text/x-shellscript',
    'text/x-yaml',
    'text/x-toml',
  ],
} as const

// File size limits per provider (in bytes)
export const FILE_SIZE_LIMITS = {
  anthropic: 32 * 1024 * 1024,  // 32MB
  openai: 32 * 1024 * 1024,     // 32MB
  gemini: 50 * 1024 * 1024,     // 50MB
  default: 32 * 1024 * 1024,    // 32MB fallback
} as const

export interface ToolCall {
  id: string
  name: string                  // Tool name (e.g., 'click', 'navigate')
  arguments: Record<string, any>
  result?: any
  error?: string
  timestamp: Date
  agentId?: string              // Agent context for document tools
}

export interface BrowserState {
  url: string
  title: string
  screenshot?: string           // Base64 for LLM context
  accessibilityTree?: A11yNode[]// Simplified DOM for LLM
  isLoading: boolean
}

export interface A11yNode {
  role: string                  // button, link, input, etc.
  name: string                  // Accessible name/label
  value?: string                // Current value for inputs
  selector: string              // CSS selector for action targeting
  bounds?: {                    // Position for vision-based fallback
    x: number
    y: number
    width: number
    height: number
  }
}

export interface BrowserTool {
  name: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'extract' | 'wait' | 'extractSearchResults' | 'createTab' | 'switchTab' | 'closeTab' | 'listTabs' | 'summarize' | 'extractKeyPoints' | 'summarizeSection'
  description: string
  parameters: JSONSchema
}

export interface JSONSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description: string
    enum?: string[]
  }>
  required?: string[]
}

// LLM Provider Types
export interface ChatChunk {
  content?: string
  toolCalls?: ToolCall[]
  done: boolean
  error?: string
}

export interface ChatParams {
  model: string
  messages: Omit<Message, 'id' | 'agentId' | 'createdAt'>[]
  systemPrompt?: string
  tools?: BrowserTool[]
  images?: string[]  // Base64 screenshots (legacy, prefer attachments)
  attachments?: Attachment[]  // File attachments (images, PDFs, documents, code)
  stream?: boolean
  temperature?: number
  maxTokens?: number
}

export interface ModelCapabilities {
  supportsVision: boolean
  supportsTools: boolean
}

export interface LLMProvider {
  id: string
  name: string
  models: string[]
  supportsVision: boolean  // Provider-level default (for backward compatibility)
  supportsTools: boolean   // Provider-level default (for backward compatibility)

  // Get capabilities for a specific model
  getModelCapabilities?(model: string): ModelCapabilities

  chat(params: ChatParams): AsyncIterable<ChatChunk>
}

// Document Types
export interface Document {
  id: string                    // UUID
  agentId: string               // Foreign key to agents table
  name: string                  // Original filename
  filePath: string              // Path relative to userData/documents/
  mimeType: string              // MIME type (e.g., 'application/pdf')
  fileSize: number              // File size in bytes
  extractedText?: string        // Cached extracted text for LLM
  createdAt: Date
  updatedAt: Date
}

// Tab Types
export interface Tab {
  id: string                    // UUID
  agentId: string               // Foreign key to agents table
  title: string                 // Page title or "New Tab"
  url: string                   // Current URL (for browser) or 'document://{documentId}' (for documents)
  favicon?: string              // Base64 favicon data
  isActive: boolean             // Whether this tab is currently displayed
  isPinned: boolean             // Pinned tabs stick to left
  position: number              // For ordering tabs
  type: 'browser' | 'document'   // Tab type - default 'browser' for backward compatibility
  documentId?: string            // Foreign key to documents table (only for document tabs)
  createdAt: Date
  updatedAt: Date
}

export interface TabHistoryEntry {
  id: string
  tabId: string                 // Foreign key to tabs table
  url: string
  title: string
  visitedAt: Date
  position: number              // For ordering in history stack
}

// Tab state for renderer (includes runtime state)
export interface TabState extends Tab {
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

// Tab creation params
export interface CreateTabParams {
  agentId: string
  url?: string
  title?: string
  makeActive?: boolean
  type?: 'browser' | 'document'
  documentId?: string
}

// Document creation params
export interface CreateDocumentParams {
  agentId: string
  name: string
  mimeType: string
  fileSize: number
  buffer: Buffer
  extractedText?: string
}

// ============================================================================
// Document Editing Types (LLM-driven document modification)
// ============================================================================

export type DocumentEditOperation = 'append' | 'insert' | 'replace' | 'delete'

export interface DocumentEditRequest {
  documentId: string
  operation: DocumentEditOperation
  content?: string           // Content to add/insert/replace with (not needed for delete)
  target: string             // Semantic region description (e.g., "end of file", "the function handleSubmit")
}

export interface ResolvedRegion {
  startLine: number          // 1-indexed
  endLine: number            // 1-indexed, inclusive
  confidence: 'exact' | 'probable' | 'ambiguous'
  matchedText?: string       // The text that was matched for context
}

export interface ResolutionResult {
  success: boolean
  region?: ResolvedRegion
  alternatives?: ResolvedRegion[]  // If ambiguous, list alternatives
  error?: string
}

export interface DocumentEditResult {
  success: boolean
  requiresConfirmation: boolean
  pendingEditId?: string     // ID for the pending edit if confirmation required
  preview?: DocumentEditPreview
  error?: string
  resolvedRegion?: ResolvedRegion  // The region that was resolved from the target
}

export interface DocumentEditPreview {
  documentId: string
  documentName: string
  operation: DocumentEditOperation
  beforeContent: string      // Content that will be affected (may be truncated)
  afterContent: string       // What it will look like after the edit (may be truncated)
  affectedLines: { start: number; end: number }
  totalLines: number         // Total lines in document for context
}

export interface PendingDocumentEdit {
  id: string
  documentId: string
  agentId: string
  operation: DocumentEditOperation
  editRequest: DocumentEditRequest
  resolvedRegion: ResolvedRegion
  preview: DocumentEditPreview
  status: 'pending' | 'approved' | 'rejected' | 'applied'
  createdAt: Date
}

// Document tool names for type safety
export type DocumentToolName = 'listDocuments' | 'readDocument' | 'getDocumentSummary' | 'createDocument' | 'editDocument'

