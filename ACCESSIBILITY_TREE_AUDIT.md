# Accessibility Tree & LLM Context Audit

**Date:** 2025-01-27  
**Issue:** LLM cannot find search input on GitHub search page  
**Severity:** 🔴 CRITICAL

---

## Problem Analysis

The LLM is failing to find the search input (`input[name='q']`) on GitHub's search page, despite it being the ONLY input element on the page.

---

## Root Causes Identified

### 🔴 CRITICAL BUG #1: Accessibility Tree Truncation

**Location**: `src/renderer/stores/chatStore.ts:137`

```typescript
const MAX_A11Y_ELEMENTS = 20 // Reduced from 30 for cost savings
```

**Problem**: 
- Only **20 elements** are sent to the LLM
- On pages with many interactive elements (navigation, buttons, links), the search input might be **element #21+**
- The LLM never sees it!

**Impact**: HIGH - LLM cannot see all interactive elements

**Fix Required**: 
- Increase limit OR
- Prioritize inputs/textboxes in the list OR
- Send ALL inputs/textboxes regardless of limit

---

### 🔴 CRITICAL BUG #2: Name Value Requirement

**Location**: `src/main/browser/a11y-extractor.ts:63`

```typescript
const interactiveNodes = nodes.filter((node: any) =>
  interactiveRoles.has(node.role?.value?.toLowerCase()) &&
  node.name?.value &&  // ⚠️ REQUIRES NAME VALUE
  node.backendDOMNodeId
)
```

**Problem**:
- Filters out elements without `name.value`
- Some inputs only have `placeholder` or `aria-label`, not `name.value`
- GitHub's search input might not have an accessible name in the a11y tree

**Impact**: HIGH - Inputs without accessible names are excluded

**Fix Required**: 
- Remove name requirement OR
- Use placeholder/label as fallback

---

### 🔴 CRITICAL BUG #3: Selector Quote Mismatch

**Location**: `src/main/browser/tool-executor.ts:409-414`

```typescript
// Strategy 3: Handle name attribute selectors
if (!element && selector.includes('[name=')) {
  const match = selector.match(/\[name="([^"]+)"\]/);  // ⚠️ Only matches double quotes
  if (match) {
    element = document.querySelector('input[name="' + match[1] + '"]') ||
              document.querySelector('textarea[name="' + match[1] + '"]');
  }
}
```

**Problem**:
- Regex only matches `[name="..."]` (double quotes)
- LLM generates `[name='q']` (single quotes)
- Selector matching fails!

**Impact**: HIGH - Type tool cannot find elements with single-quote selectors

**Fix Required**: 
- Support both single and double quotes
- Or normalize selectors before matching

---

### ⚠️ BUG #4: Missing Fallback Strategy

**Location**: `src/main/browser/tool-executor.ts:434-444`

**Problem**:
- Strategy 6 only triggers for generic selectors (`input`, `input[type="text"]`)
- Doesn't trigger for `input[name='q']` when quote mismatch occurs
- No fallback to find "any visible input" when selector fails

**Impact**: MEDIUM - No graceful degradation

**Fix Required**: 
- Add fallback: if selector fails, try finding any visible input
- Prioritize inputs with `name` attribute matching

---

### ⚠️ BUG #5: Limited Context Information

**Location**: `src/renderer/stores/chatStore.ts:190-195`

**Problem**:
- Context only shows: `[role] "name"` and selector
- Doesn't show input `type`, `placeholder`, or other helpful attributes
- LLM has less information to work with

**Impact**: MEDIUM - LLM has less context to make decisions

**Fix Required**: 
- Include more attributes in context (type, placeholder, etc.)
- Especially for inputs/textboxes

---

## Fixes Required

### Priority 1: Fix Selector Quote Matching (IMMEDIATE)

**File**: `src/main/browser/tool-executor.ts`

Fix the regex to handle both single and double quotes:

```typescript
// Strategy 3: Handle name attribute selectors
if (!element && selector.includes('[name=')) {
  // Match both [name="value"] and [name='value']
  const match = selector.match(/\[name=["']([^"']+)["']\]/);
  if (match) {
    const nameValue = match[1];
    element = document.querySelector(`input[name="${nameValue}"]`) ||
              document.querySelector(`textarea[name="${nameValue}"]`);
  }
}
```

---

### Priority 2: Increase/Improve A11y Tree Limit (IMMEDIATE)

**File**: `src/renderer/stores/chatStore.ts`

**Option A**: Increase limit
```typescript
const MAX_A11Y_ELEMENTS = 50 // Increased from 20
```

**Option B**: Prioritize inputs (BETTER)
```typescript
// Sort: inputs/textboxes first, then others
const sortedTree = a11yTree.sort((a, b) => {
  const inputRoles = ['textbox', 'searchbox', 'combobox'];
  const aIsInput = inputRoles.includes(a.role);
  const bIsInput = inputRoles.includes(b.role);
  if (aIsInput && !bIsInput) return -1;
  if (!aIsInput && bIsInput) return 1;
  return 0;
});
const truncatedTree = sortedTree.slice(0, maxElements);
```

**Option C**: Always include all inputs (BEST)
```typescript
// Always include ALL inputs/textboxes, limit others
const inputs = a11yTree.filter(n => ['textbox', 'searchbox', 'combobox'].includes(n.role));
const others = a11yTree.filter(n => !['textbox', 'searchbox', 'combobox'].includes(n.role));
const truncatedTree = [...inputs, ...others.slice(0, maxElements - inputs.length)];
```

---

### Priority 3: Remove Name Requirement (HIGH)

**File**: `src/main/browser/a11y-extractor.ts`

```typescript
const interactiveNodes = nodes.filter((node: any) =>
  interactiveRoles.has(node.role?.value?.toLowerCase()) &&
  // Remove name requirement - use placeholder/label as fallback
  (node.name?.value || node.value?.value || node.backendDOMNodeId) &&
  node.backendDOMNodeId
)
```

---

### Priority 4: Add Fallback Strategy (MEDIUM)

**File**: `src/main/browser/tool-executor.ts`

Add after Strategy 6:

```typescript
// Strategy 7: Fallback - find any visible input if selector failed
if (!element) {
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea');
  for (const inp of allInputs) {
    const rect = inp.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // If selector had a name attribute, prefer inputs with matching name
      if (selector.includes('[name=')) {
        const match = selector.match(/\[name=["']([^"']+)["']\]/);
        if (match && inp.name === match[1]) {
          element = inp;
          break;
        }
      }
      // Otherwise, take first visible input
      if (!element) {
        element = inp;
      }
    }
  }
}
```

---

### Priority 5: Enhance Context Information (LOW)

**File**: `src/renderer/stores/chatStore.ts`

Include more attributes for inputs:

```typescript
const formattedTree = truncatedTree.map((node: any, i: number) => {
  const parts = [`${i + 1}. [${node.role}] "${node.name}"`]
  if (node.value) parts.push(`   Value: "${node.value}"`)
  // Add input-specific info
  if (node.role === 'textbox' || node.role === 'searchbox') {
    if (node.placeholder) parts.push(`   Placeholder: "${node.placeholder}"`)
    if (node.type) parts.push(`   Type: ${node.type}`)
  }
  if (node.selector) parts.push(`   Selector: ${node.selector}`)
  return parts.join('\n')
}).join('\n\n')
```

---

## Testing Plan

### Test Case 1: GitHub Search Page
1. Navigate to `https://github.com/search`
2. Check accessibility tree extraction
3. Verify search input is included
4. Try typing in search input
5. **Expected**: Should find `input[name="q"]` or `input[name='q']`

### Test Case 2: Quote Handling
1. Test with `[name="q"]` (double quotes)
2. Test with `[name='q']` (single quotes)
3. **Expected**: Both should work

### Test Case 3: A11y Tree Limit
1. Navigate to page with 30+ interactive elements
2. Check that inputs are prioritized
3. **Expected**: All inputs visible even if limit is 20

---

## Implementation Order

1. ✅ **Fix selector quote matching** (5 min) - CRITICAL
2. ✅ **Fix a11y tree prioritization** (10 min) - CRITICAL  
3. ✅ **Remove name requirement** (5 min) - HIGH
4. ✅ **Add fallback strategy** (10 min) - MEDIUM
5. ⚠️ **Enhance context** (15 min) - LOW (nice to have)

**Total Estimated Time**: 45 minutes

---

## Expected Outcome

After fixes:
- ✅ LLM can find search inputs on any page
- ✅ Handles both single and double quote selectors
- ✅ Prioritizes inputs in accessibility tree
- ✅ Graceful fallback when selector fails
- ✅ Better context for LLM decision-making

