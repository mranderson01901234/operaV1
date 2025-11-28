# DeepSeek Auto-Only Configuration ✅

## Changes Made

### ✅ Removed from Manual Selection
- **ModelSelector.tsx**: Removed DeepSeek from user-facing model dropdown
- DeepSeek models are no longer manually selectable
- Users can only select: OpenAI, Anthropic, Gemini models

### ✅ Kept for Automatic Silent Tasks
- **Router**: DeepSeek still automatically used for:
  - Document review tasks (`readDocument`, `getDocumentSummary`)
  - Large file analysis
  - Silent background processing

## How It Works

### Automatic Usage (Silent Tasks):
1. User requests document review
2. System detects document tools usage
3. **Automatically switches to DeepSeek** (if API key set)
4. Falls back to Gemini Flash if DeepSeek unavailable
5. User sees results, but doesn't see model switch

### Manual Selection (User Choice):
- Users can select: OpenAI, Anthropic, Gemini models
- DeepSeek is **hidden** from selection
- Users get full-feature models (vision + tools) for browser automation

## Benefits

1. **Cost Optimization**: 
   - Silent tasks use cheapest model (DeepSeek)
   - Users get full-feature models for interactive tasks

2. **User Experience**:
   - Users don't need to understand model differences
   - System automatically optimizes costs
   - No confusion about partial-feature models

3. **Transparency**:
   - Users see which model they selected
   - Automatic switches logged in console (for debugging)
   - Cost savings happen automatically

## API Key Setup

DeepSeek API key still needs to be set in Settings:
- Go to Settings → API Keys
- Select "DeepSeek" provider
- Enter your DeepSeek API key (get one at https://platform.deepseek.com/)
- Save

**Note**: Even though DeepSeek isn't manually selectable, the API key is still needed for automatic document review tasks.

## Testing

1. **Manual Selection**: 
   - Open model selector
   - Verify DeepSeek is NOT in the list
   - Only OpenAI, Anthropic, Gemini visible

2. **Automatic Usage**:
   - Upload/select a document
   - Ask to review it
   - Check console logs - should see "Using DeepSeek for cost efficiency"
   - Document review should work automatically

3. **Fallback**:
   - If DeepSeek API key not set
   - Document review should fallback to Gemini Flash
   - Should still work, just slightly more expensive

## Current Status

✅ DeepSeek removed from manual selection
✅ DeepSeek still available for automatic tasks
✅ Router configured for automatic switching
✅ Fallback to Gemini Flash if DeepSeek unavailable

