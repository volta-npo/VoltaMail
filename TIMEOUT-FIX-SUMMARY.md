# AI Template Suggestion Timeout & 400 Error - Complete Fix

## Problem Statement

Users were experiencing two related errors when trying to draft templates with AI:
1. **"AI took too long to draft a template. Please retry with fewer leads."** - Timeout error
2. **400 Bad Request** - From the backend `/templates/suggest` endpoint

## Root Causes Identified

### 1. **No Fetch-Level Timeouts in AI Client**
- The `fetch()` calls to external AI providers (OpenRouter, OpenAI, Gemini) had no timeout configuration
- When an AI provider was slow or unresponsive, the request could hang indefinitely
- This caused the browser's default fetch timeout (often 5+ minutes) to eventually abort

### 2. **Rate Limiting & API Errors Not Properly Handled**
- 429 (Rate Limit) errors from AI providers weren't caught and properly translated to user-friendly messages
- Generic error responses from AI APIs weren't informative enough

### 3. **Frontend Fetch Had No Timeout**
- The frontend fetch requests to `/templates/suggest` had no timeout signal
- Browser-level timeouts are unpredictable (typically 5-10 minutes)
- No user feedback during long AI processing

### 4. **Missing Error Context**
- When errors occurred, there was no information about what specifically went wrong
- Users couldn't distinguish between API errors, rate limits, or actual timeouts

## Solution Overview

All fixes maintain backward compatibility while significantly improving reliability and user experience.

---

## Changes Made

### Backend Changes

#### 1. **AI Client Service** (`apps/api/src/ai/ai-client.service.ts`)

**Added Fetch-Level Timeout Handling:**
- Implemented `AbortController` for all three AI providers
- Default timeouts per provider:
  - **OpenRouter**: 60 seconds (free models are slower)
  - **OpenAI**: 45 seconds (paid, faster)
  - **Gemini**: 45 seconds

**Key improvements:**
```typescript
const PROVIDER_FETCH_TIMEOUTS: Record<Provider, number> = {
  openrouter: 60000,  // 60s for free models
  openai: 45000,      // 45s for paid models
  gemini: 45000       // 45s for Gemini
};
```

**Enhanced Error Handling:**
- Detects `AbortError` for timeout scenarios
- Specific messages for rate limits (429 errors)
- Better error context for debugging
- Re-throws known exceptions without wrapping

**Example error message:**
```
OpenRouter request timed out after 60s. The AI provider is taking too long. 
Try reducing the number of leads or switching to a faster model.
```

#### 2. **Templates Service** (`apps/api/src/templates/templates.service.ts`)

**Updated `suggestTemplate()` method:**
- Now passes `timeoutMs` parameter to AI client
- Removed redundant `runWithTimeout` wrapper (timeouts now at fetch level)
- Better error catching and re-throwing with helpful context

```typescript
const timeoutMs = this.calculateTimeout(leads.length, generationConfig.provider);

let raw: string;
try {
  raw = await this.aiClient.generate({
    provider: generationConfig.provider,
    systemPrompt,
    userPrompt,
    model: generationConfig.model,
    apiKey: generationConfig.apiKey,
    timeoutMs  // Now passed to fetch level!
  });
} catch (error) {
  // Re-throw with context
  if (error instanceof BadRequestException) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  throw new BadRequestException(
    `AI generation failed: ${message} Try reducing the number of leads (currently: ${leads.length}).`
  );
}
```

---

### Frontend Changes

#### 1. **Templates Page** (`apps/web/app/projects/[projectId]/templates/page.tsx`)

Three functions updated with proper timeout handling:

**A. `handleGenerateAiTemplateBundle()` - Template Suggestion**
- Added `AbortController` with 120-second timeout
- Provides timeout-specific error message
- Cleans up timeout on completion

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes

try {
  const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/templates/suggest`, {
    method: "POST",
    signal: controller.signal,
    headers: { ... },
    body: JSON.stringify({ ... })
  });
  // ... rest of logic
} catch (bundleError) {
  if (bundleError instanceof Error) {
    if (bundleError.name === 'AbortError') {
      setError("AI request timed out after 2 minutes. Try reducing leads or switching providers.");
    } else {
      setError(bundleError.message);
    }
  }
} finally {
  clearTimeout(timeoutId);
  setSuggestingTemplate(false);
}
```

**B. `handleGenerateAi()` - AI Draft Generation**
- Same timeout pattern (120 seconds)
- Better error messages for timeout vs. other failures
- Timeout ID properly cleaned up

**C. `handleChatSend()` - Template Chat**
- 120-second timeout for chat interactions
- Specific timeout message for chat context
- Proper cleanup in finally block

---

## Timeout Values & Rationale

| Operation | Backend Timeout | Frontend Timeout | Rationale |
|-----------|-----------------|------------------|-----------|
| Suggest Template | 15s + 8s/lead* | 120s | Free models are slower; frontend allows full backend timeout plus buffer |
| Generate Drafts | 15s + 8s/lead* | 120s | Per-lead generation takes time; buffer for slow providers |
| Chat | 15s + 5s/lead* | 120s | Single message, but complex reasoning; conservative timeout |

*Timeout calculation: `baseTimeout + (leadCount * timeoutPerLead)`, max 2 minutes

---

## Error Messages Improvements

### Before:
```
Failed to generate AI template
```

### After:
```
OpenRouter request timed out after 60s. The AI provider is taking too long. 
Try reducing the number of leads or switching to a faster model.
```

Or for rate limits:
```
OpenRouter rate limit exceeded. Please try again in a moment or switch to another AI provider.
```

---

## Testing Recommendations

### 1. **Test with Slow Provider**
- Use OpenRouter free model with 25 leads
- Should timeout at ~60s with clear message
- Don't get stuck indefinitely

### 2. **Test Rate Limiting**
- Make multiple rapid requests
- Should show 429 error message
- Suggest switching providers

### 3. **Test Lead Count Scaling**
- Small count (1-5 leads): ~15-40s
- Medium count (10-15 leads): ~40-80s
- Large count (20+ leads): ~90-120s

### 4. **Test Error Messages**
- Verify user-friendly messages appear
- Check that suggestions are actionable
- Ensure no technical jargon in production

---

## Performance Impact

- **Positive**: Requests now fail fast instead of hanging for minutes
- **Minimal**: ~2KB additional code (AbortController is native)
- **Network**: No additional API calls; only better error handling

---

## Backward Compatibility

✅ All changes are **fully backward compatible**:
- API response formats unchanged
- New `timeoutMs` parameter optional in AI client
- Error messages are enhancements, not breaking changes
- No database migrations needed

---

## Files Modified

### Backend
1. `apps/api/src/ai/ai-client.service.ts` - Added fetch timeouts
2. `apps/api/src/templates/templates.service.ts` - Pass timeouts to client

### Frontend
1. `apps/web/app/projects/[projectId]/templates/page.tsx` - Add AbortController to 3 functions

### Build Status
✅ Both `npm run build` commands completed successfully
✅ No TypeScript errors
✅ No ESLint errors

---

## How to Deploy

1. Pull changes to your development environment
2. Run `cd apps/api && npm run build` (validates backend)
3. Run `cd apps/web && npm run build` (validates frontend)
4. Deploy as usual - no database migrations needed

---

## Future Improvements

1. **Configurable Timeouts**: Add environment variables for timeout tuning
2. **Retry Logic**: Implement exponential backoff for rate limits
3. **Progress Feedback**: Show "generating..." status updates
4. **Model Selection UI**: Show timeout estimates per model in UI
5. **Analytics**: Track which models timeout most frequently

---

## References

- **MDN AbortController**: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- **Fetch Timeout Pattern**: https://developer.mozilla.org/en-US/docs/Web/API/fetch#timeout
- **NestJS Error Handling**: https://docs.nestjs.com/exception-filters
