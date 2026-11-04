/**
 * IAM API test (CODING_STANDARDS 0.6): exercises every /api/iam endpoint over
 * HTTP against the real server, started in-process on the local scratch
 * database, as several users with different roles. Covers success, validation
 * (400), authentication (401), authorization (403), not-found (404),
 * conflicts (409), and side effects (group roles granting admin, app access
 * blocking login, removing a member from the organization's groups).
 */

import { Server } from '../server.mjs';
import { LocalTestCase } from './localTestCase.mjs';

/**
 * One signed-in browser: keeps the session cookie between requests.
 */
export class ApiSession {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = null;
  }

  async request(method, apiPath, json) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const session = (response.headers.getSetCookie?.() || []).find((value) =>
      value.startsWith('connect.sid=')
    );
    if (session) this.cookie = session.split(';')[0];
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  }

  get(apiPath) {
    return this.request('GET', apiPath);
  }

  post(apiPath, json = {}) {
    return this.request('POST', apiPath, json);
  }

  put(apiPath, json = {}) {
    return this.request('PUT', apiPath, json);
  }

  delete(apiPath) {
    return this.request('DELETE', apiPath);
  }
}

export class IamApiTest extends LocalTestCase {
  static PORT = 5098;
  static PASSWORD = 'IamApi#2026';
  static USERS = ['root', 'alice', 'bob', 'carol', 'dave'];

  constructor(options) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${this.constructor.PORT}`;
    this.sessions = {};
    this.ids = {};
  }

  expect(label, response, status) {
    this.check(
      `${label} → ${status}`,
      response.status === status,
      `got ${response.status} ${response.body?.message || ''}`
    );
    return response.body;
  }

  /**
   * Register every user (the first becomes platform + FlashCards admin).
   */
  async registerUsers() {
    for (const name of this.constructor.USERS) {
      const session = new ApiSession(this.baseUrl);
      const response = await session.post('/api/auth/register', {
        username: name,
        email: `${name}@example.test`,
        password: this.constructor.PASSWORD,
        passwordConfirm: this.constructor.PASSWORD,
        fullName: name,
      });
      this.expect(`register ${name}`, response, 201);
      this.sessions[name] = session;
      this.ids[name] = response.body.user?.user_id;
    }
  }

  async login(name) {
    const session = new ApiSession(this.baseUrl);
    const response = await session.post('/api/auth/login', {
      username: name,
      password: this.constructor.PASSWORD,
    });
    return response;
  }

  async checkOrganizations() {
    const { root, alice, bob, carol } = this.sessions;
    const anonymous = new ApiSession(this.baseUrl);

    console.log('\nOrganizations');
    this.expect(
      'anonymous lists organizations',
      await anonymous.get('/api/iam/organizations'),
      401
    );
    const rootList = this.expect(
      'root lists organizations',
      await root.get('/api/iam/organizations'),
      200
    );
    this.check('root is a platform admin', rootList.isPlatformAdmin === true);
    const current = this.expect('root /api/auth/current', await root.get('/api/auth/current'), 200);
    this.check(
      'first user is FlashCards admin and platform admin',
      current.user?.is_admin === true && current.user?.is_platform_admin === true
    );
    this.expect(
      'alice creates an organization',
      await alice.post('/api/iam/organizations', { name: 'Org A', slug: 'org-a' }),
      403
    );
    const created = this.expect(
      'root creates Org A owned by alice',
      await root.post('/api/iam/organizations', {
        name: 'Org A',
        slug: 'org-a',
        ownerUsername: 'alice',
      }),
      201
    );
    this.orgA = created.organization?.org_id;
    this.expect(
      'duplicate slug',
      await root.post('/api/iam/organizations', { name: 'Again', slug: 'org-a' }),
      409
    );
    this.expect(
      'invalid slug',
      await root.post('/api/iam/organizations', { name: 'Bad', slug: 'A!' }),
      400
    );
    this.expect(
      'malformed org id',
      await root.get('/api/iam/organizations/not-a-uuid/members'),
      404
    );
    this.expect(
      'non-member bob reads Org A members',
      await bob.get(`/api/iam/organizations/${this.orgA}/members`),
      404
    );
    const aliceList = this.expect(
      'alice lists organizations',
      await alice.get('/api/iam/organizations'),
      200
    );
    this.check(
      'alice sees Org A as owner',
      aliceList.organizations?.length === 1 && aliceList.organizations[0].my_role === 'owner'
    );
    this.expect(
      'alice renames Org A',
      await alice.put(`/api/iam/organizations/${this.orgA}`, { name: 'Org A (renamed)' }),
      200
    );
    this.expect(
      'invalid status',
      await alice.put(`/api/iam/organizations/${this.orgA}`, { status: 'archived' }),
      400
    );
    this.expect(
      'carol (not yet a member) renames Org A',
      await carol.put(`/api/iam/organizations/${this.orgA}`, { name: 'x' }),
      404
    );
  }

  async checkMembers() {
    const { alice, bob, carol } = this.sessions;
    const members = `/api/iam/organizations/${this.orgA}/members`;

    console.log('\nMembers');
    this.expect('alice adds bob', await alice.post(members, { username: 'bob' }), 201);
    this.expect(
      'alice adds carol as admin',
      await alice.post(members, { username: 'carol', orgRole: 'admin' }),
      201
    );
    this.expect('alice adds bob again', await alice.post(members, { username: 'bob' }), 409);
    this.expect(
      'alice adds an unknown user',
      await alice.post(members, { username: 'nobody' }),
      404
    );
    this.expect(
      'invalid org role',
      await alice.post(members, { username: 'dave', orgRole: 'king' }),
      400
    );
    this.expect('member bob adds dave', await bob.post(members, { username: 'dave' }), 403);
    this.expect(
      'admin carol makes bob an owner',
      await carol.put(`${members}/${this.ids.bob}`, { orgRole: 'owner' }),
      403
    );
    this.expect(
      'owner alice makes bob an owner',
      await alice.put(`${members}/${this.ids.bob}`, { orgRole: 'owner' }),
      200
    );
    this.expect(
      'owner alice makes bob a member again',
      await alice.put(`${members}/${this.ids.bob}`, { orgRole: 'member' }),
      200
    );
    this.expect(
      'alice demotes herself (last owner)',
      await alice.put(`${members}/${this.ids.alice}`, { orgRole: 'member' }),
      409
    );
    this.expect(
      'alice removes herself (last owner)',
      await alice.delete(`${members}/${this.ids.alice}`),
      409
    );
    const list = this.expect('bob lists members', await bob.get(members), 200);
    this.check(
      'Org A has 3 members, owner first',
      list.members?.length === 3 && list.members[0].username === 'alice'
    );
  }

  async checkGroups() {
    const { root, alice, bob, carol } = this.sessions;

    console.log('\nGroups and group roles');
    const groups = `/api/iam/organizations/${this.orgA}/groups`;
    const created = this.expect(
      'admin carol creates G1',
      await carol.post(groups, { name: 'G1', description: 'Group one' }),
      201
    );
    this.groupId = created.group?.group_id;
    this.expect('duplicate group name', await carol.post(groups, { name: 'G1' }), 409);
    this.expect('member bob creates a group', await bob.post(groups, { name: 'G2' }), 403);
    this.expect(
      'carol renames G1',
      await carol.put(`/api/iam/groups/${this.groupId}`, { description: 'Updated' }),
      200
    );
    const groupMembers = `/api/iam/groups/${this.groupId}/members`;
    this.expect('carol adds bob to G1', await carol.post(groupMembers, { username: 'bob' }), 201);
    this.expect(
      'carol adds dave (not in Org A) to G1',
      await carol.post(groupMembers, { username: 'dave' }),
      400
    );
    const listed = this.expect('bob lists G1 members', await bob.get(groupMembers), 200);
    this.check(
      'G1 contains bob',
      listed.members?.some((m) => m.username === 'bob')
    );

    const roles = `/api/iam/groups/${this.groupId}/roles`;
    this.expect('bob reads admin users before', await bob.get('/api/admin/users'), 403);
    this.expect(
      'owner alice (not an app admin) grants FlashCards admin to G1',
      await alice.post(roles, { appKey: 'flashcards', roleName: 'admin' }),
      403
    );
    this.expect(
      'root grants an unknown role',
      await root.post(roles, { appKey: 'flashcards', roleName: 'wizard' }),
      404
    );
    const granted = this.expect(
      'root grants FlashCards admin to G1',
      await root.post(roles, { appKey: 'flashcards', roleName: 'admin' }),
      201
    );
    this.expect(
      'root grants it again',
      await root.post(roles, { appKey: 'flashcards', roleName: 'admin' }),
      409
    );
    this.expect('bob (admin through G1) reads admin users', await bob.get('/api/admin/users'), 200);
    const roleList = this.expect('bob lists G1 roles', await bob.get(roles), 200);
    this.check(
      'G1 holds flashcards/admin',
      roleList.roles?.some((r) => r.role_name === 'admin' && r.app_key === 'flashcards')
    );
    this.expect(
      'alice revokes the G1 admin role',
      await alice.delete(`${roles}/${granted.role?.role_id}`),
      403
    );
    this.expect(
      'root revokes the G1 admin role',
      await root.delete(`${roles}/${granted.role?.role_id}`),
      200
    );
    this.expect('bob reads admin users after', await bob.get('/api/admin/users'), 403);

    this.expect(
      'carol removes bob from Org A',
      await carol.delete(`/api/iam/organizations/${this.orgA}/members/${this.ids.bob}`),
      200
    );
    const after = this.expect('carol lists G1 members', await carol.get(groupMembers), 200);
    this.check('bob was removed from G1 too', !after.members?.some((m) => m.username === 'bob'));
    const bobOrgs = this.expect(
      'bob lists organizations',
      await bob.get('/api/iam/organizations'),
      200
    );
    this.check('bob no longer sees Org A', bobOrgs.organizations?.length === 0);
  }

  async checkPlatformAndAccess() {
    const { root, alice, carol } = this.sessions;

    console.log('\nPlatform admins and application access');
    this.expect(
      'alice makes carol a platform admin',
      await alice.post(`/api/iam/platform-admins/${this.ids.carol}`),
      403
    );
    this.expect(
      'root makes carol a platform admin',
      await root.post(`/api/iam/platform-admins/${this.ids.carol}`),
      200
    );
    this.expect(
      'carol creates Org C',
      await carol.post('/api/iam/organizations', { name: 'Org C', slug: 'org-c' }),
      201
    );
    this.expect(
      'root removes own platform admin',
      await root.delete(`/api/iam/platform-admins/${this.ids.root}`),
      400
    );
    this.expect(
      'root removes carol as platform admin',
      await root.delete(`/api/iam/platform-admins/${this.ids.carol}`),
      200
    );
    this.expect(
      'unknown user',
      await root.post('/api/iam/platform-admins/00000000-0000-4000-8000-000000000009'),
      404
    );

    const apps = this.expect(
      'root lists applications',
      await root.get('/api/iam/applications'),
      200
    );
    this.check(
      'flashcards is registered',
      apps.applications?.some((a) => a.app_key === 'flashcards')
    );
    this.expect('alice lists applications', await alice.get('/api/iam/applications'), 403);

    const access = `/api/iam/applications/flashcards/users/${this.ids.dave}`;
    this.expect('alice disables dave', await alice.put(access, { status: 'disabled' }), 403);
    this.expect('invalid access status', await root.put(access, { status: 'gone' }), 400);
    this.expect('root disables dave', await root.put(access, { status: 'disabled' }), 200);
    this.expect('dave logs in while disabled', await this.login('dave'), 403);
    this.expect('root enables dave', await root.put(access, { status: 'active' }), 200);
    this.expect('dave logs in again', await this.login('dave'), 200);
    this.expect(
      'root disables own access',
      await root.put(`/api/iam/applications/flashcards/users/${this.ids.root}`, {
        status: 'disabled',
      }),
      400
    );
  }

  async checkDeletion() {
    const { root, alice } = this.sessions;

    console.log('\nDeletion');
    this.expect(
      'alice deletes Org A',
      await alice.delete(`/api/iam/organizations/${this.orgA}`),
      403
    );
    this.expect('alice deletes G1', await alice.delete(`/api/iam/groups/${this.groupId}`), 200);
    this.expect('G1 is gone', await alice.get(`/api/iam/groups/${this.groupId}/members`), 404);
    this.expect(
      'root deletes Org A',
      await root.delete(`/api/iam/organizations/${this.orgA}`),
      200
    );
    this.expect('Org A is gone', await root.get(`/api/iam/organizations/${this.orgA}/groups`), 404);
  }

  async run() {
    this.assertLocalTarget();
    console.log('IAM API test (local scratch database)');
    await this.resetDatabase();
    const server = new Server({ env: 'development', port: this.constructor.PORT });
    await server.start();
    try {
      await this.registerUsers();
      await this.checkOrganizations();
      await this.checkMembers();
      await this.checkGroups();
      await this.checkPlatformAndAccess();
      await this.checkDeletion();
    } finally {
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
    return this.summary();
  }
}

export const iamApiTest = new IamApiTest();
export default iamApiTest;
