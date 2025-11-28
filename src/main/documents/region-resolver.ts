/**
 * Region Resolver
 *
 * Resolves semantic target descriptions (like "the function handleSubmit" or "after the imports")
 * to concrete line number ranges in a document.
 */

import type { ResolvedRegion, ResolutionResult } from '../../shared/types'

/**
 * Resolve a semantic target description to line numbers
 *
 * @param content - The full document content
 * @param target - The semantic target description
 * @param mimeType - The MIME type of the document (for language-specific parsing)
 * @returns ResolutionResult with the resolved region or error
 */
export function resolveTarget(
  content: string,
  target: string,
  mimeType: string
): ResolutionResult {
  const lines = content.split('\n')
  const totalLines = lines.length
  const normalizedTarget = target.toLowerCase().trim()

  // Try resolution strategies in order of specificity
  const strategies: Array<() => ResolutionResult | null> = [
    // 1. Explicit line numbers: "lines 10-15" or "line 5"
    () => resolveExplicitLines(normalizedTarget, totalLines),

    // 2. Positional targets: "end of file", "beginning", etc.
    () => resolvePositionalTarget(normalizedTarget, lines),

    // 3. Code constructs: functions, classes, imports (for code files)
    () => resolveCodeConstruct(normalizedTarget, lines, mimeType),

    // 4. Markdown sections: headings (for markdown files)
    () => resolveMarkdownSection(normalizedTarget, lines, mimeType),

    // 5. Text search: find by content
    () => resolveTextSearch(normalizedTarget, lines),
  ]

  for (const strategy of strategies) {
    const result = strategy()
    if (result) {
      return result
    }
  }

  return {
    success: false,
    error: `Could not resolve target: "${target}". Try using explicit line numbers (e.g., "lines 5-10") or more specific descriptions.`,
  }
}

/**
 * Strategy 1: Explicit line numbers
 * Matches: "lines 10-15", "line 5", "lines 1 to 3"
 */
function resolveExplicitLines(target: string, totalLines: number): ResolutionResult | null {
  // Match "lines X-Y" or "lines X to Y"
  const rangeMatch = target.match(/lines?\s+(\d+)\s*[-–to]\s*(\d+)/i)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)

    if (start < 1 || end > totalLines || start > end) {
      return {
        success: false,
        error: `Invalid line range: ${start}-${end}. Document has ${totalLines} lines.`,
      }
    }

    return {
      success: true,
      region: {
        startLine: start,
        endLine: end,
        confidence: 'exact',
        matchedText: `Lines ${start}-${end}`,
      },
    }
  }

  // Match single "line X"
  const singleMatch = target.match(/lines?\s+(\d+)/i)
  if (singleMatch) {
    const line = parseInt(singleMatch[1], 10)

    if (line < 1 || line > totalLines) {
      return {
        success: false,
        error: `Invalid line number: ${line}. Document has ${totalLines} lines.`,
      }
    }

    return {
      success: true,
      region: {
        startLine: line,
        endLine: line,
        confidence: 'exact',
        matchedText: `Line ${line}`,
      },
    }
  }

  return null
}

/**
 * Strategy 2: Positional targets
 * Matches: "end of file", "beginning", "start", etc.
 */
function resolvePositionalTarget(target: string, lines: string[]): ResolutionResult | null {
  const totalLines = lines.length

  // End of file
  if (target.includes('end of file') || target.includes('eof') || target === 'end') {
    return {
      success: true,
      region: {
        startLine: totalLines,
        endLine: totalLines,
        confidence: 'exact',
        matchedText: 'End of file',
      },
    }
  }

  // Beginning of file
  if (
    target.includes('beginning') ||
    target.includes('start of file') ||
    target.includes('beginning of file') ||
    target === 'start'
  ) {
    return {
      success: true,
      region: {
        startLine: 1,
        endLine: 1,
        confidence: 'exact',
        matchedText: 'Beginning of file',
      },
    }
  }

  // After imports (find end of import block)
  if (target.includes('after the imports') || target.includes('after imports')) {
    const lastImportLine = findLastImportLine(lines)
    if (lastImportLine > 0) {
      return {
        success: true,
        region: {
          startLine: lastImportLine + 1,
          endLine: lastImportLine + 1,
          confidence: 'probable',
          matchedText: `After imports (line ${lastImportLine})`,
        },
      }
    }
  }

  // Before imports
  if (target.includes('before the imports') || target.includes('before imports')) {
    const firstImportLine = findFirstImportLine(lines)
    if (firstImportLine > 0) {
      return {
        success: true,
        region: {
          startLine: firstImportLine,
          endLine: firstImportLine,
          confidence: 'probable',
          matchedText: `Before imports (line ${firstImportLine})`,
        },
      }
    }
  }

  return null
}

/**
 * Strategy 3: Code constructs (functions, classes)
 */
function resolveCodeConstruct(
  target: string,
  lines: string[],
  mimeType: string
): ResolutionResult | null {
  // Only apply to code files
  if (!isCodeFile(mimeType)) {
    return null
  }

  // Match "function X" or "the function X" or "function named X"
  const functionMatch = target.match(/(?:the\s+)?function\s+(?:named\s+|called\s+)?["']?(\w+)["']?/i)
  if (functionMatch) {
    const funcName = functionMatch[1]
    const result = findFunctionDefinition(lines, funcName)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  // Match "class X"
  const classMatch = target.match(/(?:the\s+)?class\s+(?:named\s+|called\s+)?["']?(\w+)["']?/i)
  if (classMatch) {
    const className = classMatch[1]
    const result = findClassDefinition(lines, className)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  // Match "the imports" or "import statements"
  if (target.includes('import') && (target.includes('the ') || target.includes('all '))) {
    const firstImport = findFirstImportLine(lines)
    const lastImport = findLastImportLine(lines)
    if (firstImport > 0 && lastImport > 0) {
      return {
        success: true,
        region: {
          startLine: firstImport,
          endLine: lastImport,
          confidence: 'probable',
          matchedText: `Import block (lines ${firstImport}-${lastImport})`,
        },
      }
    }
  }

  return null
}

/**
 * Strategy 4: Markdown sections (headings)
 */
function resolveMarkdownSection(
  target: string,
  lines: string[],
  mimeType: string
): ResolutionResult | null {
  // Only apply to markdown files
  if (mimeType !== 'text/markdown' && !mimeType.includes('markdown')) {
    return null
  }

  // Match "## Heading" or "the Installation section" or "# Title"
  const headingMatch = target.match(/(?:the\s+)?(#+\s*)?["']?([^"']+)["']?\s*section/i)
  if (headingMatch) {
    const sectionName = headingMatch[2].trim().toLowerCase()
    const result = findMarkdownHeading(lines, sectionName)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  // Direct heading match: "## Installation"
  const directHeadingMatch = target.match(/^(#+)\s*(.+)$/i)
  if (directHeadingMatch) {
    const level = directHeadingMatch[1]
    const headingText = directHeadingMatch[2].trim().toLowerCase()
    const result = findMarkdownHeading(lines, headingText, level.length)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  return null
}

/**
 * Strategy 5: Text search
 * Matches: "paragraph containing X", "line with X", "the X"
 */
function resolveTextSearch(target: string, lines: string[]): ResolutionResult | null {
  // Match "paragraph/section/line containing 'X'" or "containing X"
  const containingMatch = target.match(/(?:paragraph|section|line|text)?\s*containing\s+["']?([^"']+)["']?/i)
  if (containingMatch) {
    const searchText = containingMatch[1].trim().toLowerCase()
    const result = findTextContaining(lines, searchText)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
    return {
      success: false,
      error: `Could not find text containing "${searchText}"`,
    }
  }

  // Match "the TODO comment" or "TODO:"
  if (target.includes('todo')) {
    const result = findTextContaining(lines, 'todo')
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  // Generic quoted text search: 'some text' or "some text"
  const quotedMatch = target.match(/["']([^"']+)["']/i)
  if (quotedMatch) {
    const searchText = quotedMatch[1].trim().toLowerCase()
    const result = findTextContaining(lines, searchText)
    if (result) {
      return {
        success: true,
        region: result,
      }
    }
  }

  return null
}

// ============================================================================
// Helper functions
// ============================================================================

function isCodeFile(mimeType: string): boolean {
  const codeMimeTypes = [
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-c++',
    'text/x-go',
    'text/x-rust',
    'application/json',
  ]
  return codeMimeTypes.some((t) => mimeType.includes(t)) || mimeType.startsWith('text/x-')
}

function findFirstImportLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      line.startsWith('import ') ||
      line.startsWith('from ') ||
      line.match(/^(const|let|var)\s+.*=\s*require\(/)
    ) {
      return i + 1 // 1-indexed
    }
  }
  return 0
}

function findLastImportLine(lines: string[]): number {
  let lastImport = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      line.startsWith('import ') ||
      line.startsWith('from ') ||
      line.match(/^(const|let|var)\s+.*=\s*require\(/)
    ) {
      lastImport = i + 1 // 1-indexed
    } else if (lastImport > 0 && line !== '' && !line.startsWith('//') && !line.startsWith('#')) {
      // Stop searching after we've found imports and hit non-import code
      break
    }
  }
  return lastImport
}

function findFunctionDefinition(lines: string[], funcName: string): ResolvedRegion | null {
  const patterns = [
    // JavaScript/TypeScript: function name() or function name(
    new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${funcName}\\s*\\(`),
    // Arrow function: const name = () => or const name = async () =>
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${funcName}\\s*=\\s*(?:async\\s+)?\\(`),
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${funcName}\\s*=\\s*(?:async\\s+)?function`),
    // Method: name() { or name: function() or async name()
    new RegExp(`^\\s*(?:async\\s+)?${funcName}\\s*\\([^)]*\\)\\s*[:{]`),
    // Python: def name(
    new RegExp(`^\\s*(?:async\\s+)?def\\s+${funcName}\\s*\\(`),
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        // Find the end of the function (simplified: just find matching brace or indentation)
        const endLine = findBlockEnd(lines, i)
        return {
          startLine: i + 1,
          endLine: endLine + 1,
          confidence: 'exact',
          matchedText: `Function ${funcName}`,
        }
      }
    }
  }

  return null
}

function findClassDefinition(lines: string[], className: string): ResolvedRegion | null {
  const patterns = [
    // JavaScript/TypeScript: class Name
    new RegExp(`^\\s*(?:export\\s+)?class\\s+${className}\\s*`),
    // Python: class Name:
    new RegExp(`^\\s*class\\s+${className}\\s*[:(]`),
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        const endLine = findBlockEnd(lines, i)
        return {
          startLine: i + 1,
          endLine: endLine + 1,
          confidence: 'exact',
          matchedText: `Class ${className}`,
        }
      }
    }
  }

  return null
}

function findBlockEnd(lines: string[], startIndex: number): number {
  // Simple brace counting for JS/TS
  let braceCount = 0
  let foundOpenBrace = false

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    for (const char of line) {
      if (char === '{') {
        braceCount++
        foundOpenBrace = true
      } else if (char === '}') {
        braceCount--
        if (foundOpenBrace && braceCount === 0) {
          return i
        }
      }
    }

    // Python-style: check for dedent (simplified)
    if (i > startIndex && line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
      // We've dedented, this is likely the end
      return i - 1
    }
  }

  // Couldn't find end, return last line
  return lines.length - 1
}

function findMarkdownHeading(
  lines: string[],
  headingText: string,
  level?: number
): ResolvedRegion | null {
  const normalizedSearch = headingText.toLowerCase()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#+)\s+(.+)$/)
    if (headingMatch) {
      const headingLevel = headingMatch[1].length
      const text = headingMatch[2].trim().toLowerCase()

      if (level && headingLevel !== level) {
        continue
      }

      if (text.includes(normalizedSearch) || normalizedSearch.includes(text)) {
        // Find end of section (next heading of same or higher level)
        let endLine = lines.length
        for (let j = i + 1; j < lines.length; j++) {
          const nextHeading = lines[j].match(/^(#+)\s+/)
          if (nextHeading && nextHeading[1].length <= headingLevel) {
            endLine = j // Don't include the next heading
            break
          }
        }

        return {
          startLine: i + 1,
          endLine: endLine,
          confidence: 'exact',
          matchedText: `Section: ${headingMatch[2].trim()}`,
        }
      }
    }
  }

  return null
}

function findTextContaining(lines: string[], searchText: string): ResolvedRegion | null {
  const normalizedSearch = searchText.toLowerCase()
  const matches: Array<{ line: number; text: string }> = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(normalizedSearch)) {
      matches.push({ line: i + 1, text: lines[i].trim().substring(0, 50) })
    }
  }

  if (matches.length === 0) {
    return null
  }

  if (matches.length === 1) {
    return {
      startLine: matches[0].line,
      endLine: matches[0].line,
      confidence: 'exact',
      matchedText: matches[0].text,
    }
  }

  // Multiple matches - return the first but mark as probable
  return {
    startLine: matches[0].line,
    endLine: matches[0].line,
    confidence: 'probable',
    matchedText: `${matches[0].text} (${matches.length} matches, using first)`,
  }
}
