# Document System - Next Steps & Implementation Priorities

## Current Status ✅

### Completed
- ✅ Document upload and storage infrastructure
- ✅ Document tabs (unified with browser tabs)
- ✅ Document viewing for all major file types:
  - PDF Viewer (react-pdf)
  - Word Viewer (mammoth conversion)
  - Excel Viewer (xlsx parsing)
  - Image Viewer (zoom/pan)
  - Markdown Viewer (Monaco editor + preview)
  - Code Viewer (Monaco with syntax highlighting)
  - Text Viewer (Monaco editor)
- ✅ File reading via IPC
- ✅ Document metadata display

### Working Features
- Users can upload files and open as documents
- Documents appear in tabs with document icons
- Switching between browser and document tabs works
- Document viewers load and display content

---

## Next Steps (Priority Order)

### Phase 6: Document Editing & Save Functionality (HIGH PRIORITY)

**Current State**: Viewers can display content, but editing and saving are not fully implemented.

#### 6.1 Save Functionality
**Files to Modify:**
- `src/renderer/components/Document/DocumentPanel.tsx` - Implement Save button
- `src/main/documents/document-processor.ts` - Create document save processor
- `src/main/ipc/documents.ts` - Add save document handler

**Tasks:**
1. **Create document-processor.ts**:
   - `saveDocument(documentId, content)` - Save edited content
   - Handle different content types (string for text/code, Buffer for binary)
   - Update `extractedText` cache after save
   - Update `updatedAt` timestamp

2. **Add Save IPC Handler**:
   - `DOCUMENT_SAVE` channel
   - Accept documentId and content
   - Validate document exists
   - Save to filesystem
   - Update database

3. **Implement Save Button**:
   - Track document changes (dirty state)
   - Show "Save" button when document is modified
   - Show "Saved" indicator after successful save
   - Handle save errors

4. **Track Changes**:
   - Add `isDirty` state to document viewers
   - Track content changes in editable viewers (Monaco editors)
   - Warn before closing unsaved documents

#### 6.2 Editing Capabilities by Type

**Text/Code/Markdown Files**:
- ✅ Already editable in Monaco Editor
- ⚠️ Need: Save functionality, change tracking

**PDF Documents**:
- Add annotation tools (highlight, comment, text annotation)
- Use `pdf-lib` for PDF manipulation
- Save annotations to PDF

**Word Documents**:
- Convert HTML back to .docx using `docx` library
- Preserve formatting
- Handle complex formatting (tables, images, etc.)

**Excel Spreadsheets**:
- Inline cell editing
- Save changes using `xlsx` library
- Preserve formulas and formatting

**Images**:
- Crop tool (`react-image-crop`)
- Annotation tools (Canvas API)
- Basic filters/adjustments
- Save edited image

---

### Phase 7: LLM Integration for Document Collaboration (HIGH PRIORITY)

**Goal**: Enable LLM to analyze, suggest edits, and collaborate on documents.

#### 7.1 Document Content Extraction Enhancement
**Files to Modify:**
- `src/main/files/file-processor.ts` - Add Office doc text extraction
- `src/main/documents/content-extractor.ts` - Enhance extraction

**Tasks:**
1. **Add Office Document Extraction**:
   - Use `mammoth` for Word documents (extract text + structure)
   - Use `xlsx` for Excel (extract cell values + formulas)
   - Cache extracted content in document record

2. **Improve Text Extraction**:
   - Extract structured content (headings, lists, tables)
   - Preserve document structure for better LLM context
   - Extract metadata (author, creation date, etc.)

#### 7.2 Document Tools for LLM
**Files to Create/Modify:**
- `src/main/llm/tools.ts` - Add document tools (if exists, else create)
- `src/main/documents/llm-integration.ts` - Document-LLM helpers

**Tasks:**
1. **Add Document Tools**:
   ```typescript
   {
     name: 'analyze_document',
     description: 'Analyze document content and provide insights',
     parameters: { documentId: string, focus?: string }
   }
   {
     name: 'suggest_edits',
     description: 'Suggest edits to document content',
     parameters: { documentId: string, section?: string, instruction: string }
   }
   {
     name: 'apply_edit',
     description: 'Apply LLM-suggested edit to document',
     parameters: { documentId: string, edit: EditOperation }
   }
   {
     name: 'extract_content',
     description: 'Extract specific content from document',
     parameters: { documentId: string, query: string }
   }
   {
     name: 'summarize_document',
     description: 'Summarize document content',
     parameters: { documentId: string, length?: 'short' | 'medium' | 'long' }
   }
   ```

2. **Create LLM Integration Helpers**:
   - `getDocumentContext(documentId)` - Get document text for LLM
   - `applyDocumentEdit(documentId, edit)` - Apply edit to document
   - `extractDocumentSection(documentId, section)` - Extract section

#### 7.3 LLM Suggestions UI
**Files to Create:**
- `src/renderer/components/Document/LLMSuggestions.tsx` - Suggestions overlay
- `src/renderer/components/Document/LLMCollaboration.tsx` - Collaboration panel

**Tasks:**
1. **Create Suggestions Component**:
   - Display inline suggestions in document
   - Highlight suggested changes
   - Accept/reject buttons
   - Show suggestion source (which LLM model)

2. **Create Collaboration Panel**:
   - Chat interface for document-specific questions
   - Auto-include document context
   - Quick actions (summarize, analyze, improve)
   - Document-aware prompts

3. **Integrate with Chat**:
   - When document tab is active, include document context
   - Show document info in chat header
   - Allow LLM to reference document sections

---

### Phase 8: UI Enhancements & Polish (MEDIUM PRIORITY)

#### 8.1 Document Toolbar Enhancements
**Files to Modify:**
- `src/renderer/components/Document/DocumentToolbar.tsx` - Create/enhance toolbar

**Features to Add:**
1. **Export Options**:
   - Export PDF to different formats
   - Export Word to PDF/HTML
   - Export Excel to CSV
   - Export images to different formats

2. **Document Properties**:
   - Properties panel (metadata, size, dates)
   - Edit document name
   - View file path

3. **Version History** (Optional):
   - Track document versions
   - Revert to previous version
   - View change history

#### 8.2 Keyboard Shortcuts
**Implement:**
- `Ctrl+S` / `Cmd+S`: Save document
- `Ctrl+E` / `Cmd+E`: Toggle edit mode
- `Ctrl+F` / `Cmd+F`: Search in document
- `Ctrl+Z` / `Cmd+Z`: Undo
- `Ctrl+Y` / `Cmd+Y`: Redo
- `Ctrl+P` / `Cmd+P`: Print (for PDFs)

#### 8.3 Document Search
**Files to Create:**
- `src/renderer/components/Document/DocumentSearch.tsx`

**Features:**
- Search within document content
- Highlight matches
- Navigate between matches
- Search filters (case-sensitive, whole words)

#### 8.4 Drag & Drop
**Enhancement:**
- Drag files onto document panel to open
- Drag files onto InputArea to upload
- Visual feedback during drag

#### 8.5 Loading & Performance
**Optimizations:**
- Skeleton loaders for large documents
- Virtual scrolling for long documents
- Lazy load document viewers
- Progress indicators for saves
- Optimize PDF rendering for large files

---

## Implementation Priority

### Immediate (This Week)
1. ✅ **Save Functionality** - Critical for user workflow
2. ✅ **Change Tracking** - Know when document is modified
3. ✅ **Basic LLM Integration** - Analyze document tool

### Short Term (Next 2 Weeks)
4. **LLM Suggestions UI** - Visual feedback for LLM edits
5. **Document Tools** - Full set of LLM document tools
6. **Enhanced Editing** - PDF annotations, Excel cell editing

### Medium Term (Next Month)
7. **Document Search** - Find content within documents
8. **Keyboard Shortcuts** - Improve productivity
9. **Export Functionality** - Save in different formats
10. **Performance Optimizations** - Handle large documents

---

## Quick Wins (Can Implement Now)

1. **Save Button Functionality** (1-2 hours)
   - Add save handler
   - Track dirty state
   - Show save status

2. **Document Properties Panel** (1 hour)
   - Show metadata
   - Edit document name
   - View file info

3. **Basic LLM Analyze Tool** (2-3 hours)
   - Add analyze_document tool
   - Extract document text
   - Send to LLM with context

4. **Keyboard Shortcuts** (1 hour)
   - Add Ctrl+S for save
   - Add Ctrl+F for search

5. **Better Error Messages** (30 min)
   - User-friendly error messages
   - Retry buttons
   - Helpful suggestions

---

## Technical Debt & Improvements

1. **PDF Worker Setup**: Currently using CDN, should bundle worker for offline use
2. **Error Boundaries**: Add React error boundaries for document viewers
3. **Memory Management**: Clean up large document buffers when tabs close
4. **Type Safety**: Ensure all IPC calls are properly typed
5. **Testing**: Add unit tests for document operations

---

## Recommended Next Implementation

**Start with Save Functionality** - This is the most critical missing feature. Users can view documents but can't save changes, which limits the editing workflow.

**Then add LLM Integration** - This is the core value proposition: LLM-assisted document editing and collaboration.

