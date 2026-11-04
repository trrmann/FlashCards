/**
 * IAM service API, version 1 (/v1).
 * Applications authenticate with X-IAM-Client-Id / X-IAM-Client-Secret; users
 * act through bearer access tokens issued to one application.
 */

import express from 'express';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';
import { validationService } from '../auth/validationService.mjs';
import { IamError } from '../auth/organizationService.mjs';
import { tokenService } from './tokenService.mjs';
import { ApplicationCredentials } from './applicationCredentials.mjs';

export class IamV1Router {
  static INVALID_LOGIN = 'Invalid username or password';

  constructor({
    tokens = tokenService,
    credentials = new ApplicationCredentials(),
    users = userAuthService,
    passwords = validationService,
    database = identityManagementDb,
  } = {}) {
    this.tokens = tokens;
    this.credentials = credentials;
    this.users = users;
    this.passwords = passwords;
    this.database = database;
    this.router = express.Router();
    this.requireClient = this.requireClient.bind(this);
    this.requireBearer = this.requireBearer.bind(this);
    this.registerRoutes();
  }

  /**
   * Middleware: the caller must be a configured application (req.iamClient = app key).
   */
  requireClient(req, res, next) {
    const appKey = req.get('X-IAM-Client-Id');
    if (!this.credentials.verify(appKey, req.get('X-IAM-Client-Secret'))) {
      return res.status(401).json({ status: 'error', message: 'Invalid application credentials' });
    }
    req.iamClient = appKey;
    return next();
  }

  /**
   * Middleware: a live bearer access token is required (req.iamToken = its record).
   */
  async requireBearer(req, res, next) {
    try {
      const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
      const token = match ? await this.tokens.verifyAccess(match[1]) : null;
      if (!token) {
        return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
      }
      req.iamToken = token;
      return next();
    } catch (error) {
      console.error('IAM token check error:', error.message);
      return res.status(500).json({ status: 'error', message: 'Token check failed' });
    }
  }

  /**
   * Wrap a handler: `work(req)` returns the JSON body; IamError maps to its status.
   */
  handle(work, successStatus = 200) {
    return async (req, res) => {
      try {
        const body = await work(req);
        return res.status(successStatus).json({ status: 'success', ...body });
      } catch (error) {
        if (error instanceof IamError) {
          return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error(`IAM ${req.method} ${req.originalUrl} error:`, error.message);
        return res.status(500).json({ status: 'error', message: 'IAM request failed' });
      }
    };
  }

  /**
   * Check a username/password for an application; throws IamError on failure.
   */
  async authenticate(username, password, appKey) {
    const user = username ? await this.users.findUserByUsername(String(username)) : null;
    const valid =
      user &&
      user.status === 'active' &&
      (await this.passwords.comparePassword(String(password ?? ''), user.password_hash));
    if (!valid) throw new IamError(401, this.constructor.INVALID_LOGIN);

    const allowed =
      (await this.users.hasAppAccess(user.user_id, appKey)) ||
      (await this.users.isPlatformAdmin(user.user_id));
    if (!allowed) throw new IamError(403, `This account does not have access to ${appKey}`);
    return user;
  }

  async login(req) {
    const { username, password } = req.body || {};
    const user = await this.authenticate(username, password, req.iamClient);
    const tokens = await this.tokens.issuePair(user.user_id, req.iamClient);
    return {
      tokens,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
      },
    };
  }

  async refresh(req) {
    const tokens = await this.tokens.refresh(req.body?.refresh_token, req.iamClient);
    if (!tokens) throw new IamError(401, 'Invalid or expired refresh token');
    return { tokens };
  }

  async logout(req) {
    await this.tokens.revokeFamily(req.iamToken.family_id);
    return { message: 'Signed out' };
  }

  async me(req) {
    const { user_id: userId, app_key: appKey } = req.iamToken;
    const user = await this.users.findUserById(userId, appKey);
    if (!user || user.status !== 'active') {
      await this.tokens.revokeFamily(req.iamToken.family_id);
      throw new IamError(401, 'Account is not active');
    }
    return { app_key: appKey, user, roles: await this.users.getUserRoles(userId) };
  }

  async health() {
    const health = await this.database.healthCheck();
    if (health.status !== 'healthy') throw new IamError(503, 'IAM database unavailable');
    return { service: 'iam', database: health.status };
  }

  registerRoutes() {
    const router = this.router;
    router.use(express.json({ limit: '1mb' }));
    router.get(
      '/health',
      this.handle(() => this.health())
    );
    router.post(
      '/auth/login',
      this.requireClient,
      this.handle((req) => this.login(req))
    );
    router.post(
      '/auth/refresh',
      this.requireClient,
      this.handle((req) => this.refresh(req))
    );
    router.post(
      '/auth/logout',
      this.requireBearer,
      this.handle((req) => this.logout(req))
    );
    router.get(
      '/me',
      this.requireBearer,
      this.handle((req) => this.me(req))
    );
  }
}

export default IamV1Router;
