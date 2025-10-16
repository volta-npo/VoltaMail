# AI Timeout Fixes - Test Suite Summary

## Overview
Comprehensive test suite created for AI timeout fixes in the template generation service.

## Test Coverage

### Scenario 1: Zero Leads - Immediate Error ✅
**Tests:** 2
- `suggestTemplate` with no leads - immediate error
- `generateAiDrafts` with no leads - immediate error

**Expected Behavior:**
- Error thrown before any AI call
- Message: "Import leads before asking AI to draft a template."
- No AI resources consumed

### Scenario 2: Single Lead - Fast Response ✅
**Tests:** 1
- Single lead with 1-second AI response
- Completes well within 20-second timeout

**Expected Behavior:**
- Successful completion < 3 seconds
- Correct timeout calculation (15s base + 8s/lead for free models)

### Scenario 3: Multiple Leads - Progressive Timeout ✅
**Tests:** 3
- 3 leads (~30s timeout)
- 5 leads (~40s timeout)
- 10 leads (120s max timeout cap)

**Expected Behavior:**
- Timeout scales: base(15s) + (leadsCount × timePerLead)
- Free models: 8s per lead
- Paid models: 5s per lead
- Maximum timeout: 120s (2 minutes)

### Scenario 4: Timeout Exceeded ⏱️
**Tests:** 2
- Single lead with 30s AI response (exceeds timeout)
- Verify error message is actionable

**Expected Behavior:**
- BadRequestException thrown
- Message includes: timeout duration, lead count, actionable suggestions

### Scenario 5: Concurrency Limits ✅
**Tests:** 3
- OpenRouter (free): 2 workers max
- OpenAI (paid): 6 workers max
- Environment variable override: custom worker count

**Expected Behavior:**
- Concurrent execution respects limits
- No rate limit violations
- Efficient resource utilization

### Scenario 6: Provider-Specific Timeouts ✅
**Tests:** 3
- OpenRouter free models: 8s per lead
- OpenAI paid models: 5s per lead
- Gemini: 3 workers concurrency

**Expected Behavior:**
- Correct timeout calculation per provider
- Appropriate concurrency based on provider
- Provider-specific optimizations applied

### Scenario 7: Error Handling and Recovery ✅
**Tests:** 3
- Single lead failure fails entire batch (current behavior)
- Malformed AI response handling
- Empty AI response handling

**Expected Behavior:**
- Graceful error handling
- Fallback values for malformed responses
- Informative error messages

### Additional Tests: Chat and Suggest Templates ✅
**Tests:** 3
- `chatWithTemplate` with timeout
- `chatWithTemplate` timeout exceeded
- `suggestTemplate` with timeout

**Expected Behavior:**
- Same timeout logic applied consistently
- Appropriate error messages for each endpoint

## Test Statistics

- **Total Test Scenarios:** 7
- **Total Test Cases:** 20+
- **Code Coverage:** Targets key timeout logic
- **Mock Objects:** PrismaService, AiClientService, AiConfigService, ProjectAccessService, GmailService

## Implementation Details

### Key Methods Tested

1. **`calculateTimeout(leadsCount, provider)`**
   - Base timeout: 15 seconds
   - Per-lead timeout: 5-8 seconds (provider-dependent)
   - Maximum timeout: 120 seconds

2. **`getWorkerCount(provider, leadsCount)`**
   - OpenRouter (free): 2 workers
   - Gemini: 3 workers
   - OpenAI/paid: 6 workers
   - Respects `AI_DRAFT_CONCURRENCY` environment variable

3. **`runWithTimeout(promise, message, timeoutMs)`**
   - Race condition between operation and timeout
   - Proper cleanup of timeout handlers
   - Throws BadRequestException with custom message

### Timeout Calculation Examples

| Provider | Leads | Calculation | Timeout |
|----------|-------|-------------|---------|
| OpenRouter (free) | 1 | 15s + (1 × 8s) | 23s |
| OpenRouter (free) | 3 | 15s + (3 × 8s) | 39s |
| OpenAI (paid) | 1 | 15s + (1 × 5s) | 20s |
| OpenAI (paid) | 5 | 15s + (5 × 5s) | 40s |
| Any provider | 20 | 15s + (20 × 8s) | 120s (capped) |

### Worker Count Examples

| Provider | Default Workers | With Env Override | Max Concurrent |
|----------|----------------|-------------------|----------------|
| OpenRouter | 2 | Respects override | min(workers, leads) |
| Gemini | 3 | Respects override | min(workers, leads) |
| OpenAI | 6 | Respects override | min(workers, leads) |

## Running the Tests

```bash
# Run all tests
cd apps/api
npm test

# Run specific test file
npm test -- templates.service.test.ts

# Run with verbose output
npm test -- templates.service.test.ts --reporter=verbose

# Run specific test suite
npm test -- templates.service.test.ts -t "Zero Leads"
```

## Test Dependencies

- **vitest**: Testing framework
- **@nestjs/common**: Exception types
- **Mocked Services:**
  - PrismaService
  - ProjectAccessService
  - AiClientService
  - GmailService
  - AiConfigService

## Notes on Long-Running Tests

Some tests (Scenario 4) intentionally test timeout behavior and may take 30+ seconds to complete. The vitest configuration includes extended timeouts for these specific test cases:

```typescript
it('should timeout when AI takes too long', async () => {
  // Test implementation
}, 35000); // 35-second timeout for this specific test
```

## Future Enhancements

Potential improvements to test coverage:

1. **Partial Failure Recovery** (Not yet implemented in service)
   - Continue processing remaining leads if one fails
   - Return partial results with error details

2. **Dynamic Timeout Adjustment**
   - Adjust timeout based on historical AI performance
   - Provider-specific timeout learning

3. **Performance Benchmarking**
   - Measure actual vs expected execution times
   - Track concurrency efficiency

4. **Rate Limit Testing**
   - Simulate provider rate limit responses
   - Verify backoff/retry logic

## Coordination Hooks Used

```bash
# Pre-task
npx claude-flow@alpha hooks pre-task --description "Create timeout test suite"

# During testing
npx claude-flow@alpha hooks notify --message "Test scenario: {name} - Status: {pass/fail}"

# Post-task
npx claude-flow@alpha hooks post-task --task-id "timeout-tests"
```

## Test Results Location

Test results are stored in memory at:
- `.swarm/memory.db` - Coordination state
- Test output - Console and CI logs

## Integration with CI/CD

These tests should be integrated into the CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Timeout Tests
  run: |
    cd apps/api
    npm test -- templates.service.test.ts
```

## Success Criteria

- ✅ All zero-lead scenarios fail fast
- ✅ Single-lead scenarios complete within timeout
- ✅ Multi-lead timeouts scale progressively
- ✅ Concurrency limits respected per provider
- ✅ Error messages are actionable
- ✅ Graceful handling of malformed responses
- ✅ Environment variable overrides work correctly

---

**Test Suite Created:** 2025-10-15
**Agent:** Tester (Hive Mind)
**Task ID:** task-1760574949090-rk8y488z1
