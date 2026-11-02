/**
 * Base Router Class
 * Common OOP foundation for all route modules: owns the express router,
 * the database handle, and shared authentication/authorization middleware.
 * Subclasses implement registerRoutes() and may define a `static queries`
 * map loaded from the sql/pg folder, following the db/auth module standard.
 */

import express from 'express';
import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';

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
   * Middleware: require the session user to be an administrator.
   */
  async requireAdmin(req, res, next) {
    const adminStatus = await userAuthService.isAdmin(req.session.userId);
    if (!adminStatus) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin privileges required.',
      });
    }
    next();
  }
}

export default BaseRouter;
