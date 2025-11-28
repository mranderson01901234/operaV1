/**
 * Excel Parser Utility
 * 
 * Parses Excel files (.xlsx, .xls) using the xlsx library.
 * Supports chunking, sheet selection, and efficient text extraction.
 */

import * as XLSX from 'xlsx'
import type { Document } from '../../shared/types'

export interface ExcelMetadata {
  sheetNames: string[]
  totalRows: number
  totalColumns: number
  rowCounts: Record<string, number>
  columnCounts: Record<string, number>
  columnNames: Record<string, string[]>
}

export interface ExcelChunkOptions {
  sheet?: string
  startRow?: number
  endRow?: number
  columns?: string[]
  maxRows?: number
  includeHeaders?: boolean
}

export interface ExcelParseResult {
  content: string
  metadata: ExcelMetadata
  truncated: boolean
  message?: string
}

/**
 * Parse Excel file and extract text content
 */
export async function parseExcelFile(
  buffer: Buffer,
  options: ExcelChunkOptions = {}
): Promise<ExcelParseResult> {
  try {
    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    
    // Get metadata
    const metadata = extractMetadata(workbook)
    
    // Determine which sheet to use
    const sheetName = options.sheet || metadata.sheetNames[0]
    if (!metadata.sheetNames.includes(sheetName)) {
      throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${metadata.sheetNames.join(', ')}`)
    }
    
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) {
      throw new Error(`Failed to read sheet "${sheetName}"`)
    }
    
    // Convert to JSON array (array of arrays)
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: false // Convert numbers to strings for consistent formatting
    }) as any[][]
    
    if (jsonData.length === 0) {
      return {
        content: `Sheet "${sheetName}" is empty.`,
        metadata,
        truncated: false,
      }
    }
    
    // Determine row range
    const maxRows = options.maxRows || 1000
    const startRow = options.startRow ?? 0
    const endRow = options.endRow ?? Math.min(startRow + maxRows - 1, jsonData.length - 1)
    
    // Extract headers (first row)
    const headers = jsonData[0] || []
    const hasHeaders = headers.some((cell: any) => cell && String(cell).trim() !== '')
    
    // Determine which rows to include
    const includeHeaders = options.includeHeaders !== false && hasHeaders
    const dataStartRow = includeHeaders ? 1 : 0
    const actualStartRow = Math.max(startRow, dataStartRow)
    const actualEndRow = Math.min(endRow, jsonData.length - 1)
    
    // Filter columns if specified
    let columnIndices: number[] | null = null
    if (options.columns && options.columns.length > 0 && hasHeaders) {
      columnIndices = options.columns.map(col => {
        const idx = headers.findIndex((h: any) => 
          String(h).toLowerCase().trim() === col.toLowerCase().trim()
        )
        if (idx === -1) {
          throw new Error(`Column "${col}" not found. Available columns: ${headers.filter((h: any) => h).join(', ')}`)
        }
        return idx
      })
    }
    
    // Extract data rows
    const rowsToExtract = jsonData.slice(actualStartRow, actualEndRow + 1)
    
    // Build text representation
    const lines: string[] = []
    
    // Add sheet info
    lines.push(`Sheet: ${sheetName}`)
    lines.push(`Rows: ${actualStartRow + 1}-${actualEndRow + 1} of ${jsonData.length}`)
    if (columnIndices) {
      lines.push(`Columns: ${options.columns?.join(', ')}`)
    }
    lines.push('')
    
    // Add headers if present
    if (includeHeaders && actualStartRow <= 0) {
      const headerRow = columnIndices 
        ? headers.filter((_, i) => columnIndices!.includes(i))
        : headers
      lines.push(`Headers: ${headerRow.map((h: any) => String(h || '')).join(' | ')}`)
      lines.push('')
    }
    
    // Add data rows
    for (let i = 0; i < rowsToExtract.length; i++) {
      const row = rowsToExtract[i]
      const rowNum = actualStartRow + i + 1
      
      let rowData: any[]
      if (columnIndices) {
        rowData = row.filter((_, idx) => columnIndices!.includes(idx))
      } else {
        rowData = row
      }
      
      // Format row as: Row N: col1 | col2 | col3
      const rowText = rowData.map((cell: any) => String(cell || '').trim()).join(' | ')
      lines.push(`Row ${rowNum}: ${rowText}`)
    }
    
    const content = lines.join('\n')
    const truncated = actualEndRow < jsonData.length - 1
    
    let message: string | undefined
    if (truncated) {
      message = `Document truncated. Showing rows ${actualStartRow + 1}-${actualEndRow + 1} of ${jsonData.length}. Use readDocument with startRow/endRow parameters to read more.`
    }
    
    return {
      content,
      metadata,
      truncated,
      message,
    }
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract metadata from Excel workbook
 */
function extractMetadata(workbook: XLSX.WorkBook): ExcelMetadata {
  const sheetNames = workbook.SheetNames
  const rowCounts: Record<string, number> = {}
  const columnCounts: Record<string, number> = {}
  const columnNames: Record<string, string[]> = {}
  
  let totalRows = 0
  let totalColumns = 0
  
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue
    
    // Get range
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
    const rowCount = range.e.r + 1
    const colCount = range.e.c + 1
    
    rowCounts[sheetName] = rowCount
    columnCounts[sheetName] = colCount
    
    totalRows = Math.max(totalRows, rowCount)
    totalColumns = Math.max(totalColumns, colCount)
    
    // Extract column names from first row
    const firstRow = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      range: `A1:${XLSX.utils.encode_cell({ r: 0, c: colCount - 1 })}`
    }) as any[][]
    
    if (firstRow.length > 0) {
      columnNames[sheetName] = (firstRow[0] || []).map((cell: any) => String(cell || '').trim())
    }
  }
  
  return {
    sheetNames,
    totalRows,
    totalColumns,
    rowCounts,
    columnCounts,
    columnNames,
  }
}

/**
 * Get summary of Excel file without parsing full content
 */
export async function getExcelSummary(buffer: Buffer): Promise<{
  metadata: ExcelMetadata
  sampleRows: string[][]
}> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const metadata = extractMetadata(workbook)
    
    // Get sample rows from first sheet
    const firstSheetName = metadata.sheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    if (!worksheet) {
      return { metadata, sampleRows: [] }
    }
    
    // Get first 5 rows as sample
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: false
    }) as any[][]
    
    const sampleRows = jsonData.slice(0, 5).map(row => 
      row.map((cell: any) => String(cell || '').trim())
    )
    
    return {
      metadata,
      sampleRows,
    }
  } catch (error) {
    throw new Error(`Failed to get Excel summary: ${error instanceof Error ? error.message : String(error)}`)
  }
}

