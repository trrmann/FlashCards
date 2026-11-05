/**
 * Admin page test (headless Chrome): the Profile page's user list must show user data as text.
 * A user registers with a full name and email that carry script (<img onerror>); when an admin
 * opens the Profile page the script must not run, and the text must appear literally. Also the
 * row's buttons still work (disable, enable). Local scratch database only.
 */

/* global document, window -- page.evaluate callbacks run in the browser */
import puppeteer from 'puppeteer';
import { Server } from '../server.mjs';
import { LocalTestCase } from './localTestCase.mjs';
import { ApiSession } from './iamApiTest.mjs';

export class AdminPageTest extends LocalTestCase {
  static PORT = 5091;
  static PASSWORD = 'AdminPage#2026x';
  static ATTACK = '<img src=x onerror="window.__xss = (window.__xss || 0) + 1">';

  constructor(options) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${this.constructor.PORT}`;
  }

  async register(username, fullName) {
    const session = new ApiSession(this.baseUrl);
    const response = await session.post('/api/auth/register', {
      username,
      email: `${username}@example.test`,
      password: this.constructor.PASSWORD,
      passwordConfirm: this.constructor.PASSWORD,
      fullName,
    });
    return { session, response };
  }

  async signIn(page, username) {
    await page.goto(`${this.baseUrl}/login`, { waitUntil: 'networkidle0' });
    await page.evaluate(
      async (name, password) => {
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: name, password }),
        });
      },
      username,
      this.constructor.PASSWORD
    );
  }

  async checkUserList(browser) {
    console.log('Profile page: admin user list');
    await this.register('page_admin', 'Page Admin');
    const attacker = await this.register('page_attacker', this.constructor.ATTACK);
    this.check('the attacker registered', attacker.response.status === 201);

    const page = await browser.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await this.signIn(page, 'page_admin');
    await page.goto(`${this.baseUrl}/profile`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.admin-users-table tbody tr');
    const result = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.admin-users-table tbody tr')];
      const row = rows.find((r) => r.cells[0].textContent === 'page_attacker');
      return {
        ran: window.__xss || 0,
        images: document.querySelectorAll('.admin-users-table img').length,
        nameCell: row?.cells[2].textContent,
        buttons: row ? [...row.querySelectorAll('button')].map((b) => b.textContent) : [],
      };
    });
    this.check(
      "the attacker's script did not run, and no element was created from their data",
      result.ran === 0 && result.images === 0,
      JSON.stringify(result)
    );
    this.check('their full name is shown as text', result.nameCell === this.constructor.ATTACK);
    this.check(
      'the row has its buttons',
      ['Disable', 'Make Admin', 'Make Public', 'Delete'].every((b) => result.buttons.includes(b)),
      result.buttons.join(',')
    );

    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.admin-users-table tbody tr')].find(
        (r) => r.cells[0].textContent === 'page_attacker'
      );
      [...row.querySelectorAll('button')].find((b) => b.textContent === 'Disable').click();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.admin-users-table tbody tr')].some(
        (r) => r.cells[0].textContent === 'page_attacker' && r.textContent.includes('Enable')
      )
    );
    this.check('a button works: Disable turns the row to Enable', true);
    await page.close();
  }

  async run() {
    this.assertLocalTarget();
    console.log('Admin page test (headless Chrome, local scratch database)\n');
    await this.resetDatabase();
    const server = new Server({ env: 'development', port: this.constructor.PORT });
    await server.start();
    const browser = await puppeteer.launch({ headless: true });
    try {
      await this.checkUserList(browser);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
      await server.userEvents.stop();
    }
    return this.summary();
  }
}

export const adminPageTest = new AdminPageTest();
export default adminPageTest;
