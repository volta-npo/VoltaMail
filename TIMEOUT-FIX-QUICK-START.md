# Quick Start: Testing the AI Timeout Fixes

## What Was Fixed?

Your AI template generation was timing out and returning 400 errors because:
1. ❌ **Backend fetch calls had NO timeouts** → could hang forever
2. ❌ **Frontend fetch calls had NO timeouts** → unpredictable browser timeouts
3. ❌ **Error messages were vague** → users didn't know what went wrong

Now:
1. ✅ **Backend properly times out AI providers** (60s for OpenRouter, 45s for others)
2. ✅ **Frontend terminates requests after 2 minutes** with clear feedback
3. ✅ **Helpful error messages** guide users on what to do

---

## Testing the Fix

### Quick Test (1-2 minutes)

1. **Open your app** and go to a project with leads imported
2. **Click "Draft with AI"** button
3. **Observe:**
   - ✅ Request starts immediately (check Network tab in DevTools)
   - ✅ Status updates as it processes
   - ✅ If it takes >30s, you'll see "Thinking..." state
   - ✅ If it takes >120s, you'll see clear timeout message

### Testing Different Scenarios

#### Scenario A: Quick Success (1-5 leads)
- Import 1-5 leads
- Click "Draft with AI"
- Should complete in **15-40 seconds**

#### Scenario B: Medium Speed (10-15 leads)
- Import 10-15 leads
- Click "Draft with AI"
- Should complete in **40-80 seconds**

#### Scenario C: Slow Provider (20+ leads)
- Import 20+ leads
- Click "Draft with AI" with OpenRouter
- Should timeout at **60 seconds** with helpful message:
  ```
  AI request timed out after 2 minutes. The AI provider is taking too long. 
  Try reducing the number of leads or switching to a different AI provider.
  ```

#### Scenario D: Switching Providers
If OpenRouter times out:
1. Go to **Settings → AI Config**
2. Switch to **OpenAI** or **Gemini**
3. Try "Draft with AI" again
4. Should be faster (45s timeout vs 60s)

---

## What Changed in Your Code

### Backend Changes (Server-side)

**File: `apps/api/src/ai/ai-client.service.ts`**
- ✅ Added `AbortController` to all fetch calls
- ✅ Each provider has a timeout: OpenRouter (60s), OpenAI (45s), Gemini (45s)
- ✅ Better error handling for rate limits and slow responses

**File: `apps/api/src/templates/templates.service.ts`**
- ✅ Now passes timeout to AI client
- ✅ Catches errors and provides helpful context
- ✅ Removed redundant timeout wrapper

### Frontend Changes (Browser-side)

**File: `apps/web/app/projects/[projectId]/templates/page.tsx`**
- ✅ Updated 3 functions with timeout handling:
  1. `handleGenerateAiTemplateBundle()` - "Draft with AI"
  2. `handleGenerateAi()` - Draft individual leads
  3. `handleChatSend()` - Chat with AI
- ✅ All have 120-second frontend timeout
- ✅ All show helpful timeout messages

---

## Timeout Flow Diagram

```
User clicks "Draft with AI"
           ↓
Frontend starts fetch (120s timeout set)
           ↓
Request → Backend (calculateTimeout based on lead count)
           ↓
Backend → AI Provider (60s for OpenRouter, 45s for paid)
           ↓
┌─────────────────────────────────────────┐
│         What Happens Next?               │
├─────────────────────────────────────────┤
│ FAST    (1-5 leads)                     │
│ ✅ 15-40s → Success                     │
│                                          │
│ MEDIUM  (10-15 leads)                   │
│ ✅ 40-80s → Success                     │
│                                          │
│ SLOW    (20+ leads)                     │
│ ⚠️  ~100-120s → Clear timeout message   │
│                                          │
│ ERROR   (API issue)                     │
│ ⚠️  Immediate → Provider-specific error │
│      (e.g., "rate limit exceeded")      │
└─────────────────────────────────────────┘
```

---

## Error Messages You'll See

### Success
```
✅ Drafted template copy with AI. Review and tweak before saving.
```

### Timeout (Expected with many leads + slow provider)
```
⚠️ AI request timed out after 2 minutes. The AI provider is taking too long. 
Try reducing the number of leads or switching to a different AI provider.
```

### Rate Limit (Too many requests)
```
⚠️ OpenRouter rate limit exceeded. Please try again in a moment or 
switch to another AI provider.
```

### API Key Issue
```
⚠️ OpenRouter API key is not configured. Add one in AI settings or 
set OPENROUTER_API_KEY.
```

### Empty Response (Rare)
```
⚠️ OpenRouter returned an empty response.
```

---

## No More Hanging!

### Before This Fix ❌
- User clicks "Draft with AI"
- Waits 5+ minutes with no feedback
- Browser eventually gives up with vague error
- User has no idea what went wrong

### After This Fix ✅
- User clicks "Draft with AI"
- Clear "Thinking..." status
- After 2 minutes, if still processing, gets helpful timeout message
- Suggests specific actions (reduce leads, change provider)
- Request terminates cleanly

---

## Database / Backend Setup

**No changes needed!** 
- No database migrations
- No environment variable changes
- No new dependencies
- Fully backward compatible

---

## Deployment Checklist

- [ ] Pulled the latest changes
- [ ] Ran `cd apps/api && npm run build` ✅
- [ ] Ran `cd apps/web && npm run build` ✅
- [ ] Both builds succeeded with no errors
- [ ] Ready to deploy!

---

## Troubleshooting

### Still Getting Timeouts?
1. Check how many leads you imported
   - If 20+, try with fewer leads first
2. Check which AI provider you're using
   - Free models (OpenRouter) are slower
   - Try paid models (OpenAI, Gemini) if available
3. Check your internet connection
   - Timeouts can happen if connection is slow
4. Check AI provider status
   - OpenRouter, OpenAI, or Google might be having issues

### Still Getting 400 Errors?
1. Make sure you have leads imported
2. Make sure your AI API key is configured in Settings
3. Check browser console (DevTools) for specific error
4. If error says "Free model publication", visit:
   - https://openrouter.ai/settings/privacy
   - Enable "Allow using free models" policy

### Requests Still Hanging?
- This should not happen anymore
- If it does, manually refresh the page
- Report the issue with:
  - Number of leads
  - AI provider used
  - Browser console logs (DevTools → Console tab)

---

## Performance Improvements

| Metric | Before | After |
|--------|--------|-------|
| Max wait time | Unknown (could hang forever) | 120 seconds (predictable) |
| Timeout feedback | None (hung silently) | Clear message in 2 minutes |
| Error clarity | Vague | Specific and actionable |
| Provider timeout | None | 45-60 seconds (depends on provider) |
| Rate limit handling | Generic error | Provider-specific message |

---

## Questions?

Refer to the full technical details in `TIMEOUT-FIX-SUMMARY.md`
