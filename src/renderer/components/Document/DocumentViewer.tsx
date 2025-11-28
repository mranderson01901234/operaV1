import React from 'react'
import { SUPPORTED_MIME_TYPES } from '../../../shared/types'
import PDFViewer from './viewers/PDFViewer'
import WordViewer from './viewers/WordViewer'
import ExcelViewer from './viewers/ExcelViewer'
import ImageViewer from './viewers/ImageViewer'
import MarkdownViewer from './viewers/MarkdownViewer'
import CodeViewer from './viewers/CodeViewer'
import TextViewer from './viewers/TextViewer'
import type { Document } from '../../../shared/types'

interface DocumentViewerProps {
  document: Document
  isEditing?: boolean
  onContentChange?: () => void
  onSave?: () => void
  saveTrigger?: number
  refreshTrigger?: number
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  isEditing = false,
  onContentChange,
  onSave,
  saveTrigger,
  refreshTrigger,
}) => {
  const { mimeType } = document

  // Determine viewer based on MIME type
  if (SUPPORTED_MIME_TYPES.image.includes(mimeType as any)) {
    return <ImageViewer document={document} isEditing={isEditing} onContentChange={onContentChange} onSave={onSave} />
  }

  if (mimeType === 'application/pdf') {
    return (
      <PDFViewer
        document={document}
        isEditing={isEditing}
        onContentChange={onContentChange}
        onSave={onSave}
        saveTrigger={saveTrigger}
        refreshTrigger={refreshTrigger}
      />
    )
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/rtf'
  ) {
    return <WordViewer document={document} isEditing={isEditing} onContentChange={onContentChange} onSave={onSave} refreshTrigger={refreshTrigger} />
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv'
  ) {
    return <ExcelViewer document={document} isEditing={isEditing} onContentChange={onContentChange} onSave={onSave} refreshTrigger={refreshTrigger} />
  }

  if (mimeType === 'text/markdown') {
    return (
      <MarkdownViewer
        document={document}
        isEditing={isEditing}
        onContentChange={onContentChange}
        onSave={onSave}
        saveTrigger={saveTrigger}
        refreshTrigger={refreshTrigger}
      />
    )
  }

  if (SUPPORTED_MIME_TYPES.code.includes(mimeType as any)) {
    return (
      <CodeViewer
        document={document}
        isEditing={isEditing}
        onContentChange={onContentChange}
        onSave={onSave}
        saveTrigger={saveTrigger}
        refreshTrigger={refreshTrigger}
      />
    )
  }

  if (SUPPORTED_MIME_TYPES.text.includes(mimeType as any)) {
    return (
      <TextViewer
        document={document}
        isEditing={isEditing}
        onContentChange={onContentChange}
        onSave={onSave}
        saveTrigger={saveTrigger}
        refreshTrigger={refreshTrigger}
      />
    )
  }

  // Fallback for unsupported types
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <svg
          className="w-16 h-16 text-dark-text-secondary mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-dark-text-secondary mb-2">Unsupported document type</p>
        <p className="text-sm text-dark-text-secondary/70">{mimeType}</p>
      </div>
    </div>
  )
}

export default DocumentViewer

