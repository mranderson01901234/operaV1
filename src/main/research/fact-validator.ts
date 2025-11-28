// src/main/research/fact-validator.ts

import { ExtractedFact } from './types'

/**
 * Validates extracted facts to filter out CSS, JS, and other garbage
 */

// Patterns that indicate the "fact" is actually CSS/JS code
const INVALID_FACT_PATTERNS = [
  // CSS properties
  /font-family/i,
  /font-size/i,
  /font-weight/i,
  /background-color/i,
  /background-image/i,
  /border-radius/i,
  /border-width/i,
  /padding|margin/i,
  /width\s*:\s*\d+px/i,
  /height\s*:\s*\d+px/i,
  /display\s*:\s*(flex|block|none|inline)/i,
  /position\s*:\s*(absolute|relative|fixed)/i,
  /z-index/i,
  /opacity/i,
  /transform/i,
  /transition/i,
  /animation/i,
  /color\s*:\s*#[0-9a-f]/i,
  /rgba?\s*\(/i,
  
  // CSS selectors
  /^\./,                               // Starts with .class
  /^#[\w-]+\s*\{/,                     // Starts with #id {
  /\.[\w-]+\s*\{/,                     // .class { }
  /::before|::after/i,
  /:hover|:focus|:active/i,
  /@media\s*\(/i,
  /@font-face/i,
  /@keyframes/i,
  /@import/i,
  
  // JavaScript patterns
  /addEventListener/i,
  /querySelector/i,
  /getElementById/i,
  /getElementsBy/i,
  /classList\./i,
  /\.innerHTML/i,
  /\.innerText/i,
  /\.textContent/i,
  /document\./i,
  /window\./i,
  /console\./i,
  /Object\.freeze/i,
  /Object\.assign/i,
  /JSON\.(parse|stringify)/i,
  /localStorage/i,
  /sessionStorage/i,
  /fetch\s*\(/i,
  /async\s+function/i,
  /=>\s*\{/,                           // Arrow functions
  /function\s*\([^)]*\)\s*\{/,
  /const\s+\w+\s*=\s*\{/,
  /let\s+\w+\s*=\s*\{/,
  /var\s+\w+\s*=\s*\{/,
  /export\s+(default\s+)?/,
  /import\s+.*from/,
  /require\s*\(/,
  /module\.exports/,
  
  // Site-specific junk
  /gfgTheme/i,
  /darkMode|lightMode|dark-mode|light-mode/i,
  /themeList/i,
  
  // HTML/DOM structure
  /<\/?[\w-]+/,                        // HTML tags
  /&[a-z]+;/i,                         // HTML entities
  /data-[\w-]+=/i,                     // Data attributes
  
  // Measurement/styling values
  /\d+px\s*(,|\}|;)/,
  /\d+rem\s*(,|\}|;)/,
  /\d+em\s*(,|\}|;)/,
  /\d+%\s*(,|\}|;)/,
  /\d+vh\s*(,|\}|;)/,
  /\d+vw\s*(,|\}|;)/,
]

// Categories that are always suspicious
const SUSPICIOUS_CATEGORIES = [
  'specification',  // Often used for CSS specs
  'styling',
  'configuration',
  'config',
]

// Minimum content requirements
const MIN_CLAIM_LENGTH = 15
const MAX_CLAIM_LENGTH = 500
const MIN_CONTEXT_LENGTH = 20

/**
 * Check if a fact is valid content (not CSS/JS garbage)
 */
export function isValidFact(fact: ExtractedFact): boolean {
  const { claim, context, category, confidence } = fact
  
  // Combine claim and context for pattern matching
  const combined = `${claim} ${context || ''}`.toLowerCase()
  
  // Check against invalid patterns
  for (const pattern of INVALID_FACT_PATTERNS) {
    if (pattern.test(combined)) {
      console.log(`[FactValidator] Rejected (pattern match): "${claim.substring(0, 60)}..."`)
      return false
    }
  }
  
  // Check suspicious categories
  if (category && SUSPICIOUS_CATEGORIES.includes(category.toLowerCase())) {
    // Extra scrutiny for suspicious categories
    const hasCodeChars = /[{}\[\]();=<>]/.test(claim)
    if (hasCodeChars) {
      console.log(`[FactValidator] Rejected (suspicious category + code chars): "${claim.substring(0, 60)}..."`)
      return false
    }
  }
  
  // Length checks
  if (claim.length < MIN_CLAIM_LENGTH) {
    console.log(`[FactValidator] Rejected (too short): "${claim}"`)
    return false
  }
  
  if (claim.length > MAX_CLAIM_LENGTH) {
    console.log(`[FactValidator] Rejected (too long): "${claim.substring(0, 60)}..."`)
    return false
  }
  
  // Check for excessive special characters (likely code)
  const specialChars = (claim.match(/[{}\[\]();:=<>\/\\|&^%$#@!~`]/g) || []).length
  const specialRatio = specialChars / claim.length
  if (specialRatio > 0.15) {
    console.log(`[FactValidator] Rejected (too many special chars: ${(specialRatio * 100).toFixed(1)}%): "${claim.substring(0, 60)}..."`)
    return false
  }
  
  // Check for code-like structure in claim
  if (/^\s*[\w]+\s*[({=]/.test(claim)) {
    console.log(`[FactValidator] Rejected (code-like structure): "${claim.substring(0, 60)}..."`)
    return false
  }
  
  // Claim should have some natural language characteristics
  const hasSpaces = claim.includes(' ')
  const hasNaturalWords = /\b(the|is|are|was|were|has|have|can|will|should|a|an|for|to|of|in|on|with|by|from|at)\b/i.test(claim)
  
  if (!hasSpaces || !hasNaturalWords) {
    console.log(`[FactValidator] Rejected (not natural language): "${claim.substring(0, 60)}..."`)
    return false
  }
  
  return true
}

/**
 * Filter an array of facts, keeping only valid ones
 */
export function filterValidFacts(facts: ExtractedFact[]): ExtractedFact[] {
  const validFacts = facts.filter(isValidFact)
  
  const filtered = facts.length - validFacts.length
  if (filtered > 0) {
    console.log(`[FactValidator] Filtered ${filtered}/${facts.length} invalid facts`)
  }
  
  return validFacts
}

/**
 * Score a fact's quality (0-100)
 * Facts that pass validation get a base score boost since they're already filtered
 */
export function scoreFact(fact: ExtractedFact): number {
  // Start with fact's confidence, but if it's missing or very low, give a base score
  // since the fact already passed validation (meaning it's not CSS/JS garbage)
  let score = fact.confidence || 60  // Increased default from 50 to 60
  
  // If confidence was provided but is very low (< 40), boost it since it passed validation
  if (fact.confidence && fact.confidence < 40) {
    score = Math.max(score, 55) // Minimum 55 for validated facts
  }
  
  // Boost for longer, more detailed claims
  if (fact.claim.length > 50) score += 5
  if (fact.claim.length > 100) score += 5
  
  // Boost for having context
  if (fact.context && fact.context.length > 50) score += 10
  
  // Boost for concrete values
  if (fact.value && String(fact.value).length > 0) score += 10
  
  // Penalize vague categories
  if (fact.category === 'claim' || fact.category === 'other') score -= 5
  
  // Boost for specific categories
  if (['pricing', 'feature', 'statistic', 'date', 'fact'].includes(fact.category)) {
    score += 5
  }
  
  return Math.max(0, Math.min(100, score))
}

