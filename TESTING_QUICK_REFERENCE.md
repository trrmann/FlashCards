# Testing Quick Reference

## Manual Testing

```bash
# Start server (dev mode - non-blocking tests)
./deploy.sh -dev

# Test preview (with format, lint, AND comprehensive tests)
./deploy.sh -preview

# Run tests only (server must be running first)
npm run test:preview
```

## What Gets Tested in Preview

✅ **7 Endpoints**

- Home, Practice, Quiz, Entries, Login, Profile, Logout

✅ **Lighthouse** (Performance, Accessibility, Best Practices, SEO, PWA)

- Min thresholds: Performance 50, Accessibility 80, Best Practices 80, SEO 80, PWA 50

✅ **HTML Validation** (HTML5 standards)

- Checks all pages for invalid markup

✅ **CSS Analysis** (Chrome DevTools)

- Detects layout and styling issues

✅ **Memory Tests** (Memory leak detection)

- Max heap: 500MB
- Max external: 100MB

✅ **Core Web Vitals** (User experience metrics)

- First Contentful Paint < 2500ms
- Time to Interactive < 5000ms

## Test Results

### All Pass ✅

```
./deploy.sh -preview
→ Format ✓
→ Lint ✓
→ Start server ✓
→ Run tests ✓
→ Server keeps running for manual testing
```

### Tests Fail ❌

```
./deploy.sh -preview
→ Format ✓
→ Lint ✓
→ Start server ✓
→ Run tests ✗ ABORT
→ Error logged to .deployment/last-run.log
→ Fix issues and re-run
```

## Viewing Results

```bash
# Full log
cat .deployment/last-run.log

# Last 50 lines
tail -50 .deployment/last-run.log

# Only failures
grep "FAIL" .deployment/last-run.log

# Only warnings
grep "WARN" .deployment/last-run.log
```

## Typical Flow

1. **Write code**

   ```bash
   # Edit files...
   ```

2. **Format & Verify**

   ```bash
   npm run verify
   ```

3. **Test on preview**

   ```bash
   ./deploy.sh -preview
   ```
   - Format code ✓
   - Lint code ✓
   - Start server ✓
   - Lighthouse, HTML, CSS, Memory, Vitals tests ✓
   - Server ready for manual testing

4. **Manual Testing**
   - Open http://localhost:5000
   - Test features
   - Check console/DevTools

5. **Commit & Deploy**
   ```bash
   git add .
   git commit -m "Your message"
   ./deploy.sh -prod
   ```

## Common Test Failures

| Issue                  | Fix                                       |
| ---------------------- | ----------------------------------------- |
| Server won't start     | Check .deployment/last-run.log for errors |
| Lighthouse low score   | Optimize performance (images, JS, CSS)    |
| Memory too high        | Find and fix memory leaks                 |
| HTML validation errors | Check template syntax                     |
| CSS analysis issues    | Review stylesheet rules                   |

## Configuration

To adjust test thresholds, edit `src/tests/test-config.mjs`:

```javascript
lighthouseThresholds: {
  performance: 50,        // Adjust here
  accessibility: 80,      // Adjust here
  'best-practices': 80,   // Adjust here
  seo: 80,                // Adjust here
  pwa: 50,                // Adjust here
}

memoryThresholds: {
  heapUsedMax: 500,       // Max MB for JS heap
  externalMax: 100,       // Max MB external memory
}
```

## Test Timing

Total time: **2-3 minutes**

- Endpoint tests: 10-20s
- Lighthouse: 60-90s
- HTML validation: 5-10s
- CSS analysis: 10-15s
- Memory tests: 15-25s
- Core Web Vitals: 10-15s

## See Also

- [TESTING_PREVIEW.md](./TESTING_PREVIEW.md) - Complete guide
- [CODE_QUALITY.md](./CODE_QUALITY.md) - Linting & formatting
- [DEPLOY.md](./DEPLOY.md) - Deployment guide
- `.deployment/last-run.log` - Test results log
