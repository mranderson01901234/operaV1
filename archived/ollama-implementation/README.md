# Archived: Ollama Local Model Implementation

This directory contains the archived Ollama-based local model implementation that was replaced with a cloud-based preprocessor using Gemini 2.5 Flash.

## Why Archived?

The Ollama implementation was replaced because:
1. **Too slow**: 10-30 seconds per request (vs 1-3 seconds for cloud)
2. **Timeout issues**: Frequently timed out even with 30-second timeout
3. **Setup complexity**: Required Ollama installation and model downloads
4. **Resource intensive**: Consumed local CPU/memory
5. **Reliability issues**: Dependent on local hardware performance

## Replacement

The new implementation uses **Gemini 2.5 Flash** (cheapest cloud model):
- **Cost**: ~$0.50-12.50/month (negligible)
- **Speed**: 1-3 seconds per request
- **No setup**: Works immediately with API key
- **More reliable**: Google's infrastructure
- **Better UX**: Faster responses

## Files Archived

- `local-model.ts` - Original Ollama-based local model client

## Migration Notes

The IPC handlers (`src/main/ipc/local-model.ts`) were updated to use `cloudPreprocessor` instead of `localModel`, but the interface remains the same, so no changes were needed in the renderer code.

## If You Need to Restore

To restore the Ollama implementation:
1. Copy `local-model.ts` back to `src/main/llm/local-model.ts`
2. Update `src/main/ipc/local-model.ts` to import from `local-model` instead of `cloud-preprocessor`
3. Ensure Ollama is installed and `llama3.2:3b` model is available




