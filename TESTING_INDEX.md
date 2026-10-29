# Testing Documentation Index

Complete guide to testing and quality assurance in the FlashCards project.

## Quick Start

New to testing? Start here:

- **5-minute quickstart:** [TESTING_QUICK_REFERENCE.md](./TESTING_QUICK_REFERENCE.md)
- **Full guide:** [TESTING_PREVIEW.md](./TESTING_PREVIEW.md)
- **Firefox testing:** [FIREFOX_TESTING_QUICK_SETUP.md](./FIREFOX_TESTING_QUICK_SETUP.md) (cross-browser validation)

## Testing Levels

### 1. **Local Development (Dev)**

```bash
./deploy.sh -dev
```

- **Purpose:** Active development, quick iteration
- **Tests:** Basic checks only (format, lint warnings)
- **Aborts on failure:** ❌ No
- **Time:** ~30 seconds
- **Database:** Remote Render PostgreSQL
- **Server:** Runs locally with Nodemon

**When to use:** Daily development, testing features locally

### 2. **Preview Testing (Preview)**

```bash
./deploy.sh -preview
```

- **Purpose:** Quality gate before committing
- **Tests:** Format → Lint (strict) → Full test suite
- **Aborts on failure:** ✅ Yes
- **Time:** 2-3 minutes
- **Database:** Remote Render PostgreSQL
- **Server:** Runs locally, cleaned up after tests

**When to use:** Before committing, validating changes, checking performance

**Test suite includes:**

- ✅ Endpoint connectivity (all 7 pages)
- ✅ Lighthouse audits (Performance, Accessibility, Best Practices, SEO, PWA)
- ✅ HTML validation (all pages)
- ✅ CSS analysis (all pages)
- ✅ Memory tests (leak detection)
- ✅ Core Web Vitals (user experience metrics)
- ✅ Firefox accessibility testing (optional - WCAG compliance via axe)

### 3. **Production Deployment (Prod)**

```bash
./deploy.sh -prod
```

- **Purpose:** Deploy to live Render server
- **Tests:** Basic checks only (format, lint warnings)
- **Aborts on failure:** ❌ No
- **Time:** ~2 minutes (+ 30s Render deploy wait)
- **Database:** Remote Render PostgreSQL
- **Server:** Deployed to Render via GitHub webhook

**When to use:** Release to production after preview passes

### 4. **All Environments**

```bash
./deploy.sh -all
```

- **Runs:** Dev → Preview → Prod in order
- **Stops on failure:** Preview failure aborts further deployments
- **Time:** ~5-6 minutes total

## Test Categories

### Endpoint Connectivity

- **What:** HTTP 200 validation for all routes
- **Why:** Ensures server responds to requests
- **Files:** 7 pages (Home, Practice, Quiz, Entries, Login, Profile, Logout)
- **Duration:** 10-20s

### Lighthouse Audits

- **What:** Google Lighthouse comprehensive audits
- **Metrics tested:**
  - Performance (score > 50)
  - Accessibility (score > 80)
  - Best Practices (score > 80)
  - SEO (score > 80)
  - PWA (score > 50)
- **Details:** FCP, LCP, CLS, TTI, etc.
- **Duration:** 60-90s

### HTML Validation

- **What:** HTML5 standards validation
- **Detects:** Invalid elements, bad attributes, structure errors
- **Files:** All 7 pages validated
- **Duration:** 5-10s

### CSS Analysis

- **What:** Chrome DevTools CSS inspection
- **Detects:** Layout problems, styling issues
- **Files:** All 7 pages analyzed
- **Duration:** 10-15s

### Memory Tests

- **What:** Memory leak detection
- **Thresholds:**
  - JavaScript Heap: max 500 MB
  - External Memory: max 100 MB
- **Files:** All 7 pages tested
- **Duration:** 15-25s

### Core Web Vitals

- **What:** Google user experience metrics
- **Metrics:**
  - First Contentful Paint (FCP) < 2500ms
  - Time to Interactive (TTI) < 5000ms
  - Cumulative Layout Shift (CLS) minimal
- **Duration:** 10-15s

### Firefox Accessibility Testing (Optional)

- **What:** axe accessibility audit with Firefox WebDriver
- **Why:** Deep WCAG compliance verification
- **Validates:**
  - WCAG 2.0 Level A, AA, AAA compliance
  - ARIA attributes and semantic HTML
  - Color contrast ratios
  - Keyboard navigation
  - Form labels and alt text
- **Files:** All 7 pages tested with axe
- **Duration:** 30-60s
- **Note:** Requires Firefox installation and GeckoDriver
- **See:** [FIREFOX_TESTING_QUICK_SETUP.md](./FIREFOX_TESTING_QUICK_SETUP.md)

## Code Quality Tools

### Prettier (Code Formatter)

```bash
npm run format        # Auto-fix formatting
npm run format:check  # Check without fixing
```

**What it fixes:**

- Indentation (2 spaces)
- Quote style (single quotes)
- Line length (100 chars)
- Trailing commas (ES5)

**When:** Automatically runs on preview deployment

### ESLint (Code Linter)

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
```

**What it checks:**

- Best practices
- Common errors
- Code style consistency
- JavaScript standards

**When:** Automatically runs on preview deployment (strict mode)

### Verify Script

```bash
npm run verify        # Run format then lint check
```

**Equivalent to:**

1. Format code
2. Check linting
3. Report issues

**Use before committing:** `npm run verify`

## Troubleshooting Tests

### Tests Fail: Server Won't Start

```
[ERROR] Failed to start server on port 5000
```

**Debug:**

```bash
tail -100 .deployment/last-run.log  # Check error message
npm install                          # Ensure dependencies
./deploy.sh -dev                     # Test dev deployment
```

### Tests Fail: Lighthouse Score Too Low

```
WARN: Lighthouse performance: Home
Score: 45 (threshold: 50)
```

**Fix:**

- Optimize images (use modern formats)
- Minimize JavaScript
- Enable gzip compression
- Use CSS efficiently
- Check for render-blocking resources

### Tests Warn: Memory Too High

```
WARN: Memory Test: Practice
Heap: 520MB (max: 500MB)
```

**Investigate:**

- Check for unbounded arrays
- Verify event listeners cleaned up
- Look for circular references
- Profile with Chrome DevTools

### Tests Fail: HTML Invalid

```
WARN: HTML Validation: Quiz
5 validation error(s)
```

**Fix in templates:**

- Close all HTML tags
- Fix deprecated elements
- Add required attributes
- Validate element nesting

## Continuous Integration

### GitHub Integration

Tests run as part of `./deploy.sh -preview`:

- ✅ Code formatting validated
- ✅ Linting enforced
- ✅ All 6 test suites executed
- ✅ Deployment aborted if failures

### Pre-commit Best Practice

Before committing:

```bash
npm run verify                 # Format + lint check
./deploy.sh -preview          # Full test suite
git add .
git commit -m "Your message"
```

## Configuration

### Adjust Thresholds

Edit `src/tests/test-config.mjs`:

```javascript
// Lighthouse thresholds
lighthouseThresholds: {
  performance: 50,
  accessibility: 80,
  'best-practices': 80,
  seo: 80,
  pwa: 50,
}

// Memory limits
memoryThresholds: {
  heapUsedMax: 500,      // MB
  externalMax: 100,      // MB
}
```

### Core Web Vitals

Edit `src/tests/preview-tests.mjs`:

```javascript
const webVitalThresholds = {
  'First Contentful Paint': 2500, // ms
  'Time to Interactive': 5000, // ms
};
```

### Add/Remove Endpoints

Edit `src/tests/test-config.mjs`:

```javascript
endpoints: [
  { url: '/', name: 'Home' },
  { url: '/practice', name: 'Practice' },
  // Add new endpoints here
];
```

## Test Files

| File                          | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `src/tests/test-config.mjs`   | Configuration, results tracking, test endpoints |
| `src/tests/preview-tests.mjs` | Complete test suite implementation              |
| `.deployment/last-run.log`    | Test results and deployment log                 |
| `eslint.config.js`            | Linting rules (Node.js + ES2024)                |
| `.prettierrc.json`            | Formatting rules                                |
| `package.json`                | npm scripts and dependencies                    |
| `deploy.sh`                   | Deployment automation with testing              |

## Documentation Files

| File                         | Purpose                          |
| ---------------------------- | -------------------------------- |
| `TESTING_PREVIEW.md`         | Complete preview testing guide   |
| `TESTING_QUICK_REFERENCE.md` | Quick reference for common tasks |
| `CODE_QUALITY.md`            | Linting and formatting guide     |
| `TESTING_STRATEGY.md`        | High-level testing approach      |
| `DEPLOY.md`                  | Deployment guide with all modes  |
| `ENVIRONMENTS.md`            | Dev, preview, prod architecture  |

## Performance Expectations

### Test Timing

- **Endpoint tests:** 10-20 seconds
- **Lighthouse audits:** 60-90 seconds
- **HTML validation:** 5-10 seconds
- **CSS analysis:** 10-15 seconds
- **Memory tests:** 15-25 seconds
- **Core Web Vitals:** 10-15 seconds
- **Total suite:** 2-3 minutes

### Server Response Times

- Page load: < 500ms
- API endpoints: < 200ms
- Redirect: < 100ms

## Common Workflows

### After Feature Implementation

```bash
# 1. Test locally
./deploy.sh -dev

# 2. Verify code quality
npm run verify

# 3. Run full test suite
./deploy.sh -preview

# 4. Fix any issues found
# (Edit files as needed)

# 5. Commit when tests pass
git add .
git commit -m "feat: Add new feature"
git push
```

### Debugging a Test Failure

```bash
# 1. Check deployment log
tail -100 .deployment/last-run.log

# 2. Start dev server for debugging
./deploy.sh -dev

# 3. Open browser and inspect
# http://localhost:5000

# 4. Check Chrome DevTools (F12)
# - Console for errors
# - Network for slow requests
# - Lighthouse for performance

# 5. Fix and re-test
./deploy.sh -preview
```

### Performance Optimization

```bash
# 1. Identify slow tests
grep "Lighthouse\|WARN\|Performance" .deployment/last-run.log

# 2. Profile with Chrome DevTools
# - Open http://localhost:5000
# - Open DevTools (F12)
# - Performance tab → Record

# 3. Optimize and test
./deploy.sh -preview

# 4. Verify improvements
# Check Lighthouse scores in log
```

## Next Steps

1. **Run preview tests:**

   ```bash
   ./deploy.sh -preview
   ```

2. **Review results:**

   ```bash
   cat .deployment/last-run.log
   ```

3. **Fix any issues found**
   - See troubleshooting section above

4. **Commit when passing:**
   ```bash
   git add .
   git commit -m "Your message"
   ./deploy.sh -prod
   ```

## Reference

- [TESTING_PREVIEW.md](./TESTING_PREVIEW.md) - Full testing guide (Chrome Lighthouse)
- [TESTING_QUICK_REFERENCE.md](./TESTING_QUICK_REFERENCE.md) - Quick commands
- [FIREFOX_TESTING.md](./FIREFOX_TESTING.md) - Firefox tools and options
- [FIREFOX_TESTING_QUICK_SETUP.md](./FIREFOX_TESTING_QUICK_SETUP.md) - Firefox implementation guide
- [CODE_QUALITY.md](./CODE_QUALITY.md) - Linting and formatting
- [DEPLOY.md](./DEPLOY.md) - Deployment guide
- [TESTING_STRATEGY.md](./documents/TESTING_STRATEGY.md) - High-level strategy
- `.deployment/last-run.log` - Latest test results

## Chrome vs Firefox Testing

### Chrome Lighthouse (Built-in)

✅ Performance audits  
✅ Accessibility (basic)  
✅ Best practices  
✅ SEO optimization  
✅ PWA compliance  
✅ Core Web Vitals

### Firefox Testing (Optional Add-on)

✅ Deep accessibility (axe audit)  
✅ WCAG 2.0 AA/AAA compliance  
✅ Keyboard navigation  
✅ ARIA validation  
✅ Cross-browser verification

**Recommendation:** Use both for comprehensive coverage. Start with Chrome Lighthouse, then add Firefox for accessibility compliance when needed.

See [FIREFOX_TESTING_QUICK_SETUP.md](./FIREFOX_TESTING_QUICK_SETUP.md) to enable Firefox testing.
