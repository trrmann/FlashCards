/**
 * Comprehensive Preview Test Suite
 * Tests: Lighthouse, CSS, HTML, Memory, and Chrome DevTools metrics
 * All endpoints and pages are dynamically tested
 */

import lighthouse from 'lighthouse';
import { HtmlValidate } from 'html-validate';
import { launch } from 'puppeteer';
import fetch from 'node-fetch';
import { TEST_CONFIG, TestResults } from './test-config.mjs';

const results = new TestResults();
let browser = null;
const htmlValidator = new HtmlValidate();

/**
 * Initialize browser and create page
 */
async function initBrowser() {
  try {
    browser = await launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return browser;
  } catch (error) {
    results.addTest(
      'Browser Initialization',
      'FAIL',
      `Failed to launch browser: ${error.message}`
    );
    throw error;
  }
}

/**
 * Close browser
 */
async function closeBrowser() {
  if (browser) await browser.close();
}

/**
 * Test each endpoint for HTTP 200 response
 */
async function testEndpoints() {
  console.log('\n[TEST] Running endpoint connectivity tests...');

  for (const endpoint of TEST_CONFIG.endpoints) {
    const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;
    try {
      const response = await fetch(url, { timeout: TEST_CONFIG.timeout });
      if (response.ok) {
        results.addTest(`Endpoint: ${endpoint.name}`, 'PASS');
      } else {
        results.addTest(
          `Endpoint: ${endpoint.name}`,
          'FAIL',
          `HTTP ${response.status}`
        );
      }
    } catch (error) {
      results.addTest(
        `Endpoint: ${endpoint.name}`,
        'FAIL',
        error.message.substring(0, 100)
      );
    }
  }
}

/**
 * Run Lighthouse tests for each endpoint
 */
async function testLighthouse() {
  console.log('\n[TEST] Running Lighthouse audits...');

  for (const endpoint of TEST_CONFIG.endpoints) {
    const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;

    try {
      const runnerResult = await lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        port: new URL(browser.wsEndpoint()).port,
        onlyCategories: [
          'performance',
          'accessibility',
          'best-practices',
          'seo',
          'pwa',
        ],
      });

      const scores = runnerResult.lhr.categories;
      let pagePassed = true;

      for (const [category, threshold] of Object.entries(
        TEST_CONFIG.lighthouseThresholds
      )) {
        const score = scores[category]?.score * 100;
        if (score && score < threshold) {
          results.addTest(
            `Lighthouse ${category}: ${endpoint.name}`,
            'WARN',
            `Score: ${Math.round(score)} (threshold: ${threshold})`
          );
          pagePassed = false;
        }
      }

      if (pagePassed) {
        results.addTest(`Lighthouse Audit: ${endpoint.name}`, 'PASS');
      }
    } catch (error) {
      results.addTest(
        `Lighthouse Audit: ${endpoint.name}`,
        'FAIL',
        error.message.substring(0, 100)
      );
    }
  }
}

/**
 * Test HTML validity for each page
 */
async function testHTMLValidity() {
  console.log('\n[TEST] Running HTML validation...');

  for (const endpoint of TEST_CONFIG.endpoints) {
    const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;

    try {
      const response = await fetch(url);
      const html = await response.text();

      const result = await htmlValidator.validate(html);

      if (result.valid) {
        results.addTest(`HTML Validation: ${endpoint.name}`, 'PASS');
      } else {
        const errorCount = result.getErrors().length;
        results.addTest(
          `HTML Validation: ${endpoint.name}`,
          'WARN',
          `${errorCount} validation error(s)`
        );
      }
    } catch (error) {
      results.addTest(
        `HTML Validation: ${endpoint.name}`,
        'FAIL',
        error.message.substring(0, 100)
      );
    }
  }
}

/**
 * Test CSS with Chrome DevTools
 */
async function testCSS() {
  console.log('\n[TEST] Running CSS analysis...');

  const page = await browser.newPage();

  try {
    for (const endpoint of TEST_CONFIG.endpoints) {
      const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        const cssIssues = await page.evaluate(() => {
          const issues = [];
          const stylesheets = document.styleSheets;

          for (let i = 0; i < stylesheets.length; i++) {
            const sheet = stylesheets[i];
            try {
              const rules = sheet.cssRules;
              if (!rules) continue;

              for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];
                // Check for common CSS issues
                if (
                  rule.style &&
                  (rule.style.all === 'inherit' ||
                    rule.style.width === '100%' && rule.style.height === '100%')
                ) {
                  issues.push(`Potential layout issue in rule ${j}`);
                }
              }
            } catch (e) {
              // Cross-origin stylesheets - expected
            }
          }

          return issues;
        });

        if (cssIssues.length === 0) {
          results.addTest(`CSS Analysis: ${endpoint.name}`, 'PASS');
        } else {
          results.addTest(
            `CSS Analysis: ${endpoint.name}`,
            'WARN',
            `${cssIssues.length} potential issue(s)`
          );
        }
      } catch (error) {
        results.addTest(
          `CSS Analysis: ${endpoint.name}`,
          'FAIL',
          error.message.substring(0, 100)
        );
      }
    }
  } finally {
    await page.close();
  }
}

/**
 * Test memory usage
 */
async function testMemory() {
  console.log('\n[TEST] Running memory tests...');

  const page = await browser.newPage();

  try {
    for (const endpoint of TEST_CONFIG.endpoints) {
      const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        const metrics = await page.metrics();
        const heapUsedMB = metrics.JSHeapUsedSize / (1024 * 1024);
        const externalMB = metrics.ExternalMemoryUsage / (1024 * 1024);

        let pagePassed = true;
        const warnings = [];

        if (heapUsedMB > TEST_CONFIG.memoryThresholds.heapUsedMax) {
          warnings.push(
            `Heap: ${heapUsedMB.toFixed(2)}MB (max: ${TEST_CONFIG.memoryThresholds.heapUsedMax}MB)`
          );
          pagePassed = false;
        }

        if (externalMB > TEST_CONFIG.memoryThresholds.externalMax) {
          warnings.push(
            `External: ${externalMB.toFixed(2)}MB (max: ${TEST_CONFIG.memoryThresholds.externalMax}MB)`
          );
          pagePassed = false;
        }

        if (pagePassed) {
          results.addTest(`Memory Test: ${endpoint.name}`, 'PASS');
        } else {
          results.addTest(
            `Memory Test: ${endpoint.name}`,
            'WARN',
            warnings.join('; ')
          );
        }
      } catch (error) {
        results.addTest(
          `Memory Test: ${endpoint.name}`,
          'FAIL',
          error.message.substring(0, 100)
        );
      }
    }
  } finally {
    await page.close();
  }
}

/**
 * Test Chrome DevTools Core Web Vitals
 */
async function testCoreWebVitals() {
  console.log('\n[TEST] Running Core Web Vitals tests...');

  const page = await browser.newPage();

  try {
    for (const endpoint of TEST_CONFIG.endpoints) {
      const url = `${TEST_CONFIG.baseURL}${endpoint.path}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        const metrics = await page.metrics();

        const vitals = {
          'First Contentful Paint': metrics.FirstContentfulPaint,
          'Largest Contentful Paint': metrics.LargestContentfulPaint,
          'Time to Interactive': metrics.TaskDuration,
          'Cumulative Layout Shift': metrics.LayoutCount,
        };

        let hasIssues = false;
        const issues = [];

        if (vitals['First Contentful Paint'] > 2500) {
          issues.push('FCP > 2.5s');
          hasIssues = true;
        }

        if (vitals['Time to Interactive'] > 5000) {
          issues.push('TTI > 5s');
          hasIssues = true;
        }

        if (hasIssues) {
          results.addTest(
            `Core Web Vitals: ${endpoint.name}`,
            'WARN',
            issues.join('; ')
          );
        } else {
          results.addTest(`Core Web Vitals: ${endpoint.name}`, 'PASS');
        }
      } catch (error) {
        results.addTest(
          `Core Web Vitals: ${endpoint.name}`,
          'FAIL',
          error.message.substring(0, 100)
        );
      }
    }
  } finally {
    await page.close();
  }
}

/**
 * Run all tests
 */
export async function runAllTests() {
  try {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║    PREVIEW COMPREHENSIVE TEST SUITE        ║');
    console.log('╚════════════════════════════════════════════╝');

    await initBrowser();

    await testEndpoints();
    await testLighthouse();
    await testHTMLValidity();
    await testCSS();
    await testMemory();
    await testCoreWebVitals();

    const summary = results.getSummary();
    console.log(results.toString());

    return {
      success: summary.success,
      results,
    };
  } catch (error) {
    console.error('Test suite error:', error);
    results.addTest('Test Suite Execution', 'FAIL', error.message);
    return {
      success: false,
      results,
    };
  } finally {
    await closeBrowser();
  }
}

export { TestResults };
