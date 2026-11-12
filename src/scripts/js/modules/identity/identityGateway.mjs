/**
 * Identity gateway: the one way FlashCards reaches identity (sign-in, accounts, the
 * directory, user administration, organizations). Two implementations with the same methods:
 *
 *  - LocalIdentityGateway: the IAM runs in-process (iam-service's UserAccountService on the
 *    shared database). The default.
 *  - RemoteIdentityGateway: the IAM service over HTTP (IamClient), chosen when IAM_URL is set
 *    (with IAM_CLIENT_SECRET, and IAM_CLIENT_ID default 'flashcards'); see createIdentityGateway.
 *
 * Both enforce the same rules (UserAccountService runs behind both) and fail the same way:
 * an error with `status` and `body` ({ status: 'error', message, errors? }) that a route can
 * send as is (IdentityGateway.respond). Methods that act as the signed-in user take `req`.
 */

import express from 'express';
import { DomainError } from 'iam-service/domain';
import { IamClientError, QueueTimeoutError, WebIdentity } from 'iam-service/client';

export class IdentityError extends Error {
  constructor(status, message, errors = undefined) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export class IdentityGateway {
  static APP_KEY = 'flashcards';

  /**
   * The HTTP answer for an identity failure, or null when `error` is something else.
   * @returns {{status: number, body: object}|null}
   */
  static errorAnswer(error) {
    if (error instanceof IdentityError) {
      return IdentityGateway.answer(error.status, error.message, error.errors);
    }
    if (error instanceof DomainError) {
      return IdentityGateway.answer(error.statusCode, error.message, error.errors);
    }
    if (error instanceof IamClientError) {
      return IdentityGateway.answer(error.status, error.message, error.body?.errors);
    }
    if (error instanceof QueueTimeoutError) {
      return IdentityGateway.answer(503, 'The identity service is not answering; please try again');
    }
    return null;
  }

  static answer(status, message, errors) {
    return { status, body: { status: 'error', message, ...(errors ? { errors } : {}) } };
  }

  /**
   * Send an identity failure as its answer; anything else as 500 with `fallbackMessage`.
   */
  static respond(res, error, fallbackMessage) {
    const answer = IdentityGateway.errorAnswer(error);
    if (answer) return res.status(answer.status).json(answer.body);
    console.error(`${fallbackMessage}:`, error.message);
    return res.status(500).json({ status: 'error', message: fallbackMessage });
  }

  /** The signed-in user's id, or a 401 IdentityError. */
  static userIdOf(req) {
    if (!req.session?.userId) throw new IdentityError(401, 'Not authenticated');
    return req.session.userId;
  }

  get appKey() {
    return IdentityGateway.APP_KEY;
  }

  /**
   * True when the IAM runs in this process (its schema is then FlashCards' to bootstrap and
   * check); false when it is the IAM service, which owns its schema (phase 3d).
   */
  get runsInProcess() {
    return false;
  }

  /** 'local' or 'remote' (for the start-up log). */
  get mode() {
    throw new Error(`${this.constructor.name} must define mode`);
  }

  async start() {}

  async stop() {}

  /** Express middleware run on every request after the session (default: nothing). */
  sessionMiddleware() {
    return (req, res, next) => next();
  }

  // ----- App tokens: service accounts (backups; iam-service MIGRATION.md L12) -----

  /** The request's app token (`Authorization: Bearer iamsa_…`), or null. */
  static appTokenOf(req) {
    return WebIdentity.appTokenOf(req);
  }

  /**
   * Check the request's app token for `rights`: `{ principal, allowed }`, or null without an app token. A bad,
   * expired, revoked or another application's token throws 401.
   * @param {object} _req
   * @param {string[]} _rights
   */
  async checkAppToken(_req, _rights) {
    throw new Error(`${this.constructor.name} must define checkAppToken`);
  }

  /**
   * Whether the request may back up ('export') or restore ('import') the identity part: a service account
   * holding identity.backup.<direction> (checked into req.serviceAccount by the route), else a platform admin.
   */
  async mayBackUpIdentity(req, direction) {
    if (req.serviceAccount) {
      return req.serviceAccount.allowed?.[`identity.backup.${direction}`] === true;
    }
    return this.isPlatformAdmin(req);
  }

  async requireIdentityBackup(req, direction) {
    if (!(await this.mayBackUpIdentity(req, direction))) {
      throw new IdentityError(
        403,
        req.serviceAccount
          ? `The service account does not hold identity.backup.${direction}`
          : 'Platform administrator access required'
      );
    }
  }

  /**
   * The second step of a sign-in when the IAM asks for MFA (mounted at /api/auth/mfa). Only the IAM service
   * has MFA (the remote gateway); in-process mode never asks for it, so this answers 404.
   * @param {{ onSignedIn: (req: object, user: object) => Promise<void> }} _options
   */
  mfaSignInRouter(_options) {
    const router = express.Router();
    router.use((req, res) =>
      res.status(404).json({ status: 'error', message: 'MFA needs the IAM service (IAM_URL)' })
    );
    return router;
  }

  /**
   * Impersonation's session side (mounted at /api/auth/impersonation; iam-service phase 3e). Only the IAM service
   * impersonates (the remote gateway); in-process mode answers 404.
   * @param {{ onSwitch: (req: object, user: object) => Promise<void> }} _options
   */
  impersonationRouter(_options) {
    const router = express.Router();
    router.use((req, res) =>
      res
        .status(404)
        .json({ status: 'error', message: 'Impersonation needs the IAM service (IAM_URL)' })
    );
    return router;
  }
}

export default IdentityGateway;
