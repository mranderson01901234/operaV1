import React, { useState, useEffect, useRef } from 'react'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ipc } from '../../../lib/ipc'
import type { Document } from '../../../../shared/types'

// Set up PDF.js worker
// For Electron/Vite, use local worker file
if (typeof window !== 'undefined') {
  // Use local worker file bundled with react-pdf
  // In Electron/Vite, we need to use the worker from node_modules
  try {
    // Try to use the worker from react-pdf package
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  } catch (e) {
    // Fallback to CDN if local worker fails
    console.warn('Failed to load local PDF.js worker, using CDN:', e)
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  }
}

interface PDFViewerProps {
  document: Document
  isEditing?: boolean
  onContentChange?: () => void
  onSave?: () => void
  saveTrigger?: number
  refreshTrigger?: number
}

type AnnotationTool = 'select' | 'highlight' | 'text' | 'draw'

const PDFViewer: React.FC<PDFViewerProps> = ({
  document,
  isEditing = false,
  onContentChange,
  onSave,
  saveTrigger,
  refreshTrigger,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [pdfData, setPdfData] = useState<ArrayBuffer | string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select')
  const [annotations, setAnnotations] = useState<Array<{ id: string; type: string; page: number; data: any }>>([])
  const [saving, setSaving] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null)
  const [currentHighlight, setCurrentHighlight] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [currentTextArea, setCurrentTextArea] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  
  // Undo/redo history
  const [history, setHistory] = useState<Array<Array<{ id: string; type: string; page: number; data: any }>>>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  // Text editing state
  const [editingTextAnnotation, setEditingTextAnnotation] = useState<{ id: string; x: number; y: number; width: number; height: number } | null>(null)
  const [editingTextValue, setEditingTextValue] = useState('')
  
  // Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(null)

  // Convert data URI to ArrayBuffer for react-pdf compatibility
  // react-pdf v10 works better with ArrayBuffer/Uint8Array than blob URLs
  const convertDataUriToArrayBuffer = (dataUri: string): ArrayBuffer => {
    const base64Data = dataUri.split(',')[1]
    const byteString = atob(base64Data)
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i)
    }
    return ab
  }

  useEffect(() => {
    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)
        console.log('[PDFViewer] Loading PDF for document:', document.id)

        // Read file via IPC
        const fileResult = await ipc.document.readFile(document.id)
        console.log('[PDFViewer] IPC result:', { success: fileResult.success, hasDataUri: !!fileResult.dataUri, error: fileResult.error })
        
        if (fileResult.success && fileResult.dataUri) {
          console.log('[PDFViewer] Setting PDF data, data URI length:', fileResult.dataUri.length)
          // Convert data URI to ArrayBuffer for react-pdf compatibility
          // This avoids URL.parse issues in react-pdf
          const arrayBuffer = convertDataUriToArrayBuffer(fileResult.dataUri)
          console.log('[PDFViewer] Converted to ArrayBuffer, size:', arrayBuffer.byteLength, 'bytes')
          setPdfData(arrayBuffer)
          // Don't set loading to false here - let PDFDocument handle it
        } else {
          const errorMsg = fileResult.error || 'Failed to load PDF'
          console.error('[PDFViewer] Failed to load PDF:', errorMsg)
          setError(errorMsg)
          setLoading(false)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load PDF'
        console.error('[PDFViewer] Error loading PDF:', err)
        setError(errorMsg)
        setLoading(false)
      }
    }

    loadPDF()
  }, [document])

  // Save annotations when saveTrigger changes
  useEffect(() => {
    if (saveTrigger !== undefined && saveTrigger > 0 && pdfData && annotations.length > 0) {
      const saveAnnotations = async () => {
        if (saving) return
        setSaving(true)
        try {
          // For now, we'll save annotations as metadata
          // In a full implementation, we'd use pdf-lib to embed annotations in the PDF
          // This is a placeholder - full implementation would require pdf-lib integration
          console.log('[PDFViewer] Saving annotations:', annotations)
          onSave?.()
        } catch (err) {
          console.error('Error saving PDF annotations:', err)
          setError(err instanceof Error ? err.message : 'Failed to save annotations')
        } finally {
          setSaving(false)
        }
      }
      saveAnnotations()
    }
  }, [saveTrigger, pdfData, annotations, saving, onSave])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('[PDFViewer] PDF loaded successfully, pages:', numPages)
    setNumPages(numPages)
    setLoading(false)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('[PDFViewer] PDF load error:', error)
    setError(error.message || 'Failed to load PDF document')
    setLoading(false)
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages || 1, prev + 1))
  }

  // Generate unique ID for annotations
  const generateAnnotationId = () => {
    return `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Save state to history for undo/redo
  const saveToHistory = (newAnnotations: typeof annotations) => {
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push([...newAnnotations])
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  // Undo function
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1
      setHistoryIndex(prevIndex)
      setAnnotations([...history[prevIndex]])
      onContentChange?.()
    }
  }

  // Redo function
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1
      setHistoryIndex(nextIndex)
      setAnnotations([...history[nextIndex]])
      onContentChange?.()
    }
  }

  // Get coordinates relative to PDF page canvas
  const getPageCoordinates = (e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
    if (!pageRef.current) return null
    
    // Find the canvas element
    const canvas = pageRef.current.querySelector('canvas')
    if (!canvas) return null
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // react-pdf renders at 1.0 scale internally, then scales via CSS
    // The canvas dimensions are the actual PDF dimensions at 1.0 scale
    // The displayed size is scaled by the scale prop
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const displayWidth = rect.width
    const displayHeight = rect.height
    
    // Convert display coordinates to PDF coordinates
    const pdfX = (x / displayWidth) * canvasWidth
    const pdfY = (y / displayHeight) * canvasHeight
    
    return { x: pdfX, y: pdfY }
  }

  // Handle mouse events for annotations
  const handlePageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return
    e.preventDefault()
    e.stopPropagation()

    const coords = getPageCoordinates(e)
    if (!coords) return

    if (activeTool === 'text') {
      // Start dragging to define text area
      setCurrentTextArea({ start: coords, end: coords })
    } else if (activeTool === 'draw') {
      setIsDrawing(true)
      setDrawStart(coords)
    } else if (activeTool === 'highlight') {
      setCurrentHighlight({ start: coords, end: coords })
    }
  }

  const handlePageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return

    const coords = getPageCoordinates(e)
    if (!coords) return

    if (isDrawing && drawStart && activeTool === 'draw') {
      setDrawCurrent(coords)
    } else if (currentHighlight && activeTool === 'highlight') {
      setCurrentHighlight((prev) => prev ? { ...prev, end: coords } : null)
    } else if (currentTextArea && activeTool === 'text') {
      setCurrentTextArea((prev) => prev ? { ...prev, end: coords } : null)
    }
  }

  const handlePageMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return

    const coords = getPageCoordinates(e)
    if (!coords) return

    if (isDrawing && drawStart && activeTool === 'draw') {
      const endPos = drawCurrent || coords
      const newAnnotation = {
        id: generateAnnotationId(),
        type: 'draw',
        page: pageNumber,
        data: {
          start: drawStart,
          end: endPos,
          color: '#ffff00',
          width: 2,
        },
      }
      const newAnnotations = [...annotations, newAnnotation]
      setAnnotations(newAnnotations)
      saveToHistory(newAnnotations)
      onContentChange?.()
      setIsDrawing(false)
      setDrawStart(null)
      setDrawCurrent(null)
    } else if (currentHighlight && activeTool === 'highlight') {
      const newAnnotation = {
        id: generateAnnotationId(),
        type: 'highlight',
        page: pageNumber,
        data: {
          start: currentHighlight.start,
          end: coords,
          color: '#ffff00',
        },
      }
      const newAnnotations = [...annotations, newAnnotation]
      setAnnotations(newAnnotations)
      saveToHistory(newAnnotations)
      onContentChange?.()
      setCurrentHighlight(null)
    } else if (currentTextArea && activeTool === 'text') {
      // Create editable text input on the PDF at the dragged location
      const textCoords = currentTextArea.start
      const width = Math.abs(currentTextArea.end.x - currentTextArea.start.x)
      const height = Math.abs(currentTextArea.end.y - currentTextArea.start.y)
      
      // Set minimum size if too small
      const minWidth = 100
      const minHeight = 20
      const finalWidth = Math.max(width, minWidth)
      const finalHeight = Math.max(height, minHeight)
      
      setEditingTextAnnotation({
        id: generateAnnotationId(),
        x: textCoords.x,
        y: textCoords.y,
        width: finalWidth,
        height: finalHeight,
      })
      setEditingTextValue('')
      setCurrentTextArea(null)
    }
  }

  // Handle finishing text editing
  const finishTextEditing = () => {
    if (editingTextAnnotation && editingTextValue.trim()) {
      // Check if this is editing an existing annotation or creating a new one
      const existingAnnotation = annotations.find(a => a.id === editingTextAnnotation.id)
      
      if (existingAnnotation) {
        // Update existing annotation
        const newAnnotations = annotations.map((a) =>
          a.id === editingTextAnnotation.id 
            ? { ...a, data: { ...a.data, text: editingTextValue.trim() } } 
            : a
        )
        setAnnotations(newAnnotations)
        saveToHistory(newAnnotations)
        onContentChange?.()
      } else {
        // Create new annotation
        const newAnnotation = {
          id: editingTextAnnotation.id,
          type: 'text',
          page: pageNumber,
          data: {
            x: editingTextAnnotation.x,
            y: editingTextAnnotation.y,
            text: editingTextValue.trim(),
            width: editingTextAnnotation.width,
            height: editingTextAnnotation.height,
          },
        }
        console.log('[PDFViewer] Creating text annotation:', newAnnotation)
        const newAnnotations = [...annotations, newAnnotation]
        setAnnotations(newAnnotations)
        saveToHistory(newAnnotations)
        onContentChange?.()
      }
    }
    setEditingTextAnnotation(null)
    setEditingTextValue('')
  }

  // Initialize history on first annotation
  useEffect(() => {
    if (annotations.length === 0 && history.length === 0) {
      setHistory([[]])
      setHistoryIndex(0)
    }
  }, [])

  // Find PDF canvas element and get dimensions after page loads
  useEffect(() => {
    if (pageRef.current) {
      const findCanvas = () => {
        const canvas = pageRef.current?.querySelector('canvas')
        if (canvas) {
          pageCanvasRef.current = canvas
          // Get page dimensions from canvas (these are PDF coordinates at 1.0 scale)
          const width = canvas.width
          const height = canvas.height
          setPageDimensions({ width, height })
        }
      }
      // Try immediately and after delays (canvas might not be ready immediately)
      findCanvas()
      const timeouts = [
        setTimeout(findCanvas, 100),
        setTimeout(findCanvas, 500),
        setTimeout(findCanvas, 1000),
      ]
      return () => timeouts.forEach(clearTimeout)
    }
  }, [pageNumber, pdfData, scale])

  // Filter annotations for current page
  const pageAnnotations = annotations.filter((ann) => ann.page === pageNumber)
  
  // Debug logging only when annotations change
  useEffect(() => {
    console.log('[PDFViewer] Annotations state:', { 
      total: annotations.length, 
      pageAnnotations: pageAnnotations.length, 
      currentPage: pageNumber,
      allAnnotations: annotations
    })
  }, [annotations.length])

  // Show loading only if we don't have pdfData yet
  if (loading && !pdfData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-8 h-8 animate-spin text-dark-text-secondary mx-auto mb-2"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm text-dark-text-secondary">Loading PDF...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 text-red-500 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-dark-panel border-b border-dark-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-dark-text-secondary">
            Page {pageNumber} of {numPages || '?'}
          </span>
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= (numPages || 1)}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border"
          >
            -
          </button>
          <span className="text-xs text-dark-text-secondary">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border"
          >
            +
          </button>
        </div>
      </div>

      {/* Annotation Toolbar - shown when editing */}
      {isEditing && (
        <div className="bg-dark-panel border-b border-dark-border px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-dark-text-secondary mr-2">Tools:</span>
          <button
            onClick={() => setActiveTool('select')}
            className={`px-3 py-1 text-xs border rounded transition-colors ${
              activeTool === 'select'
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Select tool"
          >
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            Select
          </button>
          <button
            onClick={() => setActiveTool('highlight')}
            className={`px-3 py-1 text-xs border rounded transition-colors ${
              activeTool === 'highlight'
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Highlight text"
          >
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            Highlight
          </button>
          <button
            onClick={() => setActiveTool('text')}
            className={`px-3 py-1 text-xs border rounded transition-colors ${
              activeTool === 'text'
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Add text annotation"
          >
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Text Note
          </button>
          <button
            onClick={() => setActiveTool('draw')}
            className={`px-3 py-1 text-xs border rounded transition-colors ${
              activeTool === 'draw'
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Draw on PDF"
          >
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Draw
          </button>
          <div className="flex-1" />
          {/* Undo/Redo buttons */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className={`px-2 py-1 text-xs border rounded transition-colors ${
              historyIndex <= 0
                ? 'bg-dark-bg border-dark-border opacity-50 cursor-not-allowed'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Undo"
          >
            <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className={`px-2 py-1 text-xs border rounded transition-colors ${
              historyIndex >= history.length - 1
                ? 'bg-dark-bg border-dark-border opacity-50 cursor-not-allowed'
                : 'bg-dark-bg border-dark-border hover:bg-dark-border'
            }`}
            title="Redo"
          >
            <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
          <span className="text-xs text-dark-text-secondary">
            {activeTool === 'select' && 'Click to select annotations'}
            {activeTool === 'highlight' && 'Drag to highlight text'}
            {activeTool === 'text' && 'Click and drag to define text area'}
            {activeTool === 'draw' && 'Click and drag to draw'}
          </span>
        </div>
      )}

      {/* PDF viewer */}
      <div className="flex-1 overflow-auto bg-dark-bg p-4 relative scrollbar-dark-premium">
        <div className="flex justify-center">
          {pdfData ? (
            <div className="relative">
              <PDFDocument
                file={pdfData}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="text-center py-8">
                    <svg
                      className="w-8 h-8 animate-spin text-dark-text-secondary mx-auto mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <p className="text-dark-text-secondary">Rendering PDF...</p>
                  </div>
                }
                error={
                  <div className="text-center py-8">
                    <p className="text-red-500">Failed to render PDF</p>
                  </div>
                }
              >
                <div
                  ref={pageRef}
                  className="relative"
                  style={{ cursor: isEditing && activeTool !== 'select' ? 'crosshair' : 'default' }}
                >
                  <div
                    onMouseDown={handlePageMouseDown}
                    onMouseMove={handlePageMouseMove}
                    onMouseUp={handlePageMouseUp}
                    onMouseLeave={() => {
                      // Cancel drawing/highlighting/text area if mouse leaves
                      if (isDrawing) {
                        setIsDrawing(false)
                        setDrawStart(null)
                        setDrawCurrent(null)
                      }
                      if (currentHighlight) {
                        setCurrentHighlight(null)
                      }
                      if (currentTextArea) {
                        setCurrentTextArea(null)
                      }
                    }}
                    className="relative"
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="border border-dark-border shadow-lg bg-white"
                      loading={
                        <div className="flex items-center justify-center w-full h-96">
                          <p className="text-dark-text-secondary">Loading page...</p>
                        </div>
                      }
                    />
                    {/* Render preview overlay - for current highlight, text area, and drawing */}
                    {((currentHighlight || currentTextArea || (isDrawing && drawStart && drawCurrent)) && (() => {
                      if (!pageRef.current) return null
                      const canvas = pageRef.current.querySelector('canvas')
                      if (!canvas) return null
                      const rect = canvas.getBoundingClientRect()
                      const pageRect = pageRef.current.getBoundingClientRect()
                      const offsetX = rect.left - pageRect.left
                      const offsetY = rect.top - pageRect.top
                      
                      const canvasWidth = canvas.width
                      const canvasHeight = canvas.height
                      const displayWidth = rect.width
                      const displayHeight = rect.height
                      const toDisplayX = (pdfX: number) => (pdfX / canvasWidth) * displayWidth
                      const toDisplayY = (pdfY: number) => (pdfY / canvasHeight) * displayHeight
                      
                      return (
                        <svg
                          className="absolute pointer-events-none"
                          style={{
                            left: `${offsetX}px`,
                            top: `${offsetY}px`,
                            width: rect.width,
                            height: rect.height,
                            zIndex: 100,
                          }}
                        >
                          {/* Current highlight preview */}
                          {currentHighlight && (() => {
                            const startX = toDisplayX(currentHighlight.start.x)
                            const startY = toDisplayY(currentHighlight.start.y)
                            const endX = toDisplayX(currentHighlight.end.x)
                            const endY = toDisplayY(currentHighlight.end.y)
                            
                            return (
                              <rect
                                x={Math.min(startX, endX)}
                                y={Math.min(startY, endY)}
                                width={Math.abs(endX - startX)}
                                height={Math.abs(endY - startY)}
                                fill="yellow"
                                fillOpacity="0.3"
                                stroke="orange"
                                strokeWidth="1"
                                className="pointer-events-none"
                              />
                            )
                          })()}
                          {/* Current text area preview */}
                          {currentTextArea && (() => {
                            const startX = toDisplayX(currentTextArea.start.x)
                            const startY = toDisplayY(currentTextArea.start.y)
                            const endX = toDisplayX(currentTextArea.end.x)
                            const endY = toDisplayY(currentTextArea.end.y)
                            
                            return (
                              <rect
                                x={Math.min(startX, endX)}
                                y={Math.min(startY, endY)}
                                width={Math.abs(endX - startX)}
                                height={Math.abs(endY - startY)}
                                fill="blue"
                                fillOpacity="0.1"
                                stroke="blue"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                                className="pointer-events-none"
                              />
                            )
                          })()}
                          {/* Current drawing preview */}
                          {isDrawing && drawStart && drawCurrent && (() => {
                            return (
                              <line
                                x1={toDisplayX(drawStart.x)}
                                y1={toDisplayY(drawStart.y)}
                                x2={toDisplayX(drawCurrent.x)}
                                y2={toDisplayY(drawCurrent.y)}
                                stroke="#ffff00"
                                strokeWidth="2"
                                className="pointer-events-none"
                              />
                            )
                          })()}
                        </svg>
                      )
                    })())}
                    {/* Editable text input on PDF */}
                    {editingTextAnnotation && (() => {
                      if (!pageRef.current) return null
                      const canvas = pageRef.current.querySelector('canvas')
                      if (!canvas) return null
                      const rect = canvas.getBoundingClientRect()
                      const pageRect = pageRef.current.getBoundingClientRect()
                      const offsetX = rect.left - pageRect.left
                      const offsetY = rect.top - pageRect.top
                      
                      const canvasWidth = canvas.width
                      const canvasHeight = canvas.height
                      const displayWidth = rect.width
                      const displayHeight = rect.height
                      const toDisplayX = (pdfX: number) => (pdfX / canvasWidth) * displayWidth
                      const toDisplayY = (pdfY: number) => (pdfY / canvasHeight) * displayHeight
                      
                      const displayX = toDisplayX(editingTextAnnotation.x)
                      const displayY = toDisplayY(editingTextAnnotation.y)
                      const displayWidth_px = toDisplayX(editingTextAnnotation.width)
                      const displayHeight_px = toDisplayY(editingTextAnnotation.height)
                      
                      return (
                        <div
                          className="absolute"
                          style={{
                            left: `${offsetX + displayX}px`,
                            top: `${offsetY + displayY}px`,
                            width: `${displayWidth_px}px`,
                            height: `${displayHeight_px}px`,
                            zIndex: 200,
                          }}
                        >
                          <textarea
                            autoFocus
                            value={editingTextValue}
                            onChange={(e) => setEditingTextValue(e.target.value)}
                            onBlur={finishTextEditing}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault()
                                finishTextEditing()
                              } else if (e.key === 'Escape') {
                                setEditingTextAnnotation(null)
                                setEditingTextValue('')
                              }
                            }}
                            className="w-full h-full p-2 bg-white border-2 border-blue-500 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
                            placeholder="Type your text here... (Ctrl+Enter to finish)"
                            style={{
                              minHeight: '20px',
                              color: '#111827',
                              fontSize: '14px',
                              fontWeight: '500',
                              lineHeight: '1.5',
                            }}
                          />
                        </div>
                      )
                    })()}
                    {/* Render annotations overlay - positioned relative to Page container */}
                    {pageAnnotations.length > 0 && (() => {
                      if (!pageRef.current) return null
                      const canvas = pageRef.current.querySelector('canvas')
                      if (!canvas) {
                        console.log('[PDFViewer] No canvas found for annotations overlay, annotations:', pageAnnotations.length)
                        return null
                      }
                      const rect = canvas.getBoundingClientRect()
                      const pageRect = pageRef.current.getBoundingClientRect()
                      // Calculate offset of canvas relative to pageRef container
                      const offsetX = rect.left - pageRect.left
                      const offsetY = rect.top - pageRect.top
                      console.log('[PDFViewer] Rendering annotations overlay:', { 
                        offsetX, 
                        offsetY, 
                        width: rect.width, 
                        height: rect.height,
                        pageAnnotationsCount: pageAnnotations.length,
                        canvasPosition: { left: rect.left, top: rect.top },
                        pageRefPosition: { left: pageRect.left, top: pageRect.top }
                      })
                      return (
                        <svg
                          key={`annotations-${pageNumber}-${annotations.length}`}
                          className="absolute pointer-events-none"
                          style={{
                            left: `${offsetX}px`,
                            top: `${offsetY}px`,
                            width: rect.width,
                            height: rect.height,
                            zIndex: 100,
                          }}
                        >
                          {(() => {
                            const canvas = pageRef.current?.querySelector('canvas')
                      if (!canvas) return null
                      const canvasWidth = canvas.width
                      const canvasHeight = canvas.height
                      const displayWidth = canvas.getBoundingClientRect().width
                      const displayHeight = canvas.getBoundingClientRect().height
                      
                      // Convert PDF coordinates to display coordinates
                      const toDisplayX = (pdfX: number) => (pdfX / canvasWidth) * displayWidth
                      const toDisplayY = (pdfY: number) => (pdfY / canvasHeight) * displayHeight
                      
                      return pageAnnotations.map((ann) => {
                        if (ann.type === 'text') {
                          const displayX = toDisplayX(ann.data.x)
                          const displayY = toDisplayY(ann.data.y)
                          return (
                            <g key={ann.id}>
                              <rect
                                x={displayX - 5}
                                y={displayY - 5}
                                width="10"
                                height="10"
                                fill="#ffeb3b"
                                stroke="#ff9800"
                                strokeWidth="1"
                                className="pointer-events-auto cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (activeTool === 'select') {
                                  // Edit existing text annotation inline
                                  setEditingTextAnnotation({
                                    id: ann.id,
                                    x: ann.data.x,
                                    y: ann.data.y,
                                    width: ann.data.width || 200,
                                    height: ann.data.height || 50,
                                  })
                                  setEditingTextValue(ann.data.text || '')
                                }
                              }}
                              />
                              {/* Background for text to make it more visible */}
                              <rect
                                x={displayX + 10}
                                y={displayY - 8}
                                width={ann.data.text ? ann.data.text.length * 7 + 10 : 50}
                                height="20"
                                fill="white"
                                fillOpacity="0.9"
                                stroke="#333"
                                strokeWidth="1"
                                className="pointer-events-none"
                              />
                              <text
                                x={displayX + 15}
                                y={displayY + 5}
                                fill="#000"
                                fontSize="12"
                                fontWeight="500"
                                className="pointer-events-none"
                              >
                                {ann.data.text}
                              </text>
                            </g>
                          )
                        } else if (ann.type === 'highlight') {
                          const startX = toDisplayX(ann.data.start.x)
                          const startY = toDisplayY(ann.data.start.y)
                          const endX = toDisplayX(ann.data.end.x)
                          const endY = toDisplayY(ann.data.end.y)
                          const width = Math.abs(endX - startX)
                          const height = Math.abs(endY - startY)
                          const x = Math.min(startX, endX)
                          const y = Math.min(startY, endY)
                          return (
                            <rect
                              key={ann.id}
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill="yellow"
                              fillOpacity="0.3"
                              stroke="orange"
                              strokeWidth="1"
                              className="pointer-events-auto cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (activeTool === 'select') {
                                  setConfirmMessage('Delete this highlight?')
                                  setConfirmCallback(() => {
                                    const newAnnotations = annotations.filter((a) => a.id !== ann.id)
                                    setAnnotations(newAnnotations)
                                    saveToHistory(newAnnotations)
                                    onContentChange?.()
                                  })
                                  setShowConfirmModal(true)
                                }
                              }}
                            />
                          )
                        } else if (ann.type === 'draw') {
                          return (
                            <line
                              key={ann.id}
                              x1={toDisplayX(ann.data.start.x)}
                              y1={toDisplayY(ann.data.start.y)}
                              x2={toDisplayX(ann.data.end.x)}
                              y2={toDisplayY(ann.data.end.y)}
                              stroke={ann.data.color}
                              strokeWidth={ann.data.width}
                              className="pointer-events-auto cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (activeTool === 'select') {
                                  setConfirmMessage('Delete this drawing?')
                                  setConfirmCallback(() => {
                                    const newAnnotations = annotations.filter((a) => a.id !== ann.id)
                                    setAnnotations(newAnnotations)
                                    saveToHistory(newAnnotations)
                                    onContentChange?.()
                                  })
                                  setShowConfirmModal(true)
                                }
                              }}
                            />
                          )
                        }
                        return null
                      })
                    })()}
                      </svg>
                    )
                  })()}
                  </div>
                </div>
              </PDFDocument>
              {/* Edit mode indicator */}
              {isEditing && (
                <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow-lg">
                  Edit Mode: {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}
                </div>
              )}
            </div>
          ) : error ? null : (
            <div className="text-center py-8">
              <p className="text-dark-text-secondary">Preparing PDF...</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-dark-panel border border-dark-border rounded-lg p-4 min-w-[300px]">
            <h3 className="text-sm font-medium text-dark-text mb-3">Confirm</h3>
            <p className="text-sm text-dark-text-secondary mb-4">{confirmMessage}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowConfirmModal(false)
                  setConfirmMessage('')
                  setConfirmCallback(null)
                }}
                className="px-3 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmCallback) {
                    confirmCallback()
                    setConfirmCallback(null)
                  }
                  setShowConfirmModal(false)
                  setConfirmMessage('')
                }}
                className="px-3 py-1 text-xs bg-red-600 border border-red-700 rounded hover:bg-red-700 transition-colors text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PDFViewer

