/**
 * IAM service test (IAM phase 3a, CODING_STANDARDS 0.6).
 * Starts the real IamServer in-process on the local scratch database with a
 * test-only application secret and short token lifetimes, then checks over HTTP:
 * application credentials, login rules, /v1/me, token expiry, refresh rotation,
 * refresh-reuse detection (family revocation), logout, and hashed token storage.
 */

import crypto from 'node:crypto';
import { LocalTestCase } from './localTestCase.mjs';
import { IamServer } from '../iam/iamServer.mjs';
import { TokenService } from '../iam/tokenService.mjs';
import { ApplicationCredentials } from '../iam/applicationCredentials.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';

export class IamServiceTest extends LocalTestCase {
  static PORT = 5097;
  static PASSWORD = 'IamService#2026';
  static ACCESS_TTL_MS = 2000;
  static queries = TokenService.queries;

  constructor(options) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${this.constructor.PORT}/v1`;
    this.secret = crypto.randomBytes(32).toString('hex');
    this.client = { 'X-IAM-Client-Id': 'flashcards', 'X-IAM-Client-Secret': this.secret };
  }

  async call(method, apiPath, { headers = {}, json, token } = {}) {
    const allHeaders = { ...headers };
    if (token) allHeaders.Authorization = `Bearer ${token}`;
    if (json !== undefined) allHeaders['Content-Type'] = 'application/json';
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers: allHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  expect(label, response, status) {
    this.check(
      `${label} → ${status}`,
      response.status === status,
      `got ${response.status} ${response.body?.message || ''}`
    );
    return response.body;
  }

  login(username, password = this.constructor.PASSWORD, headers = this.client) {
    return this.call('POST', '/auth/login', { headers, json: { username, password } });
  }

  async seedUsers() {
    const password = this.constructor.PASSWORD;
    const root = await userAuthService.createUser('svc_root', 'svc_root@example.test', password);
    await userAuthService.makeFirstAdmin(root.user_id);
    const alice = await userAuthService.createUser('svc_alice', 'svc_alice@example.test', password);
    const carl = await userAuthService.createUser('svc_carl', 'svc_carl@example.test', password);
    await userAuthService.setAppAccess(carl.user_id, 'disabled');
    const dora = await userAuthService.createUser('svc_dora', 'svc_dora@example.test', password);
    await userAuthService.disableUser(dora.user_id);
    return { root, alice, carl, dora };
  }

  static sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async checkCredentialsAndLogin(users) {
    console.log('\nApplication credentials and login');
    this.expect('health', await this.call('GET', '/health'), 200);
    this.expect(
      'login without application credentials',
      await this.login('svc_alice', undefined, {}),
      401
    );
    this.expect(
      'login with a wrong application secret',
      await this.login('svc_alice', undefined, {
        ...this.client,
        'X-IAM-Client-Secret': 'x'.repeat(64),
      }),
      401
    );
    this.expect(
      'login as an unconfigured application',
      await this.login('svc_alice', undefined, { ...this.client, 'X-IAM-Client-Id': 'wurm-tools' }),
      401
    );
    this.expect('wrong password', await this.login('svc_alice', 'Wrong#Password1'), 401);
    this.expect('unknown user', await this.login('nobody'), 401);
    this.expect('disabled account', await this.login('svc_dora'), 401);
    this.expect('account without FlashCards access', await this.login('svc_carl'), 403);
    const root = this.expect('platform admin login', await this.login('svc_root'), 200);
    this.check('platform admin gets tokens', Boolean(root.tokens?.access_token));
    const alice = this.expect('alice logs in', await this.login('svc_alice'), 200);
    this.check(
      'login returns a bearer pair',
      alice.tokens?.token_type === 'Bearer' &&
        Boolean(alice.tokens.refresh_token) &&
        alice.tokens.expires_in === Math.floor(this.constructor.ACCESS_TTL_MS / 1000)
    );
    this.check('login returns the user', alice.user?.user_id === users.alice.user_id);
    this.check('login never returns the password hash', !('password_hash' in (alice.user || {})));
    return { alice: alice.tokens, root: root.tokens };
  }

  async checkMe(tokens) {
    console.log('\n/v1/me');
    this.expect('/me without a token', await this.call('GET', '/me'), 401);
    this.expect('/me with a forged token', await this.call('GET', '/me', { token: 'forged' }), 401);
    this.expect(
      '/me with a refresh token as access token',
      await this.call('GET', '/me', { token: tokens.alice.refresh_token }),
      401
    );
    const me = this.expect(
      '/me as alice',
      await this.call('GET', '/me', { token: tokens.alice.access_token }),
      200
    );
    this.check(
      '/me reports alice for flashcards, not an admin',
      me.user?.username === 'svc_alice' && me.app_key === 'flashcards' && me.user.is_admin === false
    );
    const root = this.expect(
      '/me as root',
      await this.call('GET', '/me', { token: tokens.root.access_token }),
      200
    );
    this.check(
      '/me reports root as admin and platform admin',
      root.user?.is_admin === true && root.user.is_platform_admin === true
    );
  }

  async checkRefreshAndRevocation(tokens) {
    console.log('\nRefresh rotation, reuse detection, logout, expiry');
    const first = tokens.alice;
    this.expect(
      'refresh without application credentials',
      await this.call('POST', '/auth/refresh', { json: { refresh_token: first.refresh_token } }),
      401
    );
    const rotated = this.expect(
      'refresh',
      await this.call('POST', '/auth/refresh', {
        headers: this.client,
        json: { refresh_token: first.refresh_token },
      }),
      200
    ).tokens;
    this.check(
      'refresh returns a new pair',
      rotated?.refresh_token && rotated.refresh_token !== first.refresh_token
    );
    this.expect(
      'new access token works',
      await this.call('GET', '/me', { token: rotated.access_token }),
      200
    );
    this.expect(
      'reusing the old refresh token',
      await this.call('POST', '/auth/refresh', {
        headers: this.client,
        json: { refresh_token: first.refresh_token },
      }),
      401
    );
    this.expect(
      'after reuse, the new refresh token is revoked too',
      await this.call('POST', '/auth/refresh', {
        headers: this.client,
        json: { refresh_token: rotated.refresh_token },
      }),
      401
    );
    this.expect(
      'after reuse, the new access token is revoked too',
      await this.call('GET', '/me', { token: rotated.access_token }),
      401
    );

    const session = this.expect('alice logs in again', await this.login('svc_alice'), 200).tokens;
    this.expect(
      'logout',
      await this.call('POST', '/auth/logout', { token: session.access_token }),
      200
    );
    this.expect(
      'access token after logout',
      await this.call('GET', '/me', { token: session.access_token }),
      401
    );
    this.expect(
      'refresh token after logout',
      await this.call('POST', '/auth/refresh', {
        headers: this.client,
        json: { refresh_token: session.refresh_token },
      }),
      401
    );

    const short = this.expect(
      'alice logs in for expiry',
      await this.login('svc_alice'),
      200
    ).tokens;
    await this.constructor.sleep(this.constructor.ACCESS_TTL_MS + 500);
    this.expect(
      'access token after expiry',
      await this.call('GET', '/me', { token: short.access_token }),
      401
    );
    this.expect(
      'refresh after the access token expired',
      await this.call('POST', '/auth/refresh', {
        headers: this.client,
        json: { refresh_token: short.refresh_token },
      }),
      200
    );
  }

  async checkStorage(tokens) {
    console.log('\nToken storage');
    const raw = await this.identityDatabase.query(this.constructor.queries.find_token, [
      tokens.root.access_token,
    ]);
    this.check('raw token value is not stored', raw.rows.length === 0);
    const hashed = await this.identityDatabase.query(this.constructor.queries.find_token, [
      TokenService.hash(tokens.root.access_token),
    ]);
    this.check('only the SHA-256 hash is stored', hashed.rows.length === 1);
  }

  async run() {
    this.assertLocalTarget();
    console.log('IAM service test (local scratch database)');
    await this.resetDatabase();
    const users = await this.seedUsers();
    const server = new IamServer({
      port: this.constructor.PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: this.secret,
        }),
        tokens: new TokenService(undefined, { accessTtlMs: this.constructor.ACCESS_TTL_MS }),
      },
    });
    await server.start();
    try {
      const tokens = await this.checkCredentialsAndLogin(users);
      await this.checkMe(tokens);
      await this.checkStorage(tokens);
      await this.checkRefreshAndRevocation(tokens);
    } finally {
      await server.stop();
    }
    return this.summary();
  }
}

export const iamServiceTest = new IamServiceTest();
export default iamServiceTest;
