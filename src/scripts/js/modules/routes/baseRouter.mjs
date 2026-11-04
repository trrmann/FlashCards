/**
 * Base Router Class
 * Common OOP foundation for all route modules: owns the express router,
 * the database handle, and shared authentication/authorization middleware.
 * Subclasses implement registerRoutes() and may define a `static queries`
 * map loaded from the sql/pg folder, following the db/auth module standard.
 */

import express from 'express';
import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { IdentityGateway } from '../identity/identityGateway.mjs';

export class BaseRouter {
  static queries = null;

  constructor(database = flashCardsDb) {
    this.database = database;
    this.router = express.Router();
    this.requireAuth = this.requireAuth.bind(this);
    this.requireAdmin = this.requireAdmin.bind(this);
    this.registerRoutes();
  }

  /**
   * Subclasses register their endpoints on this.router here.
   */
  registerRoutes() {
    throw new Error(`${this.constructor.name} must implement registerRoutes()`);
  }

  /**
   * Middleware: require an authenticated session.
   */
  requireAuth(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
    }
    next();
  }

  /**
   * The identity gateway the server runs with (in-process or the IAM service).
   * @returns {import('../identity/identityGateway.mjs').IdentityGateway}
   */
  static identity(req) {
    return req.app.locals.identity;
  }

  /**
   * Middleware: require the session user to be an administrator.
   */
  async requireAdmin(req, res, next) {
    let adminStatus;
    try {
      adminStatus = await BaseRouter.identity(req).isAdmin(req);
    } catch (error) {
      return IdentityGateway.respond(res, error, 'Admin check failed');
    }
    if (!adminStatus) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin privileges required.',
      });
    }
    return next();
  }
}

export default BaseRouter;
