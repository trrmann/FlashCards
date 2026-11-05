/**
 * RemoteIdentityGateway test (no database, no network): a stand-in IamClient drives the
 * paths the HTTP suite can't reach on demand: an expired access token refreshed once and
 * the call repeated; a failed refresh signing the user out; a session from in-process mode
 * signed out once; admin flags cached between calls and dropped after an organization
 * change; an unreachable service answered with 503; errors keep the service's status.
 */

import { IamClientError, QueueTimeoutError } from 'iam-service/client';
import { RemoteIdentityGateway } from '../identity/remoteIdentityGateway.mjs';
import { IdentityGateway, IdentityError } from '../identity/identityGateway.mjs';

/** Records calls; each method's behaviour is set per check. */
class FakeIamClient {
  constructor() {
    this.calls = [];
    this.behaviour = {};
  }

  async invoke(name, ...args) {
    this.calls.push(name);
    const behave = this.behaviour[name];
    if (!behave) throw new Error(`unexpected call ${name}`);
    return behave(...args);
  }

  me(token) {
    return this.invoke('me', token);
  }

  refresh(refreshToken) {
    return this.invoke('refresh', refreshToken);
  }

  lookupUser(username) {
    return this.invoke('lookupUser', username);
  }

  callRaw(method, path, options) {
    return this.invoke('callRaw', method, path, options);
  }

  count(name) {
    return this.calls.filter((call) => call === name).length;
  }
}

export class RemoteIdentityGatewayTest {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  check(label, ok, detail = '') {
    if (ok) this.passed += 1;
    else this.failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `: ${detail}`}`);
  }

  static request(session) {
    return { session: { ...session } };
  }

  static async errorOf(promise) {
    try {
      await promise;
      return null;
    } catch (error) {
      return error;
    }
  }

  gateway() {
    const client = new FakeIamClient();
    return { client, gateway: new RemoteIdentityGateway({ client }) };
  }

  async checkRefresh() {
    console.log('Token refresh');
    const { client, gateway } = this.gateway();
    const req = this.constructor.request({
      userId: 'u1',
      iamTokens: { access_token: 'old', refresh_token: 'r1' },
    });
    client.behaviour.me = async (token) => {
      if (token === 'old') throw new IamClientError(401, 'expired');
      return { user: { user_id: 'u1', is_admin: true } };
    };
    client.behaviour.refresh = async () => ({
      tokens: { access_token: 'new', refresh_token: 'r2' },
    });
    const user = await gateway.currentUser(req);
    this.check(
      'an expired access token is refreshed once and the call repeated',
      user.user_id === 'u1' && client.count('refresh') === 1 && client.count('me') === 2
    );
    this.check(
      'the session keeps the rotated pair',
      req.session.iamTokens.access_token === 'new' && req.session.iamTokens.refresh_token === 'r2'
    );

    const failing = this.gateway();
    const signedIn = this.constructor.request({
      userId: 'u1',
      username: 'alice',
      iamTokens: { access_token: 'old', refresh_token: 'used' },
    });
    failing.client.behaviour.me = async () => {
      throw new IamClientError(401, 'expired');
    };
    failing.client.behaviour.refresh = async () => {
      throw new IamClientError(401, 'refresh token reused');
    };
    const error = await this.constructor.errorOf(failing.gateway.currentUser(signedIn));
    this.check(
      'a failed refresh signs the user out with 401',
      error instanceof IdentityError &&
        error.status === 401 &&
        !signedIn.session.userId &&
        !signedIn.session.iamTokens
    );

    const other = this.gateway();
    other.client.behaviour.me = async () => {
      throw new IamClientError(403, 'forbidden');
    };
    const forbidden = await this.constructor.errorOf(
      other.gateway.currentUser(
        this.constructor.request({ userId: 'u1', iamTokens: { access_token: 'a' } })
      )
    );
    this.check(
      'other errors are not refreshed and keep their status',
      forbidden?.status === 403 && other.client.count('refresh') === 0
    );
  }

  checkLegacySession() {
    console.log('\nSessions from in-process mode');
    const { gateway } = this.gateway();
    const legacy = this.constructor.request({ userId: 'u1', username: 'alice' });
    const current = this.constructor.request({ userId: 'u2', iamTokens: { access_token: 'a' } });
    const middleware = gateway.sessionMiddleware();
    middleware(legacy, {}, () => {});
    middleware(current, {}, () => {});
    this.check(
      'a session without tokens is signed out; one with tokens is kept',
      !legacy.session.userId && current.session.userId === 'u2'
    );
  }

  async checkCaching() {
    console.log('\nCaching');
    const { client, gateway } = this.gateway();
    const req = this.constructor.request({ userId: 'u1', iamTokens: { access_token: 'a' } });
    client.behaviour.me = async () => ({ user: { user_id: 'u1', is_admin: true } });
    const first = await gateway.isAdmin(req);
    const second = await gateway.isAdmin(req);
    this.check(
      'admin flags are cached between requests',
      first && second && client.count('me') === 1
    );
    this.check(
      'a request without a session is not an admin (no call)',
      (await gateway.isAdmin(this.constructor.request({}))) === false && client.count('me') === 1
    );

    client.behaviour.callRaw = async () => ({ status: 201, body: { status: 'success' } });
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const post = { ...req, method: 'POST', url: '/organizations', body: { name: 'x' } };
    await gateway.passThrough(post, res);
    this.check("an organization call passes the service's status through", res.code === 201);
    await gateway.isAdmin(req);
    this.check('an organization change drops cached admin flags', client.count('me') === 2);
  }

  /** Only the organizations API passes through; app-only endpoints never reach the service. */
  async checkPassThroughAllowlist() {
    console.log('\nWhat the browser may reach through /api/iam');
    const { client, gateway } = this.gateway();
    client.behaviour.callRaw = async () => ({ status: 200, body: { status: 'success' } });
    const req = this.constructor.request({ userId: 'u1', iamTokens: { access_token: 'a' } });
    const answer = async (method, url) => {
      const res = {
        status(code) {
          this.code = code;
          return this;
        },
        json() {
          return this;
        },
      };
      await gateway.passThrough({ ...req, method, url, body: {} }, res);
      return res.code;
    };
    const blocked = [
      ['POST', '/events/ack'],
      ['GET', '/events'],
      ['POST', '/users/register'],
      ['GET', '/users/count'],
      ['GET', '/users/lookup?username=x'],
      ['GET', '/admin/backup'],
      ['PUT', '/me/password'],
      ['GET', '/organizationsX'],
    ];
    const codes = [];
    for (const [method, url] of blocked) codes.push(await answer(method, url));
    this.check(
      'app-only and other paths are refused (404) and never reach the service',
      codes.every((code) => code === 404) && client.count('callRaw') === 0,
      codes.join(',')
    );
    const allowed = [
      ['GET', '/organizations'],
      ['GET', '/organizations/1/members?x=1'],
      ['POST', '/groups/2/roles'],
      ['PUT', '/applications/flashcards/users/3'],
      ['POST', '/platform-admins/4'],
    ];
    const ok = [];
    for (const [method, url] of allowed) ok.push(await answer(method, url));
    this.check(
      'the organizations API passes through',
      ok.every((code) => code === 200) && client.count('callRaw') === allowed.length,
      ok.join(',')
    );
  }

  async checkErrors() {
    console.log('\nErrors');
    const { client, gateway } = this.gateway();
    client.behaviour.lookupUser = async () => {
      throw new IamClientError(404, 'User not found');
    };
    this.check('look-up of an unknown user → null', (await gateway.lookupUser('nobody')) === null);
    const asleep = IdentityGateway.errorAnswer(new QueueTimeoutError('job-1', 90000));
    this.check('an unreachable service → 503', asleep?.status === 503);
    const rules = IdentityGateway.errorAnswer(
      new IamClientError(400, 'Validation failed', { errors: ['too short'] })
    );
    this.check(
      "the service's validation errors are passed on",
      rules?.status === 400 && rules.body.errors?.[0] === 'too short'
    );
    this.check(
      'other errors are not identity answers',
      IdentityGateway.errorAnswer(new Error('x')) === null
    );
  }

  async execute() {
    console.log('RemoteIdentityGateway test (stand-in IAM client)\n');
    await this.checkRefresh();
    this.checkLegacySession();
    await this.checkCaching();
    await this.checkPassThroughAllowlist();
    await this.checkErrors();
    console.log(`\n${this.passed}/${this.passed + this.failed} checks passed`);
    return this.failed === 0;
  }
}

export const remoteIdentityGatewayTest = new RemoteIdentityGatewayTest();
export default remoteIdentityGatewayTest;
