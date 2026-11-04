/**
 * Identity over HTTP: the IAM service through IamClient (IAM phase 3c).
 *
 * - Sign-in keeps the user's token pair server-side, in FlashCards' session
 *   (req.session.iamTokens); the browser only ever has the session cookie.
 * - Calls as the user send the access token. On a 401 the pair is refreshed once
 *   (the service rotates it) and the call repeated; if the refresh fails the user is
 *   signed out of FlashCards.
 * - A session from in-process mode (a user id but no tokens) is signed out, once,
 *   when the gateway is switched on.
 * - Admin flags and header display info are cached per user for CACHE_TTL_MS, so a
 *   page view doesn't call the service every time. A role change shows within that time.
 * - On start it wakes the service (free plan: it sleeps when idle) without waiting.
 */

import express from 'express';
import { IamClient, IamClientError } from 'iam-service/client';
import { IdentityGateway, IdentityError } from './identityGateway.mjs';

/** A small time-limited cache. */
export class ExpiringCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  delete(key) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

export class RemoteIdentityGateway extends IdentityGateway {
  static CACHE_TTL_MS = 30000;
  static SUMMARY_BATCH = 1000;

  /**
   * @param {object} options
   * @param {string} [options.baseUrl] - IAM service URL
   * @param {string} [options.appKey]
   * @param {string} [options.clientSecret]
   * @param {IamClient} [options.client] - A ready client (tests)
   */
  constructor({ baseUrl, appKey = IdentityGateway.APP_KEY, clientSecret, client } = {}) {
    super();
    this.client = client || new IamClient({ baseUrl, appKey, clientSecret });
    this.baseUrl = baseUrl;
    this.me = new ExpiringCache(this.constructor.CACHE_TTL_MS);
    this.display = new ExpiringCache(this.constructor.CACHE_TTL_MS);
    this.hasUsers = false;
  }

  get mode() {
    return `remote (${this.baseUrl ?? 'IAM service'})`;
  }

  async start() {
    await this.client.start();
    // Wake a sleeping service now, so its cold start overlaps ours. Not awaited.
    this.client.health().catch((error) => {
      console.warn(`IAM service not answering yet: ${error.message}`);
    });
  }

  stop() {
    return this.client.stop();
  }

  /** Sign out a session left from in-process mode (user id, no tokens). */
  sessionMiddleware() {
    return (req, res, next) => {
      if (req.session?.userId && !req.session.iamTokens) {
        delete req.session.userId;
        delete req.session.username;
      }
      next();
    };
  }

  static signOut(req) {
    delete req.session.userId;
    delete req.session.username;
    delete req.session.iamTokens;
  }

  /**
   * Run `call(accessToken)` as the session user, refreshing the token pair once on a 401.
   */
  async asUser(req, call) {
    const tokens = req.session?.iamTokens;
    if (!req.session?.userId || !tokens) throw new IdentityError(401, 'Not authenticated');
    try {
      return await call(tokens.access_token);
    } catch (error) {
      if (!(error instanceof IamClientError) || error.status !== 401) throw error;
    }
    let refreshed;
    try {
      refreshed = (await this.client.refresh(tokens.refresh_token)).tokens;
    } catch (error) {
      if (!(error instanceof IamClientError)) throw error;
      this.constructor.signOut(req);
      throw new IdentityError(401, 'Session expired; please sign in again');
    }
    req.session.iamTokens = refreshed;
    return call(refreshed.access_token);
  }

  /** The IAM's /me for the session user, cached briefly. */
  async meOf(req) {
    const userId = IdentityGateway.userIdOf(req);
    const cached = this.me.get(userId);
    if (cached) return cached;
    return this.me.set(userId, await this.asUser(req, (token) => this.client.me(token)));
  }

  forget(userId) {
    this.me.delete(userId);
    this.display.delete(userId);
  }

  // ----- Sign-in -----

  async login(req, username, password) {
    const { tokens, user } = await this.client.login(username, password);
    req.session.iamTokens = tokens;
    this.forget(user.user_id);
    return user;
  }

  async logout(req) {
    const token = req.session?.iamTokens?.access_token;
    if (req.session?.userId) this.forget(req.session.userId);
    if (token) await this.client.logout(token).catch(() => {});
  }

  // ----- Application calls -----

  async register(fields) {
    const result = await this.client.register(fields);
    this.hasUsers = true;
    return result;
  }

  availability(query) {
    return this.client.availability(query);
  }

  /** Once there are users there always are, so a positive count is remembered. */
  async countUsers() {
    if (this.hasUsers) return 1;
    const { count } = await this.client.countUsers();
    this.hasUsers = count > 0;
    return count;
  }

  async lookupUser(username) {
    try {
      return (await this.client.lookupUser(String(username))).user;
    } catch (error) {
      if (error instanceof IamClientError && error.status === 404) return null;
      throw error;
    }
  }

  async getUserSummaries(userIds) {
    const ids = [...new Set(userIds.filter(Boolean))];
    const map = new Map();
    for (let i = 0; i < ids.length; i += this.constructor.SUMMARY_BATCH) {
      const { users } = await this.client.userSummaries(
        ids.slice(i, i + this.constructor.SUMMARY_BATCH)
      );
      for (const user of users) map.set(user.user_id, user);
    }
    return map;
  }

  async directory() {
    return (await this.client.directory()).users;
  }

  async displayInfo(req) {
    const userId = req.session?.userId;
    if (!userId || !req.session.iamTokens) return null;
    const cached = this.display.get(userId);
    if (cached !== undefined) return cached;
    try {
      return this.display.set(userId, (await this.client.userDisplay(userId)).user);
    } catch (error) {
      if (error instanceof IamClientError && error.status === 404) return null;
      throw error;
    }
  }

  // ----- The signed-in user -----

  async currentUser(req) {
    return (await this.meOf(req)).user;
  }

  async isAdmin(req) {
    if (!req.session?.userId || !req.session.iamTokens) return false;
    const { user } = await this.meOf(req);
    return Boolean(user?.is_admin || user?.is_platform_admin);
  }

  async updateProfile(req, fields) {
    const result = await this.asUser(req, (token) => this.client.updateProfile(token, fields));
    this.forget(req.session.userId);
    return result.user;
  }

  updatePassword(req, password) {
    return this.asUser(req, (token) => this.client.updatePassword(token, password));
  }

  setVisibility(req, isPublic) {
    return this.asUser(req, (token) => this.client.setVisibility(token, isPublic));
  }

  // ----- Administration (the service checks the token's user administers FlashCards) -----

  listUsers(req) {
    return this.asUser(req, (token) => this.client.listUsers(token));
  }

  async getUser(req, userId) {
    return (await this.asUser(req, (token) => this.client.getUser(token, userId))).user;
  }

  createUser(req, fields) {
    return this.asUser(req, (token) => this.client.createUser(token, fields));
  }

  async setUserStatus(req, userId, enabled) {
    const result = await this.asUser(req, (token) =>
      enabled ? this.client.enableUser(token, userId) : this.client.disableUser(token, userId)
    );
    this.forget(userId);
    return result.user;
  }

  async deleteUser(req, userId) {
    const result = await this.asUser(req, (token) => this.client.deleteUser(token, userId));
    this.forget(userId);
    return result;
  }

  async setUserAdmin(req, userId, admin) {
    const result = await this.asUser(req, (token) =>
      admin ? this.client.promoteUser(token, userId) : this.client.demoteUser(token, userId)
    );
    this.forget(userId);
    return result;
  }

  setUserVisibility(req, userId, isPublic) {
    return this.asUser(req, (token) => this.client.setUserVisibility(token, userId, isPublic));
  }

  // ----- Organizations, groups, platform admins, app access (/api/iam) -----

  /**
   * /api/iam/* passed through to the service's /v1/* as the session user, with the
   * service's status and body unchanged.
   */
  organizationRouter() {
    const router = express.Router();
    router.use(express.json({ limit: '1mb' }));
    router.use((req, res) => this.passThrough(req, res));
    return router;
  }

  /** One /api/iam request, answered with the service's status and body. */
  async passThrough(req, res) {
    try {
      const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
      const answer = await this.asUser(req, async (token) => {
        const raw = await this.client.callRaw(req.method, req.url, {
          token,
          ...(hasBody ? { body: req.body ?? {} } : {}),
        });
        if (raw.status === 401) throw new IamClientError(401, raw.body?.message, raw.body);
        return raw;
      });
      // Organization changes (group roles, platform admins, app access) can change anyone's
      // rights, so every write drops all cached admin flags.
      if (hasBody || req.method === 'DELETE') {
        this.me.clear();
        this.display.clear();
      }
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      return IdentityGateway.respond(res, error, 'IAM request failed');
    }
  }
}

export default RemoteIdentityGateway;
