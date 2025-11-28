// src/main/research/cross-referencer.ts

import { SourceEvaluation, VerifiedFact, SourceReference, ExtractedFact } from './types'

export class CrossReferencer {
  verify(evaluations: SourceEvaluation[]): VerifiedFact[] {
    const startTime = performance.now()
    
    // Group facts by similarity
    const factGroups = this.groupSimilarFacts(evaluations)
    
    // Verify each group
    const verifiedFacts: VerifiedFact[] = []
    
    for (const [key, facts] of factGroups) {
      const verified = this.verifyFactGroup(key, facts, evaluations)
      if (verified) {
        verifiedFacts.push(verified)
      }
    }
    
    // Sort by confidence
    verifiedFacts.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 }
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
    })
    
    console.log(`[CrossReferencer] Verified ${verifiedFacts.length} facts from ${evaluations.length} sources in ${performance.now() - startTime}ms`)
    
    return verifiedFacts
  }
  
  private groupSimilarFacts(
    evaluations: SourceEvaluation[]
  ): Map<string, ExtractedFact[]> {
    const groups = new Map<string, ExtractedFact[]>()
    
    for (const evaluation of evaluations) {
      for (const fact of evaluation.extractedFacts) {
        // Create a normalized key for grouping
        const key = this.normalizeFactKey(fact.claim)
        
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key)!.push(fact)
      }
    }
    
    return groups
  }
  
  private normalizeFactKey(claim: string): string {
    // Simple normalization for grouping similar facts
    return claim
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .sort()
      .slice(0, 5) // Use first 5 significant words
      .join('_')
  }
  
  private verifyFactGroup(
    key: string,
    facts: ExtractedFact[],
    evaluations: SourceEvaluation[]
  ): VerifiedFact | null {
    if (facts.length === 0) return null
    
    // Find the highest-confidence version of this fact
    const sortedFacts = [...facts].sort((a, b) => b.confidence - a.confidence)
    const primaryFact = sortedFacts[0]
    
    // Build source references
    const sources: SourceReference[] = facts.map(f => {
      const evaluation = evaluations.find(e => e.url === f.sourceUrl)
      return {
        url: f.sourceUrl,
        domain: evaluation?.domain || new URL(f.sourceUrl).hostname,
        title: evaluation?.content.title || '',
        authorityScore: evaluation?.authorityScore || 50,
        exactQuote: f.context.substring(0, 200),
      }
    })
    
    // Sort sources by authority
    sources.sort((a, b) => b.authorityScore - a.authorityScore)
    
    // Determine confidence level
    // Consider both source count/authority AND fact confidence scores
    let confidence: 'high' | 'medium' | 'low'
    
    const uniqueSources = new Set(sources.map(s => s.domain)).size
    const avgAuthority = sources.reduce((sum, s) => sum + s.authorityScore, 0) / sources.length
    const hasOfficialSource = sources.some(s => s.authorityScore >= 90)
    
    // Calculate average fact confidence (0-100)
    const avgFactConfidence = facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
    
    // Improved confidence calculation that considers multiple factors
    // High confidence: multiple sources with good authority OR high fact confidence with good source
    if (
      (uniqueSources >= 3 && avgAuthority >= 70) ||
      (uniqueSources >= 2 && avgAuthority >= 75) ||
      (uniqueSources >= 2 && avgFactConfidence >= 80) ||
      (uniqueSources >= 1 && hasOfficialSource && avgFactConfidence >= 75)
    ) {
      confidence = 'high'
    } 
    // Medium confidence: multiple sources OR good authority OR high fact confidence
    else if (
      uniqueSources >= 2 ||
      hasOfficialSource ||
      avgAuthority >= 70 ||
      avgFactConfidence >= 70 ||
      (uniqueSources >= 1 && avgFactConfidence >= 60)
    ) {
      confidence = 'medium'
    } 
    // Low confidence: single source with low authority and low fact confidence
    else {
      confidence = 'low'
    }
    
    // Log confidence determination for debugging
    console.log(`[CrossReferencer] Fact "${primaryFact.claim.substring(0, 60)}...": ${confidence} confidence (sources: ${uniqueSources}, avgAuthority: ${avgAuthority.toFixed(1)}, avgFactConfidence: ${avgFactConfidence.toFixed(1)})`)
    
    // Check for conflicting information
    const values = facts.map(f => f.value).filter(v => v !== undefined)
    const uniqueValues = new Set(values)
    const conflictingInfo = uniqueValues.size > 1
      ? `Conflicting values found: ${[...uniqueValues].join(' vs ')}`
      : undefined
    
    return {
      claim: primaryFact.claim,
      value: primaryFact.value,
      sources,
      agreementCount: uniqueSources,
      confidence,
      conflictingInfo,
    }
  }
}

