# Preview Testing Suite

## Overview

The preview deployment environment includes a comprehensive automated testing suite that validates code quality, accessibility, performance, and HTML/CSS standards. All tests run automatically when deploying to preview and will abort the deployment if critical failures are detected.

## Test Categories

### 1. **Endpoint Connectivity Tests**

- Tests all API endpoints and pages for HTTP 200 response
- Ensures server is properly responding to requests
- **Runs on:** Every page/endpoint
- **Result:** PASS if 200 OK, FAIL if any error

### 2. **Lighthouse Audits**

Comprehensive Google Lighthouse testing with thresholds:

- **Performance:** > 50/100
- **Accessibility:** > 80/100
- **Best Practices:** > 80/100
- **SEO:** > 80/100
- **PWA:** > 50/100

Tests metrics like:

- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to Interactive (TTI)

### 3. **HTML Validation**

Validates HTML markup against HTML5 standards:

- Checks for invalid elements
- Validates attributes
- Ensures proper document structure
- **Uses:** html-validate library
- **Result:** PASS if valid, WARN if errors found

### 4. **CSS Analysis**

Chrome DevTools CSS inspection:

- Analyzes stylesheets for issues
- Checks for layout problems
- Validates CSS rule application
- **Result:** PASS if no issues, WARN if problems detected

### 5. **Memory Tests**

Monitors memory usage to catch memory leaks:

- **JavaScript Heap Used:** Max 500 MB
- **External Memory:** Max 100 MB

Tests memory on each page load to identify:

- Memory leaks
- Excessive allocations
- Unfreed resources

### 6. **Core Web Vitals**

Tests Google Core Web Vitals metrics:

- **First Contentful Paint (FCP):** < 2500 ms
- **Time to Interactive (TTI):** < 5000 ms
- **Cumulative Layout Shift (CLS):** Minimal

These metrics directly impact user experience and SEO rankings.

## Running Tests Manually

### Test Only (Server Must Be Running)

```bash
npm run test:preview
```

### Start Server + Run Tests

```bash
./deploy.sh -preview
```

## Test Flow

When you run `./deploy.sh -preview`:

```
1. Format code with Prettier
   ↓
2. Lint code with ESLint
   ↓
3. Start server on localhost:5000
   ↓
4. Wait for server to be ready
   ↓
5. Run comprehensive test suite:
   ├─ Endpoint connectivity tests
   ├─ Lighthouse audits
   ├─ HTML validation
   ├─ CSS analysis
   ├─ Memory tests
   └─ Core Web Vitals
   ↓
6. If tests PASS → Server keeps running for manual testing
   If tests FAIL → Abort deployment and report errors
```

## Test Results

### Success Case

```
╔════════════════════════════════════════════════╗
║         TEST RESULTS SUMMARY                  ║
╚════════════════════════════════════════════════╝

Total Tests: 42
✅ Passed: 42
❌ Failed: 0
⚠️ Warnings: 0
⏱️ Duration: 2m 15s

✅ ALL TESTS PASSED
```

Deployment continues → Server runs for manual testing

### Failure Case

```
╔════════════════════════════════════════════════╗
║         TEST RESULTS SUMMARY                  ║
╚════════════════════════════════════════════════╝

Total Tests: 42
✅ Passed: 39
❌ Failed: 3
⚠️ Warnings: 2
⏱️ Duration: 1m 45s

❌ FAILED TESTS:
  • Lighthouse performance: Home
    Score: 45 (threshold: 50)
  • Memory Test: Practice
    Heap: 520MB (max: 500MB)
  • CSS Analysis: Quiz
    3 potential issue(s)

❌ TESTS FAILED
```

Deployment aborted → Error logged and reported

## Configuration

### Test Endpoints

Tests run on all these pages:

- `/` - Home
- `/practice` - Practice
- `/quiz` - Quiz
- `/entries` - Entries
- `/login` - Login
- `/profile` - Profile
- `/logout` - Logout

### Lighthouse Thresholds

Edit in `src/scripts/js/modules/tests/test-config.mjs`:

```javascript
lighthouseThresholds: {
  performance: 50,
  accessibility: 80,
  'best-practices': 80,
  seo: 80,
  pwa: 50,
}
```

### Memory Thresholds

Edit in `src/scripts/js/modules/tests/test-config.mjs`:

```javascript
memoryThresholds: {
  heapUsedMax: 500,      // MB
  externalMax: 100,      // MB
}
```

### Core Web Vitals Thresholds

Edit in `src/scripts/js/modules/tests/preview-tests.mjs`:

```javascript
if (vitals['First Contentful Paint'] > 2500) {
  /* warn */
}
if (vitals['Time to Interactive'] > 5000) {
  /* warn */
}
```

## Understanding the Logs

All test results are logged to `.deployment/last-run.log`:

### Log Example

```
[2026-10-29 11:45:30] [INFO] Running comprehensive preview test suite...
[2026-10-29 11:45:30] [INFO] Tests: Lighthouse, HTML/CSS validation, Memory, Core Web Vitals

[2026-10-29 11:45:31] [INFO] Running endpoint connectivity tests...
[2026-10-29 11:45:32] [SUCCESS] All endpoint tests passed

[2026-10-29 11:45:35] [INFO] Running Lighthouse audits...
[2026-10-29 11:47:15] [SUCCESS] Lighthouse audit completed

[2026-10-29 11:47:20] [INFO] Running HTML validation...
[2026-10-29 11:47:25] [SUCCESS] HTML validation completed

[2026-10-29 11:47:25] [SUCCESS] All preview tests passed
```

### View Log

```bash
# Full log
cat .deployment/last-run.log

# Last 100 lines
tail -100 .deployment/last-run.log

# Search for failures
grep "FAIL" .deployment/last-run.log
```

## Troubleshooting

### Tests Fail: Server Not Running

```
FAIL: Endpoint connectivity
```

Ensure server started before tests run. Check logs:

```bash
tail -50 .deployment/last-run.log
```

### Memory Tests Warn: High Usage

```
WARN: Memory Test: Home
Heap: 520MB (max: 500MB)
```

Investigate potential memory leaks:

1. Check for unbounded arrays
2. Verify event listeners are removed
3. Check for circular references
4. Profile with Chrome DevTools

### Lighthouse Scores Low

```
WARN: Lighthouse performance: Practice
Score: 45 (threshold: 50)
```

Performance tips:

- Minimize large assets
- Optimize images
- Reduce JavaScript
- Use caching headers
- Enable compression

### HTML Validation Warns

```
WARN: HTML Validation: Quiz
5 validation error(s)
```

Common issues:

- Unclosed tags
- Invalid attributes
- Deprecated elements
- Missing required attributes

Fix by:

1. Check source HTML
2. Validate in browser DevTools
3. Fix in template files
4. Re-run tests

## Performance Impact

Typical test suite duration:

| Test                        | Time            |
| --------------------------- | --------------- |
| Endpoint tests              | 10-20s          |
| Lighthouse (all pages)      | 60-90s          |
| HTML validation (all pages) | 5-10s           |
| CSS analysis (all pages)    | 10-15s          |
| Memory tests (all pages)    | 15-25s          |
| Core Web Vitals (all pages) | 10-15s          |
| **Total**                   | **2-3 minutes** |

## Integration with Deployment

### Preview Deployment

- ✅ Runs tests automatically
- ✅ Aborts if tests fail
- ✅ Logs all results
- ✅ Reports errors clearly

### Development Deployment

- ⚠️ Runs basic checks only
- ⚠️ Warnings only (doesn't abort)
- ⚠️ Good for active development

### Production Deployment

- ⚠️ Runs basic checks only
- ⚠️ Warnings only (doesn't abort)
- ⚠️ Developer responsibility for quality

## Continuous Improvement

As features are added, update tests:

1. **New page added:** Add to `TEST_CONFIG.endpoints`
2. **New API endpoint:** Add to endpoint list
3. **Performance changes:** Adjust Lighthouse thresholds
4. **Memory optimization:** Lower `memoryThresholds`
5. **HTML structure:** Run HTML validation tests

## Files

- `src/scripts/js/modules/tests/test-config.mjs` - Configuration and TestResults class
- `src/scripts/js/modules/tests/preview-tests.mjs` - Complete test suite implementation
- `.deployment/last-run.log` - Test results logged here
- `package.json` - `npm run test:preview` script
- `deploy.sh` - Integration with preview deployment

## Summary

✅ **Automated Testing** - Tests run automatically on preview  
✅ **Full Coverage** - All pages and endpoints tested  
✅ **Multiple Suites** - Lighthouse, HTML, CSS, Memory, Vitals  
✅ **Quality Gate** - Aborts deployment if tests fail  
✅ **Full Logging** - All results captured in deployment log  
✅ **Performance Monitoring** - Detects regressions early

Next: Deploy to preview to see comprehensive testing in action!

```bash
./deploy.sh -preview
```
