/**
 * Start-up test: FlashCards started before its database must listen at once, answer
 * 503 "starting" (with Retry-After) on pages and the API, keep waiting instead of
 * giving up, and serve normally once the database comes up. The database "comes up"
 * when a TCP relay to the local scratch database starts. Local scratch database only.
 */

import { TcpRelay } from 'platform-db';
import { IdentityManagementDatabase } from 'iam-service/db';
import { LocalTestCase } from './localTestCase.mjs';
import { FlashCardsDatabase } from '../db/flashCardsDatabase.mjs';
import { Server } from '../server.mjs';

export class StartupTest extends LocalTestCase {
  /** Long enough for at least one full database wait round to give up and restart. */
  static DATABASE_LATE_MS = 2500;

  /**
   * Adapters that reach the database through the relay on `port` (closed by Server.stop()).
   */
  relayedAdapters(port) {
    const overrides = { port, connectionTimeoutMillis: 500 };
    return {
      database: new FlashCardsDatabase({ ...this.database.config, ...overrides }),
      identityDatabase: new IdentityManagementDatabase({
        ...this.identityDatabase.config,
        ...overrides,
      }),
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
      if (response) return response;
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

  async run() {
    this.assertLocalTarget();
    console.log('Start-up test (local scratch database)\n');
    await this.resetDatabase();
    await this.checkLateDatabase();
    return this.summary();
  }
}

export const startupTest = new StartupTest();
export default startupTest;
