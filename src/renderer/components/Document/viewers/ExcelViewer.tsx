import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { ipc } from '../../../lib/ipc'
import type { Document } from '../../../../shared/types'

interface ExcelViewerProps {
  document: Document
  isEditing?: boolean
  onContentChange?: () => void
  onSave?: () => void
  refreshTrigger?: number
}

const ExcelViewer: React.FC<ExcelViewerProps> = ({ document, refreshTrigger }) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadExcelDocument = async () => {
      try {
        setLoading(true)
        setError(null)

        // Read file via IPC
        const fileResult = await ipc.document.readFile(document.id)
        if (!fileResult.success || !fileResult.dataUri) {
          setError(fileResult.error || 'Failed to load Excel document')
          setLoading(false)
          return
        }

        // Extract buffer from data URI
        const match = fileResult.dataUri.match(/^data:[^;]+;base64,(.+)$/)
        if (!match) {
          setError('Invalid data URI format')
          setLoading(false)
          return
        }

        const base64Data = match[1]
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Parse Excel workbook
        const wb = XLSX.read(bytes, { type: 'array' })
        setWorkbook(wb)

        // Set first sheet as active
        if (wb.SheetNames.length > 0) {
          setActiveSheet(wb.SheetNames[0])
        }

        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Excel document')
        setLoading(false)
      }
    }

    loadExcelDocument()
  }, [document, refreshTrigger])

  const renderSheet = (sheetName: string) => {
    if (!workbook) return null

    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

    if (jsonData.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-dark-text-secondary">Empty sheet</p>
        </div>
      )
    }

    return (
      <div className="w-full h-full overflow-auto scrollbar-dark-premium">
        <div className="inline-block min-w-full">
          <table className="border-collapse border border-dark-border bg-dark-panel" style={{ minWidth: 'max-content' }}>
            <tbody>
              {jsonData.map((row: any, rowIndex: number) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-dark-panel' : 'bg-dark-bg'}>
                  {Array.isArray(row) ? (
                    row.map((cell: any, cellIndex: number) => (
                      <td
                        key={cellIndex}
                        className="border border-dark-border px-2 py-1 text-sm text-dark-text whitespace-nowrap"
                      >
                        {cell || ''}
                      </td>
                    ))
                  ) : (
                    <td className="border border-dark-border px-2 py-1 text-sm text-dark-text whitespace-nowrap">
                      {row}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
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
          <p className="text-sm text-dark-text-secondary">Loading Excel document...</p>
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
      {/* Sheet selector */}
      {workbook && workbook.SheetNames.length > 1 && (
        <div className="bg-dark-panel border-b border-dark-border px-4 py-2 flex items-center gap-2">
          {workbook.SheetNames.map((name) => (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                activeSheet === name
                  ? 'bg-blue-500 text-white'
                  : 'bg-dark-bg border border-dark-border text-dark-text hover:bg-dark-border'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Spreadsheet */}
      <div className="flex-1 overflow-hidden bg-dark-bg p-4">
        {workbook && activeSheet ? (
          renderSheet(activeSheet)
        ) : (
          <div className="text-center py-8">
            <p className="text-dark-text-secondary">
              Excel document parsing needs IPC implementation.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExcelViewer

