/**
 * FlashCards on its own database login (phase 3d step 5), end to end.
 *
 * The real server (server.js) runs as a separate process, as on Render, with identity through an
 * IAM service and a database login made by iam-service's provisioner (like flashcards_svc: owner
 * of the flashcards schema's tables, no rights on iam). It must start (bootstrap its schema), and
 * sign-up, cards, backup download and restore, user deletion and the status page must all work,
 * while the login itself cannot read the identity tables. Local scratch cluster only.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgresDatabase } from 'platform-db';
import { IamServer, ApplicationCredentials } from 'iam-service/server';
import { DatabaseProvisioner } from 'iam-service/provision';
import { LocalTestCase } from './localTestCase.mjs';
import { ApiSession } from './iamApiTest.mjs';
import { FlashCardsDatabase } from '../db/flashCardsDatabase.mjs';

export class OwnLoginTest extends LocalTestCase {
  static ROLE = 'fctest_flashcards_svc';
  static PORT = 5093;
  static IAM_PORT = 5092;
  static PASSWORD = 'OwnLogin#2026x';
  static ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

  constructor(options) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${this.constructor.PORT}`;
    this.output = [];
  }

  get q() {
    return LocalTestCase.testQueries;
  }

  /** The app login, as iam-provision makes it on Render. @returns {Promise<string>} password */
  async provisionLogin() {
    await this.identityDatabase.query(this.q.own_login_set_registry, [this.constructor.ROLE]);
    const provisioner = new DatabaseProvisioner({
      database: this.identityDatabase,
      serviceLogins: [],
    });
    const [login] = await provisioner.provision({ only: ['flashcards'] });
    this.check(
      'the app login was created and given the flashcards tables',
      login.role === this.constructor.ROLE &&
        login.action === 'created' &&
        login.objectsHandedOver > 10
    );
    return login.password;
  }

  /** server.js as a separate process, on the app login, with identity over HTTP. */
  async startFlashCards(password, secret) {
    this.child = spawn(process.execPath, ['server.js'], {
      cwd: this.constructor.ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT_DEV: String(this.constructor.PORT),
        DB_PG_USER: this.constructor.ROLE,
        DB_PG_PASSWORD: password,
        IAM_URL: `http://127.0.0.1:${this.constructor.IAM_PORT}`,
        IAM_CLIENT_SECRET: secret,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [this.child.stdout, this.child.stderr]) {
      stream.on('data', (chunk) => this.output.push(String(chunk)));
    }
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${this.baseUrl}/api/health`)).status === 200) return true;
      } catch {
        // not listening yet
      }
      await PostgresDatabase.sleep(500);
    }
    return false;
  }

  async stopFlashCards() {
    if (!this.child || this.child.exitCode !== null) return;
    const exited = new Promise((resolve) => this.child.once('exit', resolve));
    this.child.kill('SIGTERM');
    await Promise.race([exited, PostgresDatabase.sleep(5000)]);
    if (this.child.exitCode === null) this.child.kill('SIGKILL');
  }

  async register(name) {
    const session = new ApiSession(this.baseUrl);
    const response = await session.post('/api/auth/register', {
      username: name,
      email: `${name}@example.test`,
      password: this.constructor.PASSWORD,
      passwordConfirm: this.constructor.PASSWORD,
      fullName: name,
    });
    return { session, response };
  }

  async checkApp(password) {
    console.log('\nThe app on its own login');
    const log = this.output.join('');
    this.check(
      'it started with identity over HTTP, as the app login',
      log.includes('Identity: remote') && log.includes(`as ${this.constructor.ROLE}`)
    );
    this.check('it did not bootstrap the IAM schema', !log.includes('IAM Database Initialization'));

    const root = await this.register('own_root');
    this.check('sign-up works (the first account is admin)', root.response.status === 201);
    const card = await root.session.post('/api/entries', {
      question: 'Q?',
      answer: 'A',
      lesson: 'L1',
    });
    const list = await root.session.get('/api/entries');
    this.check(
      'a card is created and listed',
      card.status === 201 && list.body.entries?.length === 1
    );

    const backup = await root.session.get('/api/admin/backup/download');
    this.check(
      'a backup downloads, with the users from the IAM service',
      backup.status === 200 &&
        backup.body.version === '4.0' &&
        backup.body.identity?.data?.users?.length === 1
    );
    const restore = await root.session.post('/api/admin/backup/import', { backup: backup.body });
    this.check('and restores', restore.status === 200, JSON.stringify(restore.body).slice(0, 200));

    const bob = await this.register('own_bob');
    const bobId = bob.response.body.user?.user_id;
    await bob.session.post('/api/entries', { question: 'Bob?', answer: 'B' });
    const deleted = await root.session.delete(`/api/admin/users/${bobId}`);
    const bobCards = (await this.database.query(this.q.own_login_user_card_count, [bobId])).rows[0]
      .count;
    this.check(
      "deleting a user removes their cards (through the IAM's notice)",
      deleted.status === 200 && bobCards === 0,
      `${deleted.status}, ${bobCards} card(s) left`
    );
    const status = await root.session.get('/api/system/database-status');
    this.check(
      'the status page counts users through the IAM',
      status.status === 200 && status.body.tables?.users?.rowCount === 1,
      JSON.stringify(status.body.tables?.users)
    );

    const appLogin = new FlashCardsDatabase({
      ...this.database.config,
      user: this.constructor.ROLE,
      password,
    });
    this.databases.push(appLogin);
    let denied = null;
    try {
      await appLogin.query(this.q.own_login_read_iam_users);
    } catch (error) {
      denied = error.code;
    }
    this.check('the app login cannot read the identity tables (42501)', denied === '42501', denied);
  }

  async run() {
    this.assertLocalTarget();
    console.log('FlashCards on its own database login (local scratch cluster)\n');
    await this.identityDatabase.query(this.q.own_login_drop_test_role);
    await this.resetDatabase();
    const secret = crypto.randomBytes(32).toString('hex');
    const iamServer = new IamServer({
      port: this.constructor.IAM_PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: secret,
        }),
      },
    });
    await iamServer.start();
    try {
      const password = await this.provisionLogin();
      const started = await this.startFlashCards(password, secret);
      this.check('the server starts on the app login', started);
      if (!started) console.log(`--- server output ---\n${this.output.join('')}\n---`);
      if (started) await this.checkApp(password);
    } finally {
      await this.stopFlashCards();
      await iamServer.stop();
      for (const db of this.databases.slice(2)) await db.close();
      this.databases.splice(2);
      await this.identityDatabase.query(this.q.own_login_drop_test_role);
      await this.resetDatabase();
    }
    return this.summary();
  }
}

export const ownLoginTest = new OwnLoginTest();
export default ownLoginTest;
