# Phase 3 Testing Guide

## Prerequisites
1. Run `npm run dev` to start the application
2. Ensure you have a browser page loaded (navigate to any URL)

## Test Checklist

### ✅ Test 1: BrowserView Embedding
**Goal**: Verify BrowserView appears in the correct position

**Steps**:
1. Open the application
2. Enter a URL in the URL bar (e.g., `https://example.com`)
3. Press Enter
4. **Expected**: BrowserView should appear in the right 50% panel, below the URL bar

**Verify**:
- [ ] BrowserView is visible
- [ ] BrowserView is positioned in the right panel (not overlapping sidebar or chat)
- [ ] BrowserView doesn't cover the URL bar
- [ ] BrowserView resizes correctly when window is resized

---

### ✅ Test 2: Navigation Controls
**Goal**: Verify URL bar and navigation buttons work

**Steps**:
1. Navigate to `https://example.com`
2. Click a link on the page (or navigate to another URL)
3. Click the "Back" button
4. Click the "Forward" button
5. Click the "Refresh" button

**Expected**:
- [ ] URL bar shows current URL
- [ ] Back button is enabled when there's history
- [ ] Forward button is enabled when you can go forward
- [ ] Refresh button reloads the page
- [ ] Navigation state updates correctly

---

### ✅ Test 3: CDP Debugger
**Goal**: Verify CDP is attached and working

**Steps**:
1. Open DevTools (if available) or check console logs
2. Navigate to any page
3. Check console for "CDP debugger attached successfully"

**Expected**:
- [ ] Console shows "CDP debugger attached successfully"
- [ ] No CDP errors in console
- [ ] CDP stays attached after navigation

**Manual Test** (in DevTools console):
```javascript
// In renderer process DevTools console
const result = await window.electronAPI.invoke('browser:testCDP')
console.log(result)
// Should return: { success: true, attached: true, testResult: "CDP working correctly" }
```

---

### ✅ Test 4: Screenshot Capture
**Goal**: Verify screenshots can be captured

**Steps**:
1. Navigate to a page (e.g., `https://example.com`)
2. Wait for page to load
3. Test screenshot capture

**Manual Test** (in DevTools console):
```javascript
// Capture viewport screenshot
const result = await window.electronAPI.invoke('browser:captureScreenshot')
console.log('Screenshot length:', result.screenshot?.length)
// Should return base64 image string starting with "data:image/png;base64,"

// Test full page screenshot
const fullPage = await window.electronAPI.invoke('browser:captureScreenshot', { fullPage: true })
console.log('Full page screenshot:', fullPage.success)
```

**Expected**:
- [ ] Screenshot capture succeeds
- [ ] Screenshot is base64 encoded PNG
- [ ] Full page screenshot works
- [ ] Screenshot is included in browser context

---

### ✅ Test 5: Accessibility Tree Extraction
**Goal**: Verify accessibility tree can be extracted

**Steps**:
1. Navigate to a page with interactive elements (e.g., `https://example.com` or `https://google.com`)
2. Wait for page to load
3. Test accessibility tree extraction

**Manual Test** (in DevTools console):
```javascript
// Get accessibility tree
const result = await window.electronAPI.invoke('browser:getAccessibilityTree')
console.log('Accessibility tree:', result.tree)
// Should return array of interactive elements with role, name, selector, etc.

// Check if elements are found
if (result.success && result.tree) {
  console.log(`Found ${result.tree.length} interactive elements`)
  result.tree.forEach((node, i) => {
    console.log(`${i + 1}. [${node.role}] ${node.name} - ${node.selector}`)
  })
}
```

**Expected**:
- [ ] Accessibility tree extraction succeeds
- [ ] Tree contains interactive elements (buttons, links, inputs)
- [ ] Each element has role, name, and selector
- [ ] Tree is included in browser context

---

### ✅ Test 6: Browser Context (Complete)
**Goal**: Verify complete browser context includes all data

**Steps**:
1. Navigate to a page
2. Get browser context

**Manual Test** (in DevTools console):
```javascript
// Get complete browser context
const context = await window.electronAPI.invoke('browser:getContext')
console.log('Browser Context:', {
  url: context.context.url,
  title: context.context.title,
  hasScreenshot: !!context.context.screenshot,
  hasAccessibilityTree: !!context.context.accessibilityTree,
  treeLength: context.context.accessibilityTree?.length || 0
})
```

**Expected**:
- [ ] Context includes URL and title
- [ ] Context includes screenshot (base64 string)
- [ ] Context includes accessibility tree (array)
- [ ] All data is current and accurate

---

### ✅ Test 7: Browser Store Integration
**Goal**: Verify browserStore works correctly

**Manual Test** (in DevTools console):
```javascript
// Access browserStore (if exposed)
// Or test via IPC
const state = await window.electronAPI.invoke('browser:getState')
console.log('Browser State:', state.state)

// Test navigation via store
await window.electronAPI.invoke('browser:navigate', 'https://example.com')
```

**Expected**:
- [ ] Browser state syncs correctly
- [ ] Navigation updates state
- [ ] State persists across navigations

---

## Common Issues & Solutions

### Issue: BrowserView not visible
**Solution**: 
- Check console for errors
- Verify BrowserView bounds calculation
- Check if URL is loaded

### Issue: CDP not attached
**Solution**:
- Check console logs
- Verify BrowserView is created
- Try navigating to a new page

### Issue: Screenshot fails
**Solution**:
- Ensure page is loaded
- Check CDP is attached
- Verify BrowserView exists

### Issue: Accessibility tree empty
**Solution**:
- Ensure page has interactive elements
- Check CDP is attached
- Verify page is fully loaded

---

## Quick Test Script

Run this in the renderer DevTools console to test everything at once:

```javascript
async function testPhase3() {
  console.log('🧪 Testing Phase 3 Features...\n')
  
  // Test 1: Browser State
  console.log('1️⃣ Testing Browser State...')
  const state = await window.electronAPI.invoke('browser:getState')
  console.log('✅ Browser State:', state.success ? 'OK' : 'FAILED')
  console.log('   URL:', state.state?.url)
  console.log('   Title:', state.state?.title)
  
  // Test 2: CDP
  console.log('\n2️⃣ Testing CDP...')
  const cdp = await window.electronAPI.invoke('browser:testCDP')
  console.log('✅ CDP:', cdp.success ? 'OK' : 'FAILED')
  console.log('   Attached:', cdp.attached)
  
  // Test 3: Screenshot
  console.log('\n3️⃣ Testing Screenshot...')
  const screenshot = await window.electronAPI.invoke('browser:captureScreenshot')
  console.log('✅ Screenshot:', screenshot.success ? 'OK' : 'FAILED')
  console.log('   Size:', screenshot.screenshot?.length || 0, 'chars')
  
  // Test 4: Accessibility Tree
  console.log('\n4️⃣ Testing Accessibility Tree...')
  const a11y = await window.electronAPI.invoke('browser:getAccessibilityTree')
  console.log('✅ Accessibility Tree:', a11y.success ? 'OK' : 'FAILED')
  console.log('   Elements found:', a11y.tree?.length || 0)
  if (a11y.tree && a11y.tree.length > 0) {
    console.log('   Sample:', a11y.tree[0])
  }
  
  // Test 5: Complete Context
  console.log('\n5️⃣ Testing Complete Context...')
  const context = await window.electronAPI.invoke('browser:getContext')
  console.log('✅ Context:', context.success ? 'OK' : 'FAILED')
  console.log('   Has screenshot:', !!context.context?.screenshot)
  console.log('   Has tree:', !!context.context?.accessibilityTree)
  console.log('   Tree length:', context.context?.accessibilityTree?.length || 0)
  
  console.log('\n✨ Phase 3 Testing Complete!')
}

// Run tests
testPhase3()
```

---

## Expected Results

After running all tests, you should see:
- ✅ BrowserView visible and positioned correctly
- ✅ Navigation controls working
- ✅ CDP debugger attached
- ✅ Screenshots capturing successfully
- ✅ Accessibility tree extracting interactive elements
- ✅ Complete browser context available

If all tests pass, Phase 3 is complete and ready for Phase 4! 🎉

