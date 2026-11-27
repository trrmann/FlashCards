/**
 * Start-up test: FlashCards started before its database must listen at once, answer
 * 503 "starting" (with Retry-After) on pages and the API, keep waiting instead of
 * giving up, and serve normally once the database comes up. The database "comes up"
 * when a TCP relay to the local scratch database starts. Also: development and preview
 * servers refuse a writable remote database, and a read-only server starts without
 * bootstrapping and writes nothing. Local scratch database only; identity is the IAM service over HTTP
 * (LocalTestCase.startIam).
 */

import fs from 'node:fs';
import path from 'node:path';
import { TcpRelay, PostgresDatabase } from 'platform-db';
import { LocalTestCase } from './localTestCase.mjs';
import { FlashCardsDatabase } from '../db/flashCardsDatabase.mjs';
import { Server } from '../server.mjs';
import { RemoteIdentityGateway } from '../identity/index.mjs';
import { BackupService, backupService } from '../auth/backupService.mjs';
import { entriesService } from '../auth/entriesService.mjs';

export class StartupTest extends LocalTestCase {
  /** Long enough for at least one full database wait round to give up and restart. */
  static DATABASE_LATE_MS = 2500;
  static IAM_PORT = 5097;

  /**
   * Adapters that reach the database through the relay on `port` (closed by Server.stop()).
   */
  relayedAdapters(port) {
    const overrides = { port, connectionTimeoutMillis: 500 };
    return {
      database: new FlashCardsDatabase({ ...this.database.config, ...overrides }),
    };
  }

  static sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  static async stateOf(promise) {
    const marker = Symbol('pending');
    try {
      return (await Promise.race([promise, Promise.resolve(marker)])) === marker
        ? 'pending'
        : 'resolved';
    } catch {
      return 'rejected';
    }
  }

  /** GET `url`, retrying while nothing listens yet; resolves with the response or null. */
  static async getWhenListening(url) {
    for (let i = 0; i < 30; i += 1) {
      const response = await fetch(url).catch(() => null);
      if (response) {
        return response;
      }
      await this.sleep(100);
    }
    return null;
  }

  async checkLateDatabase() {
    console.log('Database comes up after FlashCards');
    const port = await TcpRelay.freePort();
    const dbPort = await TcpRelay.freePort();
    const base = `http://127.0.0.1:${port}`;
    const relay = new TcpRelay({
      targetHost: this.database.config.host,
      targetPort: this.database.config.port,
    });
    const server = new Server({
      env: 'development',
      port,
      identity: this.gateway(),
      ...this.relayedAdapters(dbPort),
      connectOptions: { maxWaitMs: 1500, baseDelayMs: 100, maxDelayMs: 300 },
      startupRetryMs: 200,
    });
    try {
      const starting = server.start();
      const health = await this.constructor.getWhenListening(`${base}/api/health`);
      const body = await health?.json();
      this.check(
        'listens at once; /api/health answers 503 "starting"',
        health?.status === 503 && body?.status === 'starting'
      );
      this.check('… with Retry-After', health?.headers.get('retry-after') === '5');
      const page = await fetch(`${base}/login`);
      this.check('pages answer 503 while starting', page.status === 503);

      await this.constructor.sleep(this.constructor.DATABASE_LATE_MS);
      this.check(
        'still waiting after a database wait round gave up',
        (await this.constructor.stateOf(starting)) === 'pending'
      );
      await relay.start(dbPort);
      await starting;
      this.check('ready once the database answers', server.ready);
      this.check('/api/health answers 200', (await fetch(`${base}/api/health`)).status === 200);
      this.check('/login page answers 200', (await fetch(`${base}/login`)).status === 200);
    } finally {
      await server.stop();
      await relay.stop();
    }
  }

  checkDatabaseTargetGuard() {
    console.log('\nDatabase target guard (platform-db DatabaseTargetGuard; cases tested there)');
    let refused = null;
    try {
      new Server({
        env: 'development',
        port: 1,
        identity: this.gateway(),
        database: new FlashCardsDatabase({
          ...this.database.config,
          host: 'dpg-example.virginia-postgres.render.com',
        }),
      });
    } catch (error) {
      refused = error;
    }
    this.check(
      'a development server on a writable remote database is refused at construction',
      /Refusing to start/.test(refused?.message || '')
    );
  }

  async checkReadOnlyServer() {
    console.log('\nRead-only server');
    const port = await TcpRelay.freePort();
    const base = `http://127.0.0.1:${port}`;
    const database = new FlashCardsDatabase({ ...this.database.config, readOnly: true });
    await this.registerUser('ro_reader');
    const q = LocalTestCase.testQueries;
    const sessionsBefore = (await this.database.query(q.count_sessions)).rows[0].count;
    const server = new Server({ env: 'preview', port, database, identity: this.gateway() });
    try {
      await server.start();
      this.check('starts on a read-only database (bootstrap skipped)', server.ready);
      this.check('/api/health answers 200', (await fetch(`${base}/api/health`)).status === 200);
      this.check('/login page answers 200', (await fetch(`${base}/login`)).status === 200);
      // Signing in saves a FlashCards session, which a read-only database refuses.
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ro_reader', password: this.constructor.PASSWORD }),
      });
      this.check('a write request fails', login.status >= 400, String(login.status));
      const sessionsAfter = (await this.database.query(q.count_sessions)).rows[0].count;
      this.check('… and nothing was written', sessionsAfter === sessionsBefore);
    } finally {
      await server.stop();
    }
  }

  /**
   * FlashCards' scheduling classes (platform-db QueryScheduler) reach its real queries.
   */
  checkSchedulingClasses() {
    console.log('\nScheduling classes');
    const sqlFor = (name) =>
      [...PostgresDatabase.queryNames].find(([, queryName]) => queryName === name)?.[0];
    this.check(
      'insert_import_export_log is background',
      this.database.classify(sqlFor('insert_import_export_log')) === 'background'
    );
    this.check(
      'select_user_flashcards is interactive',
      this.database.classify(sqlFor('select_user_flashcards')) === 'interactive'
    );
    this.check('backup work is background', BackupService.WORK.priority === 'background');
  }

  checkIdentityEnvironmentRouting() {
    console.log('\nIdentity environment routing');
    const productionUrl = 'https://iam-production.example';
    const development = Server.createIdentity('development', {
      IAM_URL: productionUrl,
      IAM_DEV_URL: 'http://127.0.0.1:2030',
      IAM_CLIENT_SECRET: 'test-secret',
    });
    const preview = Server.createIdentity('preview', {
      IAM_URL: productionUrl,
      IAM_PREVIEW_URL: 'http://127.0.0.1:5030',
      IAM_CLIENT_SECRET: 'test-secret',
    });
    const fallback = Server.createIdentity('preview', {
      IAM_URL: productionUrl,
      IAM_CLIENT_SECRET: 'test-secret',
    });
    let testError = null;
    try {
      Server.createIdentity('test', { IAM_URL: productionUrl, IAM_CLIENT_SECRET: 'test-secret' });
    } catch (error) {
      testError = error;
    }

    this.check(
      'dev and preview select their explicit IAM endpoints over IAM_URL',
      development instanceof RemoteIdentityGateway &&
        development.baseUrl === 'http://127.0.0.1:2030' &&
        preview instanceof RemoteIdentityGateway &&
        preview.baseUrl === 'http://127.0.0.1:5030'
    );
    this.check(
      'missing local/test IAM endpoints never inherit production IAM_URL',
      fallback.baseUrl === Server.LOCAL_IAM_URLS.preview &&
        /IAM_TEST_URL is not set/.test(testError?.message || ''),
      `${fallback.baseUrl}; ${testError?.message}`
    );
  }

  checkIdentityWiring() {
    console.log('\nIdentity gateway wiring');
    const oldEntries = entriesService.identityService;
    const oldBackup = backupService.identity;
    // A constructed gateway reads its secret from the environment (IAM_DEV_CLIENT_SECRET in development).
    const oldSecret = process.env.IAM_DEV_CLIENT_SECRET;
    process.env.IAM_DEV_CLIENT_SECRET ??= 'test-secret';
    try {
      for (const [label, identity] of [
        ['constructed', undefined],
        ['injected', this.gateway()],
      ]) {
        const server = new Server({ env: 'development', database: this.database, identity });
        this.check(
          `${label} gateway reaches routes, backups, entries and event consumer`,
          Boolean(server.identity) &&
            (!identity || server.identity === identity) &&
            server.app.locals.identity === server.identity &&
            backupService.identity === server.identity &&
            entriesService.identityService === server.identity &&
            server.userEvents.identity === server.identity
        );
      }
    } finally {
      entriesService.identityService = oldEntries;
      backupService.identity = oldBackup;
      if (oldSecret === undefined) {
        delete process.env.IAM_DEV_CLIENT_SECRET;
      }
    }
  }

  async checkSchemaGrantWarning() {
    const messages = [];
    const warn = console.warn;
    const server = Object.create(Server.prototype);
    server.database = {
      config: { readOnly: true },
      waitForConnection: async () => {},
      query: async () => {
        throw new Error('synthetic grant failure');
      },
    };
    let checked = false;
    server.verifySchemaPresent = async () => {
      checked = true;
    };
    try {
      console.warn = (...parts) => messages.push(parts.join(' '));
      await server.initializeDatabase();
    } finally {
      console.warn = warn;
    }
    this.check(
      'schema grant failure is reported while read-only schema verification continues',
      checked && messages.some((message) => message.includes('synthetic grant failure'))
    );
  }

  /**
   * The shared packages installed here are the versions their dependents ask for. npm keeps a
   * nested git dependency's old version in package-lock.json when a dependency's tag changes
   * (2026-11-05: iam-service asked for request-queue v0.1.6, the lock still installed v0.1.4, and
   * Render installs from the lock).
   */
  checkSharedPackageVersions() {
    console.log('\nShared package versions');
    const root = path.resolve(Server.projectRoot, 'node_modules');
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
    const wanted = [];
    for (const dependent of ['.', 'iam-service', 'request-queue']) {
      const manifest =
        dependent === '.'
          ? JSON.parse(fs.readFileSync(path.join(Server.projectRoot, 'package.json'), 'utf8'))
          : read(dependent);
      for (const [name, spec] of Object.entries(manifest.dependencies || {})) {
        const tag = /#v(\d+\.\d+\.\d+)$/.exec(spec);
        if (tag) {
          wanted.push([dependent === '.' ? 'FlashCards' : dependent, name, tag[1]]);
        }
      }
    }
    const mismatches = wanted
      .filter(([, name, version]) => read(name).version !== version)
      .map(
        ([by, name, version]) => `${by} wants ${name} ${version}, installed ${read(name).version}`
      );
    this.check(
      'every shared package is installed at the version its dependents ask for',
      wanted.length >= 4 && mismatches.length === 0,
      mismatches.join('; ')
    );
  }

  async run() {
    this.assertLocalTarget();
    console.log('Start-up test (local scratch database)\n');
    await this.resetDatabase();
    await this.startIam();
    try {
      await this.checkLateDatabase();
      this.checkDatabaseTargetGuard();
      await this.checkReadOnlyServer();
      this.checkIdentityEnvironmentRouting();
      this.checkIdentityWiring();
      await this.checkSchemaGrantWarning();
      this.checkSchedulingClasses();
      this.checkSharedPackageVersions();
    } finally {
      await this.stopIam();
    }
    return this.summary();
  }
}

export const startupTest = new StartupTest();
export default startupTest;
