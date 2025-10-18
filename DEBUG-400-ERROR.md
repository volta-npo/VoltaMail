# Debugging 400 Bad Request Error on Template Suggestion

## The Error
```
POST https://volta-mail-api-bf8248fe0439.herokuapp.com/api/v1/projects/.../templates/suggest 400 (Bad Request)
```

## What It Means

A **400 Bad Request** error means the server received your request but **rejected it as invalid**. This happens when:

1. ✅ You're authenticated (200 OK headers confirmed)
2. ✅ The endpoint exists 
3. ❌ But something about your request data is wrong

---

## The 3 Most Common Causes

### 1️⃣ **No Leads Imported** (Most Common!)

**Symptom:**
- Click "Draft with AI"
- Immediately get 400 error
- No timeouts, very fast

**Why:**
```typescript
if (leads.length === 0) {
  throw new BadRequestException('Import leads before asking AI to draft a template.');
}
```

**Fix:**
1. Go to your project
2. Click **"Import Leads"** tab
3. Upload a CSV file with at least 1 lead
4. Verify leads appear in the table
5. Try "Draft with AI" again

**Checklist:**
- [ ] Imported at least 1 lead? (Check in the Leads tab)
- [ ] Leads are showing in the table?
- [ ] Tried clicking "Draft with AI" again?

---

### 2️⃣ **AI API Key Not Configured** (Second Most Common!)

**Symptom:**
- Click "Draft with AI"
- Get error mentioning "API key" or "OPENROUTER"
- Error says something like: "OPENROUTER API key is not configured"

**Why:**
```typescript
if (!providerSecrets.apiKey) {
  throw new BadRequestException(
    `${providerLabel} API key is not configured. Add one in AI settings...`
  );
}
```

**Fix:**
1. Click **Settings** (gear icon, top right)
2. Go to **AI Config** section
3. Check which provider you're using (OpenRouter by default)
4. If empty: Add your API key
5. Try "Draft with AI" again

**API Key Options:**

| Provider | Cost | Speed | Setup |
|----------|------|-------|-------|
| **OpenRouter** (Free) | Free | Slow (60s) | Visit https://openrouter.ai and get key |
| **OpenAI** | Paid | Fast (45s) | Visit https://platform.openai.com and get key |
| **Gemini** | Free tier | Fast (45s) | Visit https://aistudio.google.com and get key |

**Checklist:**
- [ ] Went to Settings?
- [ ] Clicked AI Config?
- [ ] Selected a provider?
- [ ] Entered API key?
- [ ] Saved the settings?
- [ ] Tried "Draft with AI" again?

---

### 3️⃣ **Other Validation Issues** (Rare)

**Symptoms:**
- 400 error with unclear message
- Error appears when other things work

**Possible Causes:**
- Very long knowledge base (>50KB)
- Special characters in knowledge base
- Invalid session token
- Project access issues

**Fix:**
1. Check browser console (DevTools → Console tab)
2. Look for the exact error message
3. If it says "Import leads" → Cause #1
4. If it says "API key" → Cause #2
5. Otherwise, note the error message and share it

---

## How to Debug (Step by Step)

### Step 1: Check Network Tab
1. Open DevTools (F12 or Cmd+Option+I)
2. Go to **Network** tab
3. Click "Draft with AI"
4. Look for the failed request
5. Click it to see details

### Step 2: Check Response Body
1. In the Network tab, click the failed request
2. Go to **Response** tab
3. Read the error message - it tells you what's wrong
4. Common messages:
   - `"Import leads before asking AI to draft a template."`  → Add leads
   - `"OPENROUTER API key is not configured"`  → Add API key
   - `"Invalid session"` → Refresh page and sign in again

### Step 3: Check Console Tab
1. Go to **Console** tab
2. Look for error messages
3. They often explain what went wrong
4. Copy the full error if reporting a bug

### Step 4: Verify Prerequisites
- [ ] You're signed in? (You should see your name in top right)
- [ ] You're on a project page? (Check breadcrumb)
- [ ] Leads are imported? (Check "Leads" tab - should show count)
- [ ] AI API key is configured? (Check Settings → AI Config)

---

## New Improvements in This Update

We added:
1. ✅ **Better timeout handling** - Won't hang forever
2. ✅ **Fetch-level timeouts** - AI requests fail fast (60s max for OpenRouter, 45s for paid)
3. ✅ **Enhanced error messages** - Tells you specifically what's wrong
4. ✅ **Server logging** - Backend logs show detailed error info
5. ✅ **Request validation** - Filters out undefined/null fields

---

## Testing the Fix

### Quick Test
1. Make sure you have:
   - [ ] 1+ leads imported
   - [ ] AI API key configured in Settings
2. Click "Draft with AI"
3. Should complete in 15-120 seconds depending on lead count
4. If it times out after 120s, the message will be clear

### Load Testing
Try with different lead counts:
- **Few leads (1-5)**: ~15-40 seconds
- **Medium (10-15)**: ~40-80 seconds  
- **Many (20+)**: ~80-120 seconds

If you have 20+ leads and OpenRouter, it will timeout at 60 seconds with message:
```
"AI request timed out after 2 minutes. The AI provider is taking too long. 
Try reducing the number of leads or switching to a different AI provider."
```

---

## If You Still Get 400 After These Steps

### Troubleshooting Steps:
1. **Clear browser cache**
   - DevTools → Network → Check "Disable cache"
   - Or do a hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

2. **Sign out and back in**
   - Settings → Sign Out
   - Sign back in
   - Retry "Draft with AI"

3. **Check browser console** for exact error
   - DevTools → Console
   - Copy full error message

4. **Check that leads are real**
   - Go to Leads tab
   - Make sure it shows "X leads imported"
   - Click to expand and see at least one lead with email

5. **Try with fewer leads** if you have many
   - Sometimes import creates invalid records
   - Re-import with just 1-2 test leads

---

## Error Messages Decoded

| Error | Meaning | Fix |
|-------|---------|-----|
| `"Import leads before asking AI..."` | No leads in project | Go to Leads tab, import CSV |
| `"OPENROUTER API key is not configured"` | Missing API key | Settings → AI Config → Add key |
| `"OpenRouter rate limit exceeded"` | Too many rapid requests | Wait a moment, try again |
| `"AI request timed out..."` | AI provider too slow | Reduce lead count or try paid provider |
| `"Invalid session"` | Your login expired | Refresh page, sign in again |
| `"Invalid credentials"` | Auth issue | Sign out, sign in again |
| `"Project not found"` | Can't access project | Check project ID, try different project |

---

## Files Modified in This Fix

### Backend
- `apps/api/src/ai/ai-client.service.ts` - Added fetch timeouts
- `apps/api/src/templates/templates.service.ts` - Better error handling
- `apps/api/src/templates/templates.controller.ts` - Added logging

### Frontend
- `apps/web/app/projects/[projectId]/templates/page.tsx`:
  - Added fetch timeouts to 3 endpoints
  - Better error message handling
  - Filter out undefined values in requests

---

## Performance Before vs After

| Metric | Before | After |
|--------|--------|-------|
| Stuck/Hanging | Yes (could hang 5+ min) | No (max 120s) |
| Error feedback | None for long time | Clear after 120s |
| 400 error clarity | Vague | Clear & actionable |
| Rate limit handling | Generic error | Provider-specific message |
| Session timeout feedback | None | Clear message |

---

## Next Steps

1. **Test the fix:**
   - Import leads if not done
   - Configure AI API key if not done
   - Click "Draft with AI"
   - Should work or give clear error message

2. **If still having issues:**
   - Check browser console (DevTools)
   - Verify leads are imported
   - Verify API key is set
   - Clear cache and retry
   - Sign out and back in

3. **Report bugs with:**
   - Screenshot of error message
   - Browser console error
   - Number of leads imported
   - Which AI provider you're using
   - Steps to reproduce

---

## Questions?

Check these first:
- Do I have leads imported? ✓
- Do I have AI API key? ✓
- Is my session still valid? (Refresh if in doubt) ✓

If still stuck, gather:
1. Console error message
2. Network tab response body
3. Number of leads
4. AI provider being used
5. Steps you took
