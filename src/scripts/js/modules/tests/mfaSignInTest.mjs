/**
 * MFA sign-in test (local scratch database): FlashCards with the IAM service over HTTP, the service with an MFA
 * key (iam-service v0.2). A domain admin's password sign-in is sent to /mfa?mode=enroll (no session yet), the page
 * shows <iam-mfa-sign-in>, enrolment through /api/auth/mfa finishes the sign-in; the next sign-in goes to
 * /mfa?mode=verify, a wrong code is refused and the right one signs in; a plain user signs in without MFA and reads
 * their MFA status through /api/iam (the <iam-mfa> profile screen's calls).
 */

import crypto from 'node:crypto';
import { IamServer, ApplicationCredentials } from 'iam-service/server';
import { userAuthService, MfaService } from 'iam-service/services';
import { MfaKey, Totp } from 'iam-service/mfa';
import { Server } from '../server.mjs';
import { LocalTestCase } from './localTestCase.mjs';
import { ApiSession } from './iamApiTest.mjs';
import { RemoteIdentityGateway } from '../identity/index.mjs';

export class MfaSignInTest extends LocalTestCase {
  static PORT = 5088;
  static IAM_PORT = 5089;
  static PASSWORD = 'MfaSignIn#2026';

  constructor(options) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${MfaSignInTest.PORT}`;
  }

  /** A page's HTML, with the session's cookie. */
  async page(session, pagePath) {
    const response = await fetch(`${this.baseUrl}${pagePath}`, {
      headers: session.cookie ? { Cookie: session.cookie } : {},
    });
    return response.text();
  }

  static code(secret, offset = 0) {
    return Totp.code(secret, Totp.stepAt() + offset);
  }

  async checkAdminEnrols() {
    console.log('A domain admin must set up MFA at sign-in');
    const session = new ApiSession(this.baseUrl);
    const login = await session.post('/api/auth/login', {
      username: 'mfa_fc_root',
      password: MfaSignInTest.PASSWORD,
    });
    this.check(
      'the password step sends the browser to /mfa?mode=enroll',
      login.status === 200 && login.body.redirectTo === '/mfa?mode=enroll'
    );
    this.check(
      'not signed in to FlashCards yet',
      (await session.get('/api/auth/current')).status === 401
    );
    const html = await this.page(session, '/mfa?mode=enroll');
    this.check(
      'the /mfa page shows the IAM screen in enrolment mode',
      html.includes('<iam-mfa-sign-in') && html.includes('mode="enroll"')
    );
    const start = await session.post('/api/auth/mfa/enroll/start');
    this.check(
      'enrolment starts: a QR code and the key to type',
      start.status === 200 && start.body.enrollment?.qr_svg?.startsWith('<svg')
    );
    const secret = start.body.enrollment.secret;
    const confirm = await session.post('/api/auth/mfa/enroll/confirm', {
      code: MfaSignInTest.code(secret),
    });
    this.check(
      'confirming gives 10 recovery codes',
      confirm.status === 200 && confirm.body.recovery_codes?.length === 10
    );
    const current = await session.get('/api/auth/current');
    this.check(
      'and signs in to FlashCards',
      current.status === 200 && JSON.stringify(current.body).includes('mfa_fc_root')
    );
    this.rootSecret = secret;
  }

  async checkAdminVerifies() {
    console.log('\nThe next sign-in asks for a code');
    const session = new ApiSession(this.baseUrl);
    const login = await session.post('/api/auth/login', {
      username: 'mfa_fc_root',
      password: MfaSignInTest.PASSWORD,
    });
    this.check(
      'the password step sends the browser to /mfa?mode=verify',
      login.body.redirectTo === '/mfa?mode=verify'
    );
    const wrong = await session.post('/api/auth/mfa/verify', { code: '000000' });
    this.check(
      'a wrong code is refused, still signed out',
      wrong.status === 401 && (await session.get('/api/auth/current')).status === 401
    );
    const right = await session.post('/api/auth/mfa/verify', {
      code: MfaSignInTest.code(this.rootSecret, 1),
    });
    this.check(
      'the right code signs in to FlashCards',
      right.status === 200 && (await session.get('/api/auth/current')).status === 200
    );
    const stale = await new ApiSession(this.baseUrl).post('/api/auth/mfa/verify', {
      code: '123456',
    });
    this.check('without a pending sign-in, /api/auth/mfa answers 401', stale.status === 401);
  }

  async checkPlainUser() {
    console.log('\nA plain user');
    const session = new ApiSession(this.baseUrl);
    const login = await session.post('/api/auth/login', {
      username: 'mfa_fc_plain',
      password: MfaSignInTest.PASSWORD,
    });
    this.check(
      'signs in with the password alone',
      login.status === 200 &&
        !String(login.body.redirectTo || '').startsWith('/mfa') &&
        (await session.get('/api/auth/current')).status === 200
    );
    const status = await session.get('/api/iam/me/mfa');
    this.check(
      "the profile's MFA screen reads its status through /api/iam",
      status.status === 200 &&
        status.body.mfa?.enabled === false &&
        status.body.mfa?.required === false
    );
    const html = await this.page(session, '/profile');
    this.check('the profile page shows the IAM MFA screen', html.includes('<iam-mfa'));
  }

  async run() {
    this.assertLocalTarget();
    console.log('MFA sign-in test (local scratch database; identity over HTTP with an MFA key)\n');
    await this.resetDatabase();
    const make = (name) =>
      userAuthService.createUser(name, `${name}@example.test`, MfaSignInTest.PASSWORD);
    const root = await make('mfa_fc_root');
    await userAuthService.makeFirstAdmin(root.user_id);
    await make('mfa_fc_plain');

    const secret = crypto.randomBytes(32).toString('hex');
    const iamServer = new IamServer({
      port: MfaSignInTest.IAM_PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: secret,
        }),
        mfa: new MfaService(this.identityDatabase, {
          key: new MfaKey({ key: crypto.randomBytes(MfaKey.KEY_BYTES).toString('base64') }),
        }),
      },
    });
    await iamServer.start();
    const identity = new RemoteIdentityGateway({
      baseUrl: `http://127.0.0.1:${MfaSignInTest.IAM_PORT}`,
      clientSecret: secret,
    });
    const server = new Server({ env: 'development', port: MfaSignInTest.PORT, identity });
    await server.start();
    try {
      await this.checkAdminEnrols();
      await this.checkAdminVerifies();
      await this.checkPlainUser();
    } finally {
      await new Promise((resolve) => server.httpServer.close(resolve));
      await identity.stop();
      await iamServer.stop();
    }
    return this.summary();
  }
}

export const mfaSignInTest = new MfaSignInTest();
export default mfaSignInTest;
