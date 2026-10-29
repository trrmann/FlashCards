/**
 * Test Configuration & Utilities
 * Defines all endpoints, pages, and test configurations
 */

export const TEST_CONFIG = {
  baseURL: 'http://localhost:5000',
  timeout: 30000,
  retries: 2,

  // All application endpoints to test
  endpoints: [
    { path: '/', name: 'Home', type: 'page' },
    { path: '/practice', name: 'Practice', type: 'page' },
    { path: '/quiz', name: 'Quiz', type: 'page' },
    { path: '/entries', name: 'Entries', type: 'page' },
    { path: '/login', name: 'Login', type: 'page' },
    { path: '/profile', name: 'Profile', type: 'page' },
    { path: '/logout', name: 'Logout', type: 'page' },
  ],

  // Lighthouse thresholds
  lighthouseThresholds: {
    performance: 50,
    accessibility: 80,
    'best-practices': 80,
    seo: 80,
    pwa: 50,
  },

  // CSS validation options
  cssOptions: {
    profile: 'css3svg',
    level: 'error',
  },

  // HTML validation options
  htmlOptions: {
    extends: ['html/recommended'],
    rules: {
      'no-unknown-elements': 'error',
      'void-content': 'error',
      'valid-attribute-expression': 'error',
    },
  },

  // Memory thresholds (in MB)
  memoryThresholds: {
    heapUsedMax: 500,
    externalMax: 100,
  },

  // Chrome DevTools metrics to check
  metrics: [
    'Cumulative Layout Shift',
    'Largest Contentful Paint',
    'First Input Delay',
    'Time to Interactive',
    'Speed Index',
  ],
};

/**
 * Test results tracking
 */
export class TestResults {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
    this.startTime = Date.now();
  }

  addTest(name, status, details = '') {
    this.tests.push({
      name,
      status,
      details,
      timestamp: new Date().toISOString(),
    });

    if (status === 'PASS') this.passed++;
    else if (status === 'FAIL') this.failed++;
    else if (status === 'WARN') this.warnings++;
  }

  getSummary() {
    const duration = Date.now() - this.startTime;
    return {
      total: this.tests.length,
      passed: this.passed,
      failed: this.failed,
      warnings: this.warnings,
      duration: `${(duration / 1000).toFixed(2)}s`,
      success: this.failed === 0,
    };
  }

  toJSON() {
    return {
      summary: this.getSummary(),
      tests: this.tests,
    };
  }

  toString() {
    const summary = this.getSummary();
    let output = '\n╔════════════════════════════════════════════════╗\n';
    output += '║         TEST RESULTS SUMMARY                  ║\n';
    output += '╚════════════════════════════════════════════════╝\n\n';
    output += `Total Tests: ${summary.total}\n`;
    output += `✅ Passed: ${summary.passed}\n`;
    output += `❌ Failed: ${summary.failed}\n`;
    output += `⚠️ Warnings: ${summary.warnings}\n`;
    output += `⏱️  Duration: ${summary.duration}\n\n`;

    if (summary.failed > 0) {
      output += '❌ FAILED TESTS:\n';
      this.tests
        .filter((t) => t.status === 'FAIL')
        .forEach((t) => {
          output += `  • ${t.name}\n`;
          if (t.details) output += `    ${t.details}\n`;
        });
    }

    if (summary.warnings > 0) {
      output += '\n⚠️ WARNINGS:\n';
      this.tests
        .filter((t) => t.status === 'WARN')
        .forEach((t) => {
          output += `  • ${t.name}\n`;
          if (t.details) output += `    ${t.details}\n`;
        });
    }

    output += '\n' + (summary.success ? '✅ ALL TESTS PASSED' : '❌ TESTS FAILED');
    output += '\n';

    return output;
  }
}

export default TEST_CONFIG;
