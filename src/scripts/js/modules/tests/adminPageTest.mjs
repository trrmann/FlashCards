/* global document, window -- page.evaluate callbacks run in the browser */
/**
 * Admin pages test (headless Chrome): the Profile page's user administration and the
 * Organizations page, both now the IAM's shared screens (phase 3f) shown in FlashCards' pages.
 *
 * Profile: user data is shown as text (a name and email carrying script don't run); FlashCards'
 * own "Storage limit" and "Reset stats" buttons appear in each row (the iam-user-row hook) and
 * work; Disable works; deleting a user removes their FlashCards data at once (the IAM's notice).
 * Organizations: FlashCards' classes are applied; an organization and a member are added.
 * With `remoteIam: true` (npm run test:admin-page:remote) through the IAM service over HTTP.
 * Local scratch database only.
 */

import crypto from 'node:crypto';
import puppeteer from 'puppeteer';
import { IamServer, ApplicationCredentials } from 'iam-service/server';
import { Server } from '../server.mjs';
import { LocalTestCase } from './localTestCase.mjs';
import { ApiSession } from './iamApiTest.mjs';
import { LocalIdentityGateway, RemoteIdentityGateway } from '../identity/index.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';
import { UserDataService } from '../auth/userDataService.mjs';

export class AdminPageTest extends LocalTestCase {
  static PORT = 5091;
  static IAM_PORT = 5089;
  static PASSWORD = 'AdminPage#2026x';
  static ATTACK = '<img src=x onerror="window.__xss = (window.__xss || 0) + 1">';

  constructor({ remoteIam = false, ...options } = {}) {
    super(options);
    this.remoteIam = remoteIam;
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
    return { session, id: response.body.user?.user_id, status: response.status };
  }

  /** A page in its own browser context, signed in as `username`; prompts get `promptAnswer`. */
  async signedInPage(browser, username, promptAnswer = '5') {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('dialog', (dialog) =>
      dialog.type() === 'prompt' ? dialog.accept(promptAnswer) : dialog.accept()
    );
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
    return page;
  }

  static clickInRow(username, label) {
    const row = [...document.querySelectorAll('iam-user-admin tbody tr')].find(
      (r) => r.cells[0].textContent === username
    );
    [...row.querySelectorAll('button')].find((b) => b.textContent === label).click();
  }

  async userIdsWithData() {
    const { rows } = await this.database.query(UserDataService.queries.user_ids_with_data);
    return new Set(rows.map((row) => row.user_id));
  }

  async checkProfile(browser) {
    console.log('Profile page: user administration');
    await this.register('page_admin', 'Page Admin');
    const attacker = await this.register('page_attacker', this.constructor.ATTACK);
    const victim = await this.register('page_victim', 'Victim');
    this.check('users registered', attacker.status === 201 && victim.status === 201);
    await victim.session.post('/api/entries', { question: 'Q?', answer: 'A' });

    const page = await this.signedInPage(browser, 'page_admin');
    await page.goto(`${this.baseUrl}/profile`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('iam-user-admin tbody tr');
    const shown = await page.evaluate((attack) => {
      const rows = [...document.querySelectorAll('iam-user-admin tbody tr')];
      const row = rows.find((r) => r.cells[0].textContent === 'page_attacker');
      return {
        ran: window.__xss || 0,
        images: document.querySelectorAll('iam-user-admin img').length,
        name: row?.cells[2].textContent === attack,
        buttons: row ? [...row.querySelectorAll('button')].map((b) => b.textContent) : [],
        table: document.querySelector('iam-user-admin table')?.className,
      };
    }, this.constructor.ATTACK);
    this.check(
      "an attacker's name is shown as text and its script doesn't run",
      shown.ran === 0 && shown.images === 0 && shown.name,
      JSON.stringify(shown)
    );
    this.check(
      "the row has the IAM's buttons and FlashCards' own",
      ['Disable', 'Make Admin', 'Delete', 'Storage limit', 'Reset stats'].every((b) =>
        shown.buttons.includes(b)
      ),
      shown.buttons.join(',')
    );
    this.check(
      "FlashCards' classes are applied",
      shown.table?.includes('admin-users-table'),
      shown.table
    );

    await page.evaluate(AdminPageTest.clickInRow, 'page_attacker', 'Storage limit');
    await page.waitForFunction(() =>
      document.querySelector('iam-user-admin [role=status]')?.textContent.includes('MB limit')
    );
    this.check(
      "FlashCards' Storage limit button sets the limit (5 MB)",
      (await userSettingsService.getStorageLimit(attacker.id)) === 5 * 1024 * 1024
    );

    await page.evaluate(AdminPageTest.clickInRow, 'page_attacker', 'Disable');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('iam-user-admin tbody tr')].some(
        (r) => r.cells[0].textContent === 'page_attacker' && r.textContent.includes('Enable')
      )
    );
    this.check('Disable works', true);

    this.check('the victim has FlashCards data', (await this.userIdsWithData()).has(victim.id));
    await page.evaluate(AdminPageTest.clickInRow, 'page_victim', 'Delete');
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('iam-user-admin tbody tr')].some(
          (r) => r.cells[0].textContent === 'page_victim'
        )
    );
    let gone = false;
    for (let i = 0; i < 20 && !gone; i += 1) {
      gone = !(await this.userIdsWithData()).has(victim.id);
      if (!gone) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.check('deleting a user removes their FlashCards data at once', gone);
    await page.close();
  }

  async checkOrganizations(browser) {
    console.log('\nOrganizations page');
    const page = await this.signedInPage(browser, 'page_admin');
    await page.goto(`${this.baseUrl}/organizations`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.querySelector('iam-organizations form').hidden);
    const styled = await page.evaluate(() => ({
      layout: document.querySelector('iam-organizations .iam-layout')?.className,
      button: document.querySelector('iam-organizations button[type=submit]')?.className,
    }));
    this.check(
      "FlashCards' classes are applied",
      styled.layout?.includes('org-layout') && styled.button?.includes('btn-primary'),
      JSON.stringify(styled)
    );
    const submit = (index, values) =>
      page.evaluate(
        (i, entries) => {
          const form = document.querySelectorAll('iam-organizations form')[i];
          for (const [name, value] of Object.entries(entries)) form.elements[name].value = value;
          form.requestSubmit();
        },
        index,
        values
      );
    await submit(0, { name: 'Page Club', slug: 'page-club', ownerUsername: '' });
    await page.waitForSelector('iam-organizations .iam-org-item');
    await page.click('iam-organizations .iam-org-item');
    await page.waitForFunction(
      () => !document.querySelectorAll('iam-organizations section')[1].hidden
    );
    await submit(2, { username: 'page_attacker', orgRole: 'member' });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('iam-organizations tbody tr')].some((r) =>
        r.textContent.includes('page_attacker')
      )
    );
    this.check('an organization is created and a member added', true);
    await page.close();
  }

  async startIdentity() {
    this.iamServer = null;
    if (!this.remoteIam) return new LocalIdentityGateway();
    const secret = crypto.randomBytes(32).toString('hex');
    this.iamServer = new IamServer({
      port: this.constructor.IAM_PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: secret,
        }),
      },
    });
    await this.iamServer.start();
    return new RemoteIdentityGateway({
      baseUrl: `http://127.0.0.1:${this.constructor.IAM_PORT}`,
      clientSecret: secret,
    });
  }

  async run() {
    this.assertLocalTarget();
    console.log(
      `Admin pages test (headless Chrome; identity ${this.remoteIam ? 'over HTTP' : 'in-process'})\n`
    );
    await this.resetDatabase();
    const identity = await this.startIdentity();
    const server = new Server({ env: 'development', port: this.constructor.PORT, identity });
    await server.start();
    const browser = await puppeteer.launch({ headless: true });
    try {
      await this.checkProfile(browser);
      await this.checkOrganizations(browser);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
      await server.userEvents.stop();
      await identity.stop();
      if (this.iamServer) await this.iamServer.stop();
    }
    return this.summary();
  }
}

export const adminPageTest = new AdminPageTest();
export default adminPageTest;
