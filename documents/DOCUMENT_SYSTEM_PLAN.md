# Enterprise Document View & Editing System - Revised Implementation Plan

## Current State Analysis

### ✅ Already Implemented

1. **File Upload Infrastructure** (`src/main/files/file-processor.ts`)
   - Magic byte validation for file type detection
   - File size limit enforcement per provider
   - MIME type detection and categorization
   - Text extraction for text/code files
   - Base64 encoding for LLM submission
   - Support for: PDF, Office docs, Images, Text, Code files

2. **Attachment System** (`src/shared/types.ts`)
   - `Attachment` interface with type, data, name, mimeType, size, extractedText
   - `SUPPORTED_MIME_TYPES` constant with comprehensive type lists
   - `FILE_SIZE_LIMITS` per provider (32MB default, 50MB for Gemini)

3. **File IPC Handlers** (`src/main/ipc/files.ts`)
   - `file:process` - Process files from data URI
   - `file:validate` - Validate files before upload
   - Already integrated in `InputArea.tsx`

4. **File Upload UI** (`src/renderer/components/Chat/InputArea.tsx`)
   - File picker with preview
   - Multiple file support
   - File validation and error handling
   - File type icons

5. **File Display** (`src/renderer/components/Chat/MessageList.tsx`)
   - Image preview
   - Document cards with file info
   - File type icons

6. **LLM Integration**
   - OpenAI: Supports PDFs via file blocks, text extraction
   - Anthropic: Supports PDFs via document blocks, text extraction
   - Gemini: Text content extraction for all file types

### ❌ Missing Components

1. **Documents Table** - No persistence layer for documents (only attachments in messages)
2. **Document Tabs** - Tabs are browser-only, no document tab type
3. **Document Viewing UI** - No document viewer components
4. **Document Editing** - No editing capabilities
5. **File System Storage** - Files only stored as base64 in messages, not on disk
6. **Document-LLM Collaboration** - No document-specific LLM tools

---

## Revised Architecture

### Document Storage Strategy

**Two Storage Models:**
1. **Attachments** (existing) - Temporary files in messages, base64 encoded
2. **Documents** (new) - Persistent files on disk with database metadata

**When to use each:**
- **Attachments**: Quick file sharing in chat, temporary context
- **Documents**: Files user wants to edit, collaborate on, or reference later

### Database Schema Addition

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  name TEXT NOT NULL,
  filePath TEXT NOT NULL,           -- Path relative to userData/documents/
  mimeType TEXT NOT NULL,
  fileSize INTEGER NOT NULL,
  extractedText TEXT,                -- Cached extracted text for LLM
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
)

CREATE INDEX IF NOT EXISTS idx_documents_agentId ON documents(agentId);
CREATE INDEX IF NOT EXISTS idx_documents_updatedAt ON documents(updatedAt);
```

### Tab System Extension

**Current Tab Interface:**
```typescript
interface Tab {
  id: string
  agentId: string
  title: string
  url: string                    // Currently only URLs
  favicon?: string
  isActive: boolean
  isPinned: boolean
  position: number
  createdAt: Date
  updatedAt: Date
}
```

**Extended Tab Interface:**
```typescript
interface Tab {
  // ... existing fields
  type: 'browser' | 'document'  // NEW - default 'browser'
  documentId?: string            // NEW - only for document tabs
  url: string                    // For browser tabs: URL, for document tabs: 'document://{documentId}'
}
```

---

## Implementation Phases

### Phase 1: Database & File System Infrastructure

**Files to Modify:**
- `src/main/db/schema.ts` - Add documents table
- `src/main/db/queries.ts` - Add document CRUD operations
- `src/shared/types.ts` - Add Document interface

**New Files:**
- `src/main/documents/file-manager.ts` - File storage/retrieval utilities
- `src/main/documents/content-extractor.ts` - Enhanced text extraction (leverages file-processor.ts)

**Tasks:**
1. Add `documents` table to schema with migration support
2. Create `file-manager.ts`:
   - `saveDocument(buffer, filename, mimeType)` - Save to `userData/documents/{agentId}/{documentId}/`
   - `getDocumentPath(documentId)` - Get file path
   - `deleteDocument(documentId)` - Delete file and directory
   - `readDocument(documentId)` - Read file as Buffer
3. Add document queries:
   - `create`, `getById`, `getByAgent`, `update`, `delete`
4. Add `Document` type to `src/shared/types.ts`
5. Enhance `content-extractor.ts` to use `file-processor.ts` for Office doc extraction

**Key Integration Points:**
- Reuse `file-processor.ts` validation logic
- Reuse `SUPPORTED_MIME_TYPES` constants
- Reuse `FILE_SIZE_LIMITS` constants

---

### Phase 2: Tab System Enhancement

**Files to Modify:**
- `src/shared/types.ts` - Extend Tab interface
- `src/main/db/schema.ts` - Add `type` and `documentId` columns to tabs table (migration)
- `src/main/db/queries.ts` - Update tab queries to handle new fields
- `src/main/ipc/tabs.ts` - Support document tab creation
- `src/renderer/stores/tabStore.ts` - Handle document tabs
- `src/renderer/components/Browser/TabBar.tsx` - Show document tab icons
- `src/renderer/components/Browser/TabItem.tsx` - Display document vs browser indicators

**Tasks:**
1. Add `type: 'browser' | 'document'` field to Tab (default 'browser')
2. Add `documentId?: string` field to Tab (nullable)
3. Update database schema with migration:
   ```sql
   ALTER TABLE tabs ADD COLUMN type TEXT DEFAULT 'browser';
   ALTER TABLE tabs ADD COLUMN documentId TEXT;
   ```
4. Update `tabQueries` to handle new fields
5. Update `registerTabHandlers()` to support document tab creation:
   - New handler: `document:createTab` that creates document + tab
6. Update `tabStore.ts`:
   - Handle document tab loading
   - Filter tabs by type when needed
7. Update `TabBar.tsx`:
   - Show document icon for document tabs
   - Show browser icon for browser tabs
8. Update `TabItem.tsx`:
   - Visual distinction between tab types

**Key Integration Points:**
- Leverage existing tab management infrastructure
- Reuse tab positioning and pinning logic
- Maintain backward compatibility (existing tabs default to 'browser')

---

### Phase 3: Document Creation from Uploads

**Files to Modify:**
- `src/renderer/components/Chat/InputArea.tsx` - Add "Open as Document" option
- `src/main/ipc/handlers.ts` - Register document handlers
- `src/shared/ipc-channels.ts` - Add document IPC channels
- `src/renderer/lib/ipc.ts` - Add document IPC methods

**New Files:**
- `src/main/ipc/documents.ts` - Document IPC handlers

**Tasks:**
1. Add IPC channels:
   - `DOCUMENT_CREATE: 'document:create'` - Create document from file
   - `DOCUMENT_GET_BY_ID: 'document:getById'`
   - `DOCUMENT_GET_BY_AGENT: 'document:getByAgent'`
   - `DOCUMENT_UPDATE: 'document:update'`
   - `DOCUMENT_DELETE: 'document:delete'`
   - `DOCUMENT_CREATE_TAB: 'document:createTab'` - Create document + tab
2. Update `InputArea.tsx`:
   - Add "Open as Document" button/option for uploaded files
   - Show option in file preview area
   - Call `document:createTab` IPC when clicked
3. Create `src/main/ipc/documents.ts`:
   - `document:createTab` handler:
     - Process file using existing `file-processor.ts`
     - Save file to filesystem using `file-manager.ts`
     - Create document record in database
     - Create document tab
     - Return document + tab
   - Other CRUD handlers
4. Add document methods to `src/renderer/lib/ipc.ts`

**Key Integration Points:**
- Reuse `file-processor.ts` for validation and processing
- Reuse existing file upload UI flow
- Leverage existing attachment processing

---

### Phase 4: Document Panel Component

**New Files:**
- `src/renderer/components/Document/DocumentPanel.tsx` - Main container
- `src/renderer/components/Document/DocumentViewer.tsx` - Router component
- `src/renderer/components/Document/DocumentToolbar.tsx` - Toolbar with actions

**Files to Modify:**
- `src/renderer/App.tsx` - Conditionally render DocumentPanel or BrowserPanel
- `src/renderer/stores/tabStore.ts` - Track active tab type

**Tasks:**
1. Create `DocumentPanel.tsx`:
   - Similar structure to `BrowserPanel.tsx`
   - Shows document toolbar
   - Contains `DocumentViewer` component
   - Handles empty state
2. Create `DocumentViewer.tsx`:
   - Router component that selects viewer based on `mimeType`
   - Uses `SUPPORTED_MIME_TYPES` to determine viewer
   - Handles loading and error states
3. Create `DocumentToolbar.tsx`:
   - Save button
   - Export button
   - Properties button
   - LLM collaboration button
4. Update `App.tsx`:
   - Check active tab type
   - Render `DocumentPanel` for document tabs
   - Render `BrowserPanel` for browser tabs
5. Update `tabStore.ts`:
   - Add helper: `getActiveTabType()` returns 'browser' | 'document' | null

**Key Integration Points:**
- Mirror `BrowserPanel` structure for consistency
- Use existing dark theme styling
- Leverage existing tab state management

---

### Phase 5: Document Viewers Implementation

**Dependencies to Add:**
```json
{
  "react-pdf": "^7.5.1",
  "pdf-lib": "^1.17.1",
  "mammoth": "^1.6.0",
  "docx": "^8.5.0",
  "xlsx": "^0.18.5",
  "monaco-editor": "^0.44.0",
  "@monaco-editor/react": "^4.6.0",
  "react-image-crop": "^10.1.8",
  "@tiptap/react": "^2.1.13",
  "@tiptap/starter-kit": "^2.1.13"
}
```

**New Files:**
- `src/renderer/components/Document/viewers/PDFViewer.tsx`
- `src/renderer/components/Document/viewers/WordViewer.tsx`
- `src/renderer/components/Document/viewers/ExcelViewer.tsx`
- `src/renderer/components/Document/viewers/ImageViewer.tsx`
- `src/renderer/components/Document/viewers/MarkdownViewer.tsx`
- `src/renderer/components/Document/viewers/CodeViewer.tsx`
- `src/renderer/components/Document/viewers/TextViewer.tsx`

**Tasks:**
1. **PDF Viewer** (`PDFViewer.tsx`):
   - Use `react-pdf` for rendering
   - Zoom controls
   - Page navigation
   - Text selection (for LLM context)
2. **Word Viewer** (`WordViewer.tsx`):
   - Use `mammoth` to convert .docx to HTML
   - Render HTML with styling
   - Text selection
3. **Excel Viewer** (`ExcelViewer.tsx`):
   - Use `xlsx` to parse spreadsheet
   - Render as HTML table with styling
   - Cell selection
4. **Image Viewer** (`ImageViewer.tsx`):
   - Enhanced image display
   - Zoom and pan
   - Basic annotation tools
5. **Markdown Viewer** (`MarkdownViewer.tsx`):
   - Use Monaco Editor for editing
   - Markdown preview pane
   - Split view (edit/preview)
6. **Code Viewer** (`CodeViewer.tsx`):
   - Use Monaco Editor
   - Syntax highlighting
   - Language detection from file extension
7. **Text Viewer** (`TextViewer.tsx`):
   - Use Monaco Editor
   - Plain text editing

**Key Integration Points:**
- Use `extractedText` from document record for initial content loading
- Leverage existing file type detection from `file-processor.ts`
- Use `SUPPORTED_MIME_TYPES` for viewer selection

---

### Phase 6: Document Editing Capabilities

**New Files:**
- `src/renderer/components/Document/editors/` - Editor components
- `src/main/documents/document-processor.ts` - Process edits and save

**Files to Modify:**
- Each viewer component - Add edit mode toggle
- `DocumentToolbar.tsx` - Add save button functionality

**Tasks:**
1. **PDF Editing**:
   - Use `pdf-lib` for annotations
   - Add text annotations
   - Add highlights
   - Save annotations to PDF
2. **Word Editing**:
   - HTML editor (Tiptap) for content editing
   - Convert HTML back to .docx using `docx` library
   - Preserve formatting
3. **Excel Editing**:
   - Inline cell editing
   - Use `xlsx` to save changes
   - Preserve formulas
4. **Image Editing**:
   - Crop tool (`react-image-crop`)
   - Annotation tools (Canvas API)
   - Basic filters
5. **Markdown/Code/Text Editing**:
   - Direct editing in Monaco Editor
   - Auto-save on change (optional)
   - Undo/redo support
6. Create `document-processor.ts`:
   - `saveDocument(documentId, content)` - Save edited content
   - Handle different content types (Buffer, string, etc.)
   - Update `extractedText` cache
   - Update `updatedAt` timestamp

**Key Integration Points:**
- Reuse file format libraries already installed
- Leverage existing file save infrastructure
- Update document metadata on save

---

### Phase 7: LLM Integration for Document Collaboration

**New Files:**
- `src/main/documents/llm-integration.ts` - Document-LLM helpers
- `src/renderer/components/Document/LLMSuggestions.tsx` - Suggestions UI
- `src/renderer/components/Document/LLMCollaboration.tsx` - Collaboration panel

**Files to Modify:**
- `src/main/files/file-processor.ts` - Enhance Office doc text extraction
- `src/main/llm/tools.ts` - Add document tools (if exists, else create)
- `src/renderer/components/Chat/ChatPanel.tsx` - Include document context

**Tasks:**
1. **Enhance Text Extraction** (`file-processor.ts`):
   - Add `mammoth` for Word doc extraction
   - Add `xlsx` for Excel text extraction
   - Cache extracted text in document record
2. **Add Document Tools** (`src/main/llm/tools.ts`):
   - `analyze_document` - Analyze document content
   - `suggest_edits` - Suggest edits to document
   - `apply_edit` - Apply LLM-suggested edit
   - `extract_content` - Extract specific content
   - `summarize_document` - Summarize document
3. **Create LLM Integration** (`llm-integration.ts`):
   - `getDocumentContext(documentId)` - Get document text for LLM
   - `applyDocumentEdit(documentId, edit)` - Apply edit to document
   - `extractDocumentSection(documentId, section)` - Extract section
4. **Create Suggestions UI** (`LLMSuggestions.tsx`):
   - Display inline suggestions
   - Accept/reject buttons
   - Highlight suggested changes
5. **Create Collaboration Panel** (`LLMCollaboration.tsx`):
   - Chat interface for document
   - Document context automatically included
   - Quick actions (summarize, analyze, etc.)
6. **Update Chat Panel** (`ChatPanel.tsx`):
   - When document tab is active, include document context
   - Show document info in chat header

**Key Integration Points:**
- Leverage existing LLM provider infrastructure
- Use existing tool calling system
- Reuse attachment system for document context
- Integrate with existing chat flow

---

### Phase 8: UI Polish & User Experience

**Tasks:**
1. **Document Toolbar Enhancements**:
   - Export options (PDF, Word, etc.)
   - Share functionality
   - Properties panel (metadata, size, dates)
   - Version history (optional)
2. **Keyboard Shortcuts**:
   - Ctrl+S: Save document
   - Ctrl+E: Toggle edit mode
   - Ctrl+F: Search in document
   - Ctrl+Z/Y: Undo/Redo
3. **Drag & Drop**:
   - Drag files onto document panel to open
   - Drag files onto InputArea to upload
4. **Document Search**:
   - Search within document content
   - Highlight matches
   - Navigate between matches
5. **Loading States**:
   - Skeleton loaders for large documents
   - Progress indicators for saves
   - Error boundaries for unsupported formats
6. **Accessibility**:
   - Keyboard navigation
   - Screen reader support
   - ARIA labels
   - Focus management

---

## File Structure

```
src/
├── main/
│   ├── documents/                    # NEW
│   │   ├── file-manager.ts          # File storage/retrieval
│   │   ├── content-extractor.ts     # Enhanced text extraction
│   │   ├── document-processor.ts    # Process edits
│   │   └── llm-integration.ts       # LLM document helpers
│   ├── files/
│   │   └── file-processor.ts        # ✅ EXISTS - Leverage
│   ├── ipc/
│   │   ├── documents.ts             # NEW - Document IPC handlers
│   │   ├── files.ts                 # ✅ EXISTS
│   │   └── tabs.ts                  # ✅ EXISTS - Modify
│   └── db/
│       ├── schema.ts                # ✅ EXISTS - Modify
│       └── queries.ts               # ✅ EXISTS - Modify
├── renderer/
│   ├── components/
│   │   ├── Document/                # NEW
│   │   │   ├── DocumentPanel.tsx
│   │   │   ├── DocumentViewer.tsx
│   │   │   ├── DocumentToolbar.tsx
│   │   │   ├── LLMSuggestions.tsx
│   │   │   ├── LLMCollaboration.tsx
│   │   │   ├── viewers/
│   │   │   │   ├── PDFViewer.tsx
│   │   │   │   ├── WordViewer.tsx
│   │   │   │   ├── ExcelViewer.tsx
│   │   │   │   ├── ImageViewer.tsx
│   │   │   │   ├── MarkdownViewer.tsx
│   │   │   │   ├── CodeViewer.tsx
│   │   │   │   └── TextViewer.tsx
│   │   │   └── editors/
│   │   │       └── (editor components)
│   │   ├── Chat/
│   │   │   ├── InputArea.tsx        # ✅ EXISTS - Modify
│   │   │   ├── MessageList.tsx      # ✅ EXISTS
│   │   │   └── ChatPanel.tsx         # ✅ EXISTS - Modify
│   │   └── Browser/
│   │       ├── TabBar.tsx           # ✅ EXISTS - Modify
│   │       └── TabItem.tsx           # ✅ EXISTS - Modify
│   ├── stores/
│   │   └── tabStore.ts              # ✅ EXISTS - Modify
│   └── App.tsx                      # ✅ EXISTS - Modify
└── shared/
    ├── types.ts                      # ✅ EXISTS - Modify
    └── ipc-channels.ts               # ✅ EXISTS - Modify
```

---

## Key Technical Considerations

1. **File Size Limits**: Already enforced by `file-processor.ts` (32MB default, 50MB Gemini)
2. **Performance**: 
   - Lazy load document viewers
   - Virtualize large documents
   - Cache extracted text in database
3. **Security**: 
   - Already handled by `file-processor.ts` (magic byte validation)
   - Sanitize file paths (use `path.join`, prevent traversal)
   - Validate document IDs (UUID format)
4. **Memory Management**: 
   - Stream large files
   - Cleanup closed document viewers
   - Release file handles
5. **Error Handling**: 
   - Graceful degradation for unsupported formats
   - Clear error messages
   - Fallback to text extraction
6. **Backward Compatibility**: 
   - Existing tabs default to 'browser' type
   - Existing attachments continue to work
   - Migration script for database schema

---

## Success Metrics

- ✅ Users can upload files and choose to open as documents
- ✅ Documents persist on disk with database metadata
- ✅ Seamless switching between browser and document tabs
- ✅ View documents of all supported types
- ✅ Edit documents with changes persisting
- ✅ LLM can analyze and suggest edits to documents
- ✅ Document content available as context in chat
- ✅ Full bidirectional editing (user + LLM)

---

## Migration Strategy

1. **Database Migration**:
   - Add `documents` table
   - Add `type` and `documentId` columns to `tabs` table
   - Set default `type = 'browser'` for existing tabs
2. **File System**:
   - Create `userData/documents/` directory structure
   - Migrate existing attachments to documents (optional)
3. **Code Migration**:
   - Update Tab interface with optional fields
   - Update tab queries to handle new fields
   - Maintain backward compatibility

---

## Dependencies Summary

**New Dependencies:**
- `react-pdf`, `pdf-lib` - PDF viewing/editing
- `mammoth`, `docx` - Word document handling
- `xlsx` - Excel spreadsheet handling
- `monaco-editor`, `@monaco-editor/react` - Code/text editing
- `react-image-crop` - Image editing
- `@tiptap/react`, `@tiptap/starter-kit` - Rich text editing

**Existing Dependencies (Leveraged):**
- `better-sqlite3` - Database (already installed)
- `uuid` - ID generation (already installed)
- File processing utilities (already implemented)

---

## Implementation Priority

1. **Phase 1-2**: Foundation (Database + Tabs) - Critical path
2. **Phase 3**: Document Creation - Enables user workflow
3. **Phase 4-5**: Viewing - Core functionality
4. **Phase 6**: Editing - Enhanced functionality
5. **Phase 7**: LLM Integration - Collaboration features
6. **Phase 8**: Polish - User experience improvements

