# Firefox Testing & Validation Tools

## Overview

Firefox provides multiple testing and validation capabilities that complement Chrome's Lighthouse. This guide explains what tools are available and what needs to be added to your test suite.

---

## Firefox DevTools Available for Automated Testing

### 1. **Firefox Accessibility Inspector** ✅
- **What:** Validates accessibility tree and ARIA attributes
- **Why:** Ensures compliance with WCAG standards
- **Validates:**
  - Element roles and semantics
  - ARIA labels and descriptions
  - Keyboard navigation
  - Contrast ratios
  - Text alternatives

**Automated Testing Option:** Yes - via WebDriver + Firefox

### 2. **Firefox Performance Profiler** ✅
- **What:** CPU and memory profiling
- **Why:** Detect performance bottlenecks
- **Metrics:**
  - CPU time
  - Memory allocations
  - Function call timing
  - GC pauses

**Automated Testing Option:** Limited - via WebDriver

### 3. **Firefox Network Monitor** ✅
- **What:** Network request inspection
- **Why:** Identify slow endpoints
- **Validates:**
  - Request/response times
  - HTTP headers
  - Cache headers
  - Network throttling

**Automated Testing Option:** Yes - via WebDriver Protocol

### 4. **Firefox Responsive Design Mode** ✅
- **What:** Multi-device testing
- **Why:** Verify mobile responsiveness
- **Tests:**
  - Different screen sizes
  - Touch events
  - Device pixel ratios
  - Orientation changes

**Automated Testing Option:** Yes - via WebDriver + viewport control

### 5. **Firefox Inspector (HTML/CSS)** ✅
- **What:** DOM and CSS validation
- **Why:** Verify correct markup
- **Validates:**
  - CSS rules applied
  - Box model
  - Layout issues
  - CSS Grid/Flexbox

**Automated Testing Option:** Limited - via WebDriver

---

## Current Test Coverage vs Firefox

| Test | Chrome (Lighthouse) | Firefox Available | Needed? |
|------|---------------------|-------------------|---------|
| **Performance** | ✅ Covered | ✅ Yes (Profiler) | Recommended |
| **Accessibility** | ✅ Covered | ✅ Yes (Inspector) | Recommended |
| **HTML/CSS Validation** | ⚠️ Limited | ✅ Yes (Inspector) | Already covered (html-validate) |
| **Network Analysis** | ✅ Covered | ✅ Yes (Monitor) | Optional |
| **Mobile Responsive** | ✅ Covered | ✅ Yes (RDM) | Already covered (Lighthouse) |
| **Memory Leaks** | ✅ Covered | ✅ Yes (Profiler) | Already covered |

---

## Recommended Firefox Tools to Add

### Priority 1: **Accessibility Testing with axe-firefox**
```bash
npm install --save-dev axe-webdriverjs geckodriver
```

**What it does:**
- Runs accessibility audit using Deque's axe library
- Compatible with Firefox WebDriver
- Checks for WCAG 2.1 compliance
- Reports detailed accessibility issues

**Integration:** Add to `preview-tests.mjs`

### Priority 2: **Firefox Performance Profiling**
```bash
npm install --save-dev firefox-performance-profiler
```

**What it does:**
- Profiles CPU and memory performance
- Compares against baseline
- Identifies bottlenecks
- Works with Firefox Profiler API

**Integration:** Add to `preview-tests.mjs` (complementary to Lighthouse)

### Priority 3: **Network Throttling Analysis**
```bash
npm install --save-dev
# WebDriver already has throttling capability
```

**What it does:**
- Tests on simulated network conditions (Fast 3G, Slow 3G, Offline)
- Measures performance under poor conditions
- Validates progressive enhancement

**Integration:** Add to `preview-tests.mjs`

---

## Implementation Plan

### Phase 1: Add Accessibility Testing with axe (Recommended)
**File:** `src/tests/firefox-accessibility-tests.mjs`

```javascript
import { remote } from 'webdriverio';
import axe from 'axe-webdriverjs';

async function testAccessibilityWithFirefox(endpoints) {
  const browser = await remote({
    logLevel: 'error',
    path: '/',
    port: 4444,
    capabilities: {
      browserName: 'firefox',
      'moz:firefoxOptions': {
        headless: true,
        args: ['--no-sandbox']
      }
    }
  });

  const results = [];

  for (const endpoint of endpoints) {
    await browser.navigateTo(`http://localhost:5000${endpoint.url}`);
    await browser.waitUntil(async () => {
      return await browser.execute(() => document.readyState === 'complete');
    });

    const a11yResults = await axe(browser);
    
    results.push({
      endpoint: endpoint.name,
      violations: a11yResults.violations,
      passes: a11yResults.passes
    });
  }

  await browser.deleteSession();
  return results;
}
```

**Integration in deploy.sh:**
```bash
run_firefox_accessibility_tests() {
  echo "[INFO] Running Firefox accessibility tests..."
  node src/tests/firefox-accessibility-tests.mjs
  # Capture results and report
}
```

### Phase 2: Add Performance Profiling
**File:** `src/tests/firefox-performance-tests.mjs`

```javascript
import { remote } from 'webdriverio';

async function testPerformanceWithFirefox(endpoints) {
  const browser = await remote({
    capabilities: {
      browserName: 'firefox',
      'moz:firefoxOptions': {
        headless: true
      }
    }
  });

  const results = [];

  for (const endpoint of endpoints) {
    await browser.navigateTo(`http://localhost:5000${endpoint.url}`);
    
    // Get Firefox performance metrics
    const timing = await browser.execute(() => {
      const perf = window.performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
        responseTime: perf.responseEnd - perf.responseStart
      };
    });

    results.push({
      endpoint: endpoint.name,
      ...timing
    });
  }

  await browser.deleteSession();
  return results;
}
```

### Phase 3: Add Network Throttling Tests
Integrate with existing Puppeteer tests but add Firefox variant:

```javascript
// Simulate network conditions
const networkProfiles = [
  { name: 'Fast 3G', download: 1.6, upload: 0.75 },
  { name: 'Slow 3G', download: 0.4, upload: 0.05 },
  { name: 'Offline', download: 0, upload: 0 }
];

for (const profile of networkProfiles) {
  // Test each endpoint under network conditions
  await browser.setNetworkConnection(profile);
  // Measure response times
}
```

---

## Installation Steps

### Step 1: Install Firefox WebDriver Tools
```bash
npm install --save-dev geckodriver axe-webdriverjs webdriverio
```

### Step 2: Start GeckoDriver Service
In `deploy.sh` preview function, before running tests:

```bash
# Start GeckoDriver (Firefox WebDriver server)
geckodriver --port 4444 &
GECKO_PID=$!

# Wait for it to be ready
sleep 2

# Run Firefox tests
node src/tests/firefox-accessibility-tests.mjs

# Stop GeckoDriver
kill $GECKO_PID
```

### Step 3: Add to package.json
```json
{
  "scripts": {
    "test:firefox": "node src/tests/firefox-accessibility-tests.mjs",
    "test:preview": "npm run test:firefox && node src/tests/preview-tests.mjs"
  },
  "devDependencies": {
    "geckodriver": "^8.0.0",
    "axe-webdriverjs": "^4.7.0",
    "webdriverio": "^8.0.0"
  }
}
```

---

## Firefox vs Chrome Coverage

### Chrome Lighthouse (Current)
✅ Performance metrics  
✅ Accessibility basic  
✅ Best Practices  
✅ SEO  
✅ PWA  
❌ Deep accessibility validation (WCAG 2.1 AA/AAA)  
❌ Keyboard navigation verification  

### Firefox Tests (Proposed)
✅ Deep accessibility (axe audit)  
✅ Keyboard navigation  
✅ WCAG 2.1 compliance  
✅ Contrast ratio validation  
✅ ARIA attribute verification  
✅ Performance profiling  
✅ Network analysis under throttling  

---

## Why Both Chrome & Firefox?

### Chrome Lighthouse Strengths
- Full-page performance audit
- SEO optimization recommendations
- PWA compliance check
- Core Web Vitals measurements
- Large ecosystem of tools

### Firefox Strengths
- **Better accessibility testing** - axe library is comprehensive
- **Network protocol closer to real Firefox users** - GeckoDriver is official Mozilla tool
- **Different rendering engine** - Catches cross-browser issues
- **Open source** - More transparent about what's tested

### Combined Benefits
✅ Catch issues Lighthouse misses  
✅ Verify cross-browser compatibility  
✅ Ensure deep accessibility compliance  
✅ Test under real Firefox rendering  
✅ Validate network resilience  

---

## Test Execution Flow

### Current (Chrome Only)
```
Format → Lint → Start Server → Lighthouse Tests → HTML Validation → Memory Tests
```

### With Firefox
```
Format → Lint → Start Server + GeckoDriver
  ├─ Lighthouse Tests (Chrome)
  ├─ Firefox Accessibility Tests (axe)
  ├─ Firefox Performance Tests
  ├─ Firefox Network Throttling Tests
  ├─ HTML Validation
  └─ Memory Tests
```

**Additional Time:** 60-90 seconds (Firefox tests typically run 1-1.5 minutes)

---

## Configuration

### Firefox Test Config
Create `src/tests/firefox-config.mjs`:

```javascript
export const FIREFOX_CONFIG = {
  browser: {
    name: 'Firefox',
    path: 'geckodriver',
    port: 4444
  },
  
  accessibility: {
    standards: ['wcag2aa', 'wcag2aaa'],
    timeout: 30000,
    thresholds: {
      violations: 0,        // No violations allowed
      warnings: 10          // Allow some warnings
    }
  },

  performance: {
    thresholds: {
      domContentLoaded: 2000,  // ms
      loadComplete: 3000,      // ms
      responseTime: 500        // ms
    }
  },

  network: {
    throttleProfiles: [
      { name: 'Fast 3G', speed: 'fast' },
      { name: 'Slow 3G', speed: 'slow' },
      { name: 'Offline', speed: 'offline' }
    ]
  }
};
```

---

## Deployment Integration

Update `deploy.sh`:

```bash
run_firefox_tests() {
  echo "[INFO] Starting GeckoDriver for Firefox testing..."
  
  # Start GeckoDriver
  geckodriver --port 4444 > /tmp/geckodriver.log 2>&1 &
  GECKO_PID=$!
  
  # Wait for GeckoDriver to be ready
  sleep 2
  
  # Run Firefox tests
  echo "[INFO] Running Firefox accessibility tests..."
  node src/tests/firefox-accessibility-tests.mjs
  
  echo "[INFO] Running Firefox performance tests..."
  node src/tests/firefox-performance-tests.mjs
  
  # Clean up
  kill $GECKO_PID 2>/dev/null
  
  echo "[SUCCESS] Firefox tests completed"
}
```

---

## Summary

### What to Add for Firefox Testing:

| Tool | Package | Purpose | Priority |
|------|---------|---------|----------|
| **axe Accessibility** | `axe-webdriverjs` | WCAG compliance | HIGH |
| **GeckoDriver** | `geckodriver` | Firefox WebDriver | HIGH |
| **WebDriver I/O** | `webdriverio` | Automation framework | HIGH |
| **Firefox Profiler** | Built-in API | Performance metrics | MEDIUM |
| **Network Throttling** | WebDriver API | Network conditions | MEDIUM |

### Minimal Setup (High Priority Only):
```bash
npm install --save-dev geckodriver axe-webdriverjs webdriverio
```

Then add:
1. `src/tests/firefox-accessibility-tests.mjs` - Accessibility audits
2. `src/tests/firefox-config.mjs` - Configuration
3. Update `deploy.sh` - Integration into preview

### Result:
✅ Firefox accessibility testing  
✅ Cross-browser validation  
✅ WCAG 2.1 AA compliance verification  
✅ Real Firefox rendering validation  

**Total Additional Time:** ~60-90 seconds per preview deployment

---

## Next Steps

Ready to implement Firefox testing?

1. Install packages: `npm install --save-dev geckodriver axe-webdriverjs webdriverio`
2. Create `src/tests/firefox-accessibility-tests.mjs`
3. Create `src/tests/firefox-config.mjs`
4. Update `deploy.sh` to run Firefox tests
5. Update `TESTING_INDEX.md` with Firefox section

Or provide feedback on priority/implementation approach first.
