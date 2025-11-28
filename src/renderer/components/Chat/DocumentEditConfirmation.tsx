/**
 * DocumentEditConfirmation Modal
 *
 * Displayed when the LLM requests a destructive document edit (replace/delete).
 * Shows a diff preview and allows the user to approve or reject the edit.
 */

import React from 'react'
import { useChatStore } from '../../stores/chatStore'

const DocumentEditConfirmation: React.FC = () => {
  const {
    pendingDocumentEdit,
    isAwaitingEditConfirmation,
    handleDocumentEditConfirmation,
    isProcessingConfirmation,
  } = useChatStore()

  if (!isAwaitingEditConfirmation || !pendingDocumentEdit) {
    return null
  }

  const { preview, operation } = pendingDocumentEdit
  const isDelete = operation === 'delete'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-panel border border-dark-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg
              className={`w-5 h-5 ${isDelete ? 'text-red-500' : 'text-yellow-500'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-dark-text">
              Confirm Document Edit
            </h3>
          </div>
          <p className="text-sm text-dark-text-secondary mt-1">
            The AI wants to{' '}
            <span className={`font-medium ${isDelete ? 'text-red-400' : 'text-yellow-400'}`}>
              {operation}
            </span>{' '}
            content in{' '}
            <span className="font-medium text-dark-text">"{preview.documentName}"</span>
          </p>
        </div>

        {/* Diff Preview */}
        <div className="flex-1 overflow-auto p-4 scrollbar-dark-premium">
          {/* Affected Lines Indicator */}
          <div className="text-xs text-dark-text-secondary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>
              Lines {preview.affectedLines.start}
              {preview.affectedLines.end !== preview.affectedLines.start &&
                `-${preview.affectedLines.end}`}{' '}
              of {preview.totalLines}
            </span>
          </div>

          {/* Before Content (Red) */}
          <div className="mb-4">
            <div className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
              {isDelete ? 'Content to be deleted:' : 'Current content:'}
            </div>
            <div className="bg-red-900/20 border-l-4 border-red-500 rounded-r">
              <pre className="p-3 text-sm text-red-300 whitespace-pre-wrap break-words font-mono overflow-x-auto scrollbar-dark-premium">
                {preview.beforeContent || '(empty)'}
              </pre>
            </div>
          </div>

          {/* After Content (Green) - only for replace */}
          {!isDelete && (
            <div>
              <div className="text-xs font-medium text-green-400 mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New content:
              </div>
              <div className="bg-green-900/20 border-l-4 border-green-500 rounded-r">
                <pre className="p-3 text-sm text-green-300 whitespace-pre-wrap break-words font-mono overflow-x-auto scrollbar-dark-premium">
                  {preview.afterContent || '(empty)'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-dark-border flex justify-between items-center flex-shrink-0 bg-dark-bg/50">
          <p className="text-xs text-dark-text-secondary">
            {isDelete
              ? 'This action cannot be undone.'
              : 'Review the changes before applying.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDocumentEditConfirmation(false)}
              disabled={isProcessingConfirmation}
              className="px-4 py-2 text-sm bg-dark-bg border border-dark-border rounded hover:bg-dark-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reject
            </button>
            <button
              onClick={() => handleDocumentEditConfirmation(true)}
              disabled={isProcessingConfirmation}
              className={`px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isDelete
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isProcessingConfirmation ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  Applying...
                </span>
              ) : isDelete ? (
                'Delete'
              ) : (
                'Apply Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocumentEditConfirmation
