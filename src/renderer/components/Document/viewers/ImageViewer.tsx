import React, { useState, useEffect } from 'react'
import { ipc } from '../../../lib/ipc'
import type { Document } from '../../../../shared/types'

interface ImageViewerProps {
  document: Document
}

const ImageViewer: React.FC<ImageViewerProps> = ({ document }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panning, setPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const loadImage = async () => {
      try {
        setLoading(true)
        setError(null)

        // Read file via IPC
        const fileResult = await ipc.document.readFile(document.id)
        if (fileResult.success && fileResult.dataUri) {
          setImageUrl(fileResult.dataUri)
        } else {
          setError(fileResult.error || 'Failed to load image')
        }

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image')
        setLoading(false)
      }
    }

    loadImage()
  }, [document])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((prev) => Math.max(0.5, Math.min(5, prev * delta)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setPanning(true)
      setPanStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      setPosition({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setPanning(false)
  }

  const resetView = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  if (loading) {
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
          <p className="text-sm text-dark-text-secondary">Loading image...</p>
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
          <span className="text-xs text-dark-text-secondary">Zoom: {Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border"
          >
            -
          </button>
          <button
            onClick={resetView}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border"
          >
            Reset
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 0.1))}
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded hover:bg-dark-border"
          >
            +
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className="flex-1 overflow-hidden relative bg-dark-bg"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {imageUrl ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              cursor: panning ? 'grabbing' : 'grab',
            }}
          >
            <img
              src={imageUrl}
              alt={document.name}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-dark-text-secondary">
              Image preview not available. File reading needs IPC implementation.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageViewer

