/**
 * IAM service process (IAM phase 3).
 * A separate HTTP service that owns the `iam` schema: it bootstraps that schema,
 * serves the versioned API under /v1, and is used by client applications
 * (FlashCards, later WurmTools) with application credentials and user tokens.
 */

import express from 'express';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { IamV1Router } from './iamV1Router.mjs';

export class IamServer {
  static DEFAULT_PORT = 5100;

  /**
   * Port: an explicit option, else IAM_PORT, else PORT (Render), else 5100.
   */
  static resolvePort(env = process.env) {
    return Number(env.IAM_PORT || env.PORT || IamServer.DEFAULT_PORT);
  }

  constructor({ port, database = identityManagementDb, routerOptions = {} } = {}) {
    this.port = port ?? this.constructor.resolvePort();
    this.database = database;
    this.app = express();
    this.app.disable('x-powered-by');
    this.app.set('trust proxy', 1);
    this.app.use('/v1', new IamV1Router({ database, ...routerOptions }).router);
    this.app.use((req, res) => res.status(404).json({ status: 'error', message: 'Not found' }));
    this.httpServer = null;
  }

  /**
   * Connect and bootstrap the IAM schema (idempotent).
   */
  async initializeDatabase() {
    if (!(await this.database.initializeDatabaseConnection())) {
      throw new Error('IAM database connection failed');
    }
    await this.database.initializeSchema();
  }

  /**
   * Bootstrap the database, then listen. Resolves with the HTTP server.
   */
  async start() {
    await this.initializeDatabase();
    await new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, resolve);
    });
    console.log(`IAM service listening on port ${this.port}`);
    return this.httpServer;
  }

  /**
   * Stop listening (the database pool is left to its owner).
   */
  async stop() {
    if (!this.httpServer) return;
    await new Promise((resolve, reject) =>
      this.httpServer.close((error) => (error ? reject(error) : resolve()))
    );
    this.httpServer = null;
  }
}

export const iamServer = new IamServer();
export default iamServer;
