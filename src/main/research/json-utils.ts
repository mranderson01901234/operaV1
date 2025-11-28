// src/main/research/json-utils.ts

/**
 * Robust JSON parsing utilities with repair logic for handling incomplete or malformed JSON from LLMs
 */

/**
 * Attempts to repair common JSON issues:
 * - Unclosed strings
 * - Unclosed brackets/braces
 * - Trailing commas
 * - Incomplete objects
 */
function repairJsonStringStr(jsonStr: string): string | null {
  let repaired = jsonStr.trim()
  
  // Remove markdown code blocks if present
  const jsonMatch = repaired.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    repaired = jsonMatch[1].trim()
  }
  
  // Remove any leading/trailing markdown artifacts
  repaired = repaired.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  
  // Try to find JSON object/array boundaries
  const jsonObjectMatch = repaired.match(/\{[\s\S]*\}/)
  if (jsonObjectMatch) {
    repaired = jsonObjectMatch[0]
  } else {
    const jsonArrayMatch = repaired.match(/\[[\s\S]*\]/)
    if (jsonArrayMatch) {
      repaired = jsonArrayMatch[0]
    }
  }
  
  // Smart repair: track structure state and only close if we're sure
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let escapeNext = false
  let lastValidPos = -1
  
  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i]
    
    if (escapeNext) {
      escapeNext = false
      continue
    }
    
    if (char === '\\') {
      escapeNext = true
      continue
    }
    
    if (char === '"') {
      inString = !inString
      continue
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++
        lastValidPos = i
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0 && bracketCount === 0) {
          lastValidPos = i + 1
        }
      } else if (char === '[') {
        bracketCount++
        lastValidPos = i
      } else if (char === ']') {
        bracketCount--
        if (braceCount === 0 && bracketCount === 0) {
          lastValidPos = i + 1
        }
      } else if (braceCount > 0 || bracketCount > 0) {
        lastValidPos = i + 1
      }
    }
  }
  
  // If we found a valid end position, truncate there
  if (lastValidPos > 0 && lastValidPos < repaired.length) {
    repaired = repaired.substring(0, lastValidPos)
  }
  
  // Only close structures if we're not in the middle of something
  // Check if we're in a string at the end
  if (inString) {
    repaired += '"'
    inString = false
  }
  
  // Remove incomplete trailing structures
  // Look for incomplete object/array at the end
  const trailingIncomplete = repaired.match(/,\s*$/)
  if (trailingIncomplete) {
    repaired = repaired.replace(/,\s*$/, '')
  }
  
  // Only close structures if we're sure they're incomplete
  // Don't close if we're in the middle of an array element
  if (braceCount > 0 && !inString) {
    // Check if we're in the middle of an object property
    const lastOpenBrace = repaired.lastIndexOf('{')
    const afterLastBrace = repaired.substring(lastOpenBrace)
    // Only close if we're not in the middle of a property value
    if (!afterLastBrace.match(/:\s*"[^"]*$/)) {
      repaired += '}'.repeat(braceCount)
    }
  }
  
  if (bracketCount > 0 && !inString) {
    // Check if we're in the middle of an array element
    const lastOpenBracket = repaired.lastIndexOf('[')
    const afterLastBracket = repaired.substring(lastOpenBracket)
    // Only close if we're not in the middle of an object
    if (!afterLastBracket.match(/,\s*\{[^}]*$/)) {
      repaired += ']'.repeat(bracketCount)
    }
  }
  
  // Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')
  
  return repaired
}

/**
 * Attempts to parse JSON with multiple repair strategies
 */
export function parseJsonRobust(jsonStr: string, context?: string): any {
  if (!jsonStr || !jsonStr.trim()) {
    throw new Error('Empty JSON string')
  }
  
  // Strategy 1: Try direct parse
  try {
    return JSON.parse(jsonStr.trim())
  } catch (error) {
    // Continue to repair strategies
  }
  
  // Strategy 2: Extract JSON from markdown code blocks
  let extracted = jsonStr.trim()
  const jsonMatch = extracted.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    extracted = jsonMatch[1].trim()
    try {
      return JSON.parse(extracted)
    } catch (error) {
      // Continue to next strategy
    }
  }
  
  // Strategy 3: Find JSON object boundaries (non-greedy to avoid matching too much)
  // Try to find complete JSON first
  const jsonObjectMatch = extracted.match(/\{[\s\S]*\}/)
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0])
    } catch (error) {
      // If that fails, try to find the start of JSON and extract what we can
      const jsonStart = extracted.indexOf('{')
      if (jsonStart !== -1) {
        // Try to find a reasonable end point - look for closing brace that balances
        let braceCount = 0
        let inString = false
        let escapeNext = false
        let endPos = -1
        
        for (let i = jsonStart; i < extracted.length; i++) {
          const char = extracted[i]
          if (escapeNext) {
            escapeNext = false
            continue
          }
          if (char === '\\') {
            escapeNext = true
            continue
          }
          if (char === '"') {
            inString = !inString
            continue
          }
          if (!inString) {
            if (char === '{') braceCount++
            if (char === '}') {
              braceCount--
              if (braceCount === 0) {
                endPos = i + 1
                break
              }
            }
          }
        }
        
        if (endPos > jsonStart) {
          try {
            return JSON.parse(extracted.substring(jsonStart, endPos))
          } catch (e) {
            // Continue to repair
          }
        }
      }
      // Continue to repair
    }
  }
  
  // Strategy 4: Try repair logic
  const repaired = repairJsonStringStr(extracted)
  if (repaired) {
    try {
      return JSON.parse(repaired)
    } catch (error) {
      // Log the error for debugging
      console.error(`[JSON Utils] Failed to parse repaired JSON${context ? ` for ${context}` : ''}:`, error)
      console.error(`[JSON Utils] Original string (first 500 chars):`, jsonStr.substring(0, 500))
      console.error(`[JSON Utils] Repaired string (first 500 chars):`, repaired.substring(0, 500))
    }
  }
  
  // Strategy 5: Try to extract just the array/object content
  // Sometimes LLMs return text before/after JSON
  const lines = extracted.split('\n')
  let jsonStart = -1
  let jsonEnd = -1
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if ((line.startsWith('{') || line.startsWith('[')) && jsonStart === -1) {
      jsonStart = i
    }
    if ((line.endsWith('}') || line.endsWith(']')) && jsonStart !== -1) {
      jsonEnd = i + 1
      break
    }
  }
  
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const jsonLines = lines.slice(jsonStart, jsonEnd).join('\n')
    try {
      return JSON.parse(jsonLines)
    } catch (error) {
      // Final attempt failed
    }
  }
  
  // All strategies failed
  throw new Error(`Failed to parse JSON${context ? ` for ${context}` : ''}. Original string: ${jsonStr.substring(0, 200)}...`)
}

/**
 * Validates that parsed JSON has the expected structure
 */
export function validateJsonStructure(parsed: any, expectedStructure: {
  requiredFields?: string[]
  arrayField?: string
  objectField?: string
}): boolean {
  if (!parsed || typeof parsed !== 'object') {
    return false
  }
  
  // Check required fields
  if (expectedStructure.requiredFields) {
    for (const field of expectedStructure.requiredFields) {
      if (!(field in parsed)) {
        return false
      }
    }
  }
  
  // Check array field
  if (expectedStructure.arrayField) {
    const arrayValue = parsed[expectedStructure.arrayField]
    if (!Array.isArray(arrayValue)) {
      return false
    }
  }
  
  // Check object field
  if (expectedStructure.objectField) {
    const objectValue = parsed[expectedStructure.objectField]
    if (!objectValue || typeof objectValue !== 'object' || Array.isArray(objectValue)) {
      return false
    }
  }
  
  return true
}

/**
 * Attempts to extract partial facts from incomplete JSON
 * This is useful when LLM responses are truncated
 */
function extractPartialFacts(jsonStr: string): any[] {
  const facts: any[] = []
  
  // Try to find individual fact objects even if JSON is incomplete
  // Look for patterns like: { "claim": "...", "value": "...", ... }
  // Use a more flexible regex that handles incomplete objects
  const factPattern = /\{\s*"claim"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*(?:"value"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?)?\s*(?:"context"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?)?\s*(?:"confidence"\s*:\s*(\d+)\s*,?)?\s*(?:"category"\s*:\s*"([^"]*)"\s*)?\}/g
  
  let match
  while ((match = factPattern.exec(jsonStr)) !== null) {
    try {
      const fact: any = {
        claim: (match[1] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        value: (match[2] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        context: (match[3] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        confidence: match[4] ? parseInt(match[4], 10) : 50,
        category: match[5] || 'claim',
      }
      
      // Only add if we have at least a claim
      if (fact.claim && fact.claim.trim().length > 0) {
        facts.push(fact)
      }
    } catch (e) {
      // Skip malformed fact
    }
  }
  
  return facts
}

/**
 * Attempts to extract partial gaps from incomplete JSON
 */
function extractPartialGaps(jsonStr: string): any[] {
  const gaps: any[] = []
  
  // Try to find individual gap objects even if JSON is incomplete
  const gapPattern = /\{\s*"subQuestionId"\s*:\s*"([^"]*)"\s*,?\s*(?:"description"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?)?\s*(?:"suggestedQuery"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?)?\s*(?:"importance"\s*:\s*"([^"]*)"\s*)?\}/g
  
  let match
  while ((match = gapPattern.exec(jsonStr)) !== null) {
    try {
      const gap: any = {
        subQuestionId: match[1] || 'new',
        description: (match[2] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        suggestedQuery: (match[3] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
        importance: match[4] || 'important',
      }
      
      // Only add if we have at least a description or suggestedQuery
      if ((gap.description && gap.description.trim().length > 0) || 
          (gap.suggestedQuery && gap.suggestedQuery.trim().length > 0)) {
        gaps.push(gap)
      }
    } catch (e) {
      // Skip malformed gap
    }
  }
  
  return gaps
}

/**
 * Extracts and parses JSON from LLM response with validation
 * Falls back to partial extraction if JSON is incomplete
 */
export function extractAndParseJson(
  response: string,
  expectedStructure: {
    requiredFields?: string[]
    arrayField?: string
    objectField?: string
  },
  context?: string
): any {
  try {
    const parsed = parseJsonRobust(response, context)
    
    // Validate structure
    if (!validateJsonStructure(parsed, expectedStructure)) {
      throw new Error(`Invalid JSON structure. Expected: ${JSON.stringify(expectedStructure)}`)
    }
    
    return parsed
  } catch (error) {
    // If parsing failed and we're looking for facts array, try partial extraction
    if (expectedStructure.arrayField === 'facts') {
      console.warn(`[JSON Utils] Full JSON parse failed${context ? ` for ${context}` : ''}, attempting partial fact extraction...`)
      const partialFacts = extractPartialFacts(response)
      if (partialFacts.length > 0) {
        console.log(`[JSON Utils] Extracted ${partialFacts.length} partial facts from incomplete JSON`)
        return { facts: partialFacts }
      }
    }
    
    // If parsing failed and we're looking for gaps array, try partial extraction
    if (expectedStructure.arrayField === 'gaps') {
      console.warn(`[JSON Utils] Full JSON parse failed${context ? ` for ${context}` : ''}, attempting partial gap extraction...`)
      const partialGaps = extractPartialGaps(response)
      if (partialGaps.length > 0) {
        console.log(`[JSON Utils] Extracted ${partialGaps.length} partial gaps from incomplete JSON`)
        return { gaps: partialGaps, conflicts: [] }
      }
    }
    
    console.error(`[JSON Utils] Failed to extract JSON${context ? ` for ${context}` : ''}:`, error)
    throw error
  }
}

