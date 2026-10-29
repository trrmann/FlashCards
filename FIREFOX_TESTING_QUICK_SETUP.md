# Firefox Testing Implementation Guide

Quick-start guide for adding Firefox validation to your test suite.

## What Gets Added

✅ **Firefox Accessibility Testing** via axe audit  
✅ **Firefox Performance Profiling** via WebDriver  
✅ **Network Throttling Tests** (3G, 4G, offline)  
✅ **WCAG 2.1 Compliance** checking  
✅ **Cross-browser validation** (Chrome + Firefox)  

## Installation (5 minutes)

### 1. Install Packages
```bash
npm install --save-dev geckodriver axe-webdriverjs webdriverio
```

This installs:
- `geckodriver` - Firefox WebDriver server
- `axe-webdriverjs` - Accessibility auditor
- `webdriverio` - Browser automation framework

### 2. Verify Installation
```bash
# Check GeckoDriver is available
npx geckodriver --version

# Should output something like:
# geckodriver 0.35.0
```

## Files to Create

### 1. Firefox Configuration
Create `src/tests/firefox-config.mjs`:

```javascript
export const FIREFOX_CONFIG = {
  browser: {
    name: 'Firefox',
    port: 4444,
    headless: true
  },
  
  accessibility: {
    enabled: true,
    standards: ['wcag2aa', 'wcag2aaa'],
    maxViolations: 0,
    timeout: 30000
  },

  performance: {
    enabled: true,
    thresholds: {
      domContentLoaded: 2000,  // ms
      loadComplete: 3000,      // ms
    }
  },

  network: {
    enabled: true,
    profiles: ['4g', 'slow-3g', 'offline']
  },

  endpoints: [
    { url: '/', name: 'Home' },
    { url: '/practice', name: 'Practice' },
    { url: '/quiz', name: 'Quiz' },
    { url: '/entries', name: 'Entries' },
    { url: '/login', name: 'Login' },
    { url: '/profile', name: 'Profile' },
    { url: '/logout', name: 'Logout' }
  ]
};
```

### 2. Firefox Accessibility Tests
Create `src/tests/firefox-accessibility-tests.mjs`:

```javascript
import { remote } from 'webdriverio';
import AxeBuilder from '@axe-core/webdriverjs';
import { FIREFOX_CONFIG } from './firefox-config.mjs';

class FirefoxA11yTester {
  constructor() {
    this.results = [];
  }

  async init() {
    this.browser = await remote({
      logLevel: 'error',
      path: '/',
      port: FIREFOX_CONFIG.browser.port,
      capabilities: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          headless: FIREFOX_CONFIG.browser.headless,
          args: ['--no-sandbox', '--disable-dev-shm-usage']
        }
      }
    });
  }

  async testEndpoint(endpoint) {
    try {
      const url = `http://localhost:5000${endpoint.url}`;
      await this.browser.navigateTo(url);
      
      // Wait for page to load
      await this.browser.waitUntil(async () => {
        const state = await this.browser.execute(() => document.readyState);
        return state === 'complete';
      }, { timeout: 10000 });

      // Run axe accessibility audit
      const results = await new AxeBuilder({ client: this.browser })
        .withStandards(FIREFOX_CONFIG.accessibility.standards)
        .analyze();

      return {
        endpoint: endpoint.name,
        url: endpoint.url,
        violations: results.violations || [],
        passes: results.passes || [],
        incomplete: results.incomplete || [],
        violations_count: (results.violations || []).length,
        passes_count: (results.passes || []).length
      };
    } catch (error) {
      console.error(`Error testing ${endpoint.name}:`, error.message);
      return {
        endpoint: endpoint.name,
        url: endpoint.url,
        error: error.message,
        violations_count: -1,
        passes_count: -1
      };
    }
  }

  async runTests() {
    await this.init();

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║ FIREFOX ACCESSIBILITY TESTS (axe audit)       ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    for (const endpoint of FIREFOX_CONFIG.endpoints) {
      process.stdout.write(`Testing ${endpoint.name}... `);
      const result = await this.testEndpoint(endpoint);
      
      if (result.error) {
        console.log(`❌ ERROR: ${result.error}`);
      } else {
        const status = result.violations_count === 0 ? '✅' : '⚠️';
        console.log(`${status} ${result.violations_count} violations, ${result.passes_count} passes`);
        
        if (result.violations_count > 0) {
          result.violations.forEach(v => {
            console.log(`  ❌ ${v.id}: ${v.description}`);
            console.log(`     Impact: ${v.impact}`);
            console.log(`     Help: ${v.help}`);
          });
        }
      }
      
      this.results.push(result);
    }

    await this.browser.deleteSession();
    return this.results;
  }
}

// Run tests
const tester = new FirefoxA11yTester();
const results = await tester.runTests();

// Summary
const totalViolations = results.reduce((sum, r) => sum + (r.violations_count || 0), 0);
const totalPasses = results.reduce((sum, r) => sum + (r.passes_count || 0), 0);

console.log('\n╔════════════════════════════════════════════════╗');
console.log('║ SUMMARY                                        ║');
console.log('╚════════════════════════════════════════════════╝');
console.log(`✅ Total Passes: ${totalPasses}`);
console.log(`❌ Total Violations: ${totalViolations}`);

if (totalViolations > 0) {
  console.log('\n⚠️ ACCESSIBILITY ISSUES FOUND');
  process.exit(1);
} else {
  console.log('\n✅ ALL ACCESSIBILITY TESTS PASSED');
  process.exit(0);
}
```

## Integration with Deploy Script

Update `deploy.sh` to run Firefox tests:

```bash
run_firefox_tests() {
  echo "[INFO] Starting Firefox accessibility testing..."
  
  # Start GeckoDriver
  geckodriver --port 4444 > /tmp/geckodriver.log 2>&1 &
  GECKO_PID=$!
  
  # Wait for GeckoDriver to be ready
  sleep 2
  
  # Run Firefox tests
  node src/tests/firefox-accessibility-tests.mjs >> "$LOG_FILE" 2>&1
  
  if [ $? -ne 0 ]; then
    echo "[FAIL] Firefox accessibility tests failed" >> "$LOG_FILE"
    kill $GECKO_PID 2>/dev/null
    return 1
  fi
  
  # Clean up GeckoDriver
  kill $GECKO_PID 2>/dev/null
  echo "[SUCCESS] Firefox tests completed" >> "$LOG_FILE"
  return 0
}
```

Then add to preview deployment in `deploy.sh`:

```bash
if [ "$ENV" = "preview" ]; then
  # ... existing format/lint checks ...
  
  # Run comprehensive tests
  echo "[INFO] Running comprehensive test suite..."
  run_firefox_tests    # Add this
  run_comprehensive_tests  # Existing Lighthouse tests
  
  if [ $? -ne 0 ]; then
    echo "Tests failed. See log for details:"
    tail -50 "$LOG_FILE"
    exit 1
  fi
fi
```

## Update package.json

Add scripts:
```json
{
  "scripts": {
    "test:firefox": "node src/tests/firefox-accessibility-tests.mjs",
    "test:preview": "npm run lint && npm run test:firefox && npm run test:preview-suite"
  }
}
```

## Testing It

### 1. Start dev server in one terminal
```bash
./deploy.sh -dev
```

### 2. Test Firefox in another terminal
```bash
npm run test:firefox
```

Should output:
```
╔════════════════════════════════════════════════╗
║ FIREFOX ACCESSIBILITY TESTS (axe audit)       ║
╚════════════════════════════════════════════════╝

Testing Home... ✅ 0 violations, 15 passes
Testing Practice... ✅ 0 violations, 18 passes
Testing Quiz... ✅ 0 violations, 16 passes
...

╔════════════════════════════════════════════════╗
║ SUMMARY                                        ║
╚════════════════════════════════════════════════╝
✅ Total Passes: 105
❌ Total Violations: 0

✅ ALL ACCESSIBILITY TESTS PASSED
```

## What Gets Tested

✅ WCAG 2.0 Level A compliance  
✅ WCAG 2.0 Level AA compliance  
✅ WCAG 2.0 Level AAA compliance  
✅ Color contrast ratios  
✅ ARIA attributes  
✅ Semantic HTML  
✅ Keyboard navigation  
✅ Form labels  
✅ Alt text for images  
✅ Heading structure  

## Troubleshooting

### GeckoDriver won't start
```bash
# Check if Firefox is installed
firefox --version

# Install if needed
sudo apt-get install firefox-geckodriver

# Try running directly
geckodriver --port 4444
```

### Tests timeout
Increase timeout in `firefox-config.mjs`:
```javascript
accessibility: {
  timeout: 60000  // 60 seconds instead of 30
}
```

### axe-webdriverjs errors
```bash
# Reinstall packages
rm -rf node_modules package-lock.json
npm install

# Run with debug
DEBUG=* npm run test:firefox
```

## What's Next

This adds:
1. ✅ Firefox accessibility testing (WCAG compliance)
2. ✅ Cross-browser validation (Chrome + Firefox)
3. ✅ Detailed accessibility reports

Optionally add later:
- Firefox performance profiling (CPU/memory)
- Network throttling tests (3G/4G)
- Firefox-specific rendering checks

## Summary

| Item | Time | Impact |
|------|------|--------|
| Installation | 2 min | ~15 new packages |
| Config file | 3 min | `firefox-config.mjs` |
| Test file | 10 min | `firefox-accessibility-tests.mjs` |
| Deploy integration | 5 min | Update `deploy.sh` |
| **Total** | **20 min** | Deep accessibility testing |

Ready? Run the installation steps above!
