/**
 * Base class for FlashCards tests on the local scratch database (local-db.sh,
 * database flashcards_local). platform-db's LocalDatabaseTest provides the
 * local-only guard, checks, summary, and pool cleanup; this class adds the
 * reset of both domains (iam from iam-service, then flashcards) and the IAM service the
 * tests reach identity through, over HTTP (iam-service MIGRATION.md L3: no in-process IAM).
 */

import crypto from 'node:crypto';
import { LocalDatabaseTest } from 'platform-db';
import { identityManagementDb, IamTables } from 'iam-service/db';
import { IamServer, ApplicationCredentials } from 'iam-service/server';
import { IamClient } from 'iam-service/client';
import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { RemoteIdentityGateway } from '../identity/remoteIdentityGateway.mjs';

export class LocalTestCase extends LocalDatabaseTest {
  static testQueries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/test-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  /** The password registerUser and iamToken use unless a test sets its own (a test fixture, not a secret). */
  static PASSWORD = 'LocalTest#2026x';

  /** The rights of an application's `backup` account (as iam-service's `iam-service-account backup` grants). */
  static BACKUP_RIGHTS = [
    'backup.export',
    'backup.import',
    'identity.backup.export',
    'identity.backup.import',
  ];

  constructor({ database = flashCardsDb, identityDatabase = identityManagementDb } = {}) {
    super([database, identityDatabase]);
    this.database = database;
    this.identityDatabase = identityDatabase;
  }

  /**
   * Drop every schema and bootstrap both domains, as on a brand-new database.
   */
  async resetDatabase() {
    const queries = LocalTestCase.testQueries;
    await this.database.query(queries.drop_iam_schema);
    await this.database.query(queries.drop_flashcards_schema);
    await this.database.query(queries.drop_public_schema);
    await this.database.query(queries.create_public_schema);
    await this.database.query(queries.grant_public_schema_usage);
    const iamTables = IamTables.for(this.identityDatabase);
    iamTables.reset();
    await iamTables.provision();
    await this.database.initializeSchema();
  }

  /**
   * Start the IAM service on this test's IAM_PORT (same scratch database) and FlashCards' gateway to it:
   * `this.identity` (RemoteIdentityGateway) and `this.iam` (an IamClient with FlashCards' credentials, for
   * seeding and checks through the API).
   * @returns {Promise<RemoteIdentityGateway>}
   */
  async startIam() {
    const secret = crypto.randomBytes(32).toString('hex');
    this.iamSecret = secret;
    if (!this.constructor.IAM_PORT) {
      throw new Error(`${this.constructor.name} needs a static IAM_PORT to start the IAM service`);
    }
    this.iamBaseUrl = `http://127.0.0.1:${this.constructor.IAM_PORT}`;
    this.iamServer = new IamServer({
      port: this.constructor.IAM_PORT,
      routerOptions: {
        credentials: new ApplicationCredentials({
          [ApplicationCredentials.envName('flashcards')]: secret,
        }),
      },
    });
    await this.iamServer.start();
    this.identity = new RemoteIdentityGateway({ baseUrl: this.iamBaseUrl, clientSecret: secret });
    this.iam = new IamClient({
      baseUrl: this.iamBaseUrl,
      appKey: 'flashcards',
      clientSecret: secret,
      maxWaitMs: 5000,
    });
    await Promise.all([this.identity.start(), this.iam.start()]);
    return this.identity;
  }

  async stopIam() {
    await Promise.all([this.identity?.stop(), this.iam?.stop()]);
    await this.iamServer?.stop();
  }

  /**
   * Register an account through the IAM API (the first account on a fresh database is the platform admin).
   * @returns {Promise<object>} the IAM user (`user_id`, `username`, …)
   */
  async registerUser(username, password = this.constructor.PASSWORD) {
    return (
      await this.iam.register({
        username,
        email: `${username}@example.test`,
        password,
        full_name: username,
      })
    ).user;
  }

  /**
   * A user's IAM access token, signed in through the API (no MFA on the account).
   * @returns {Promise<string>}
   */
  async iamToken(username, password = this.constructor.PASSWORD) {
    return (await this.iam.login(username, password)).tokens.access_token;
  }

  /** Another gateway to the running IAM service (startIam), for a Server that stops its own on Server.stop(). */
  gateway() {
    return new RemoteIdentityGateway({ baseUrl: this.iamBaseUrl, clientSecret: this.iamSecret });
  }

  /**
   * Create a service account holding `rights` through the IAM API, as a domain admin (`adminToken`).
   * @returns {Promise<string>} its service_id
   */
  async serviceAccount(adminToken, appKey, name, rights) {
    const { service_account: account } = await this.iam.createServiceAccount(adminToken, {
      app_key: appKey,
      name,
      description: `${appKey} ${name} (test)`,
    });
    for (const right of rights) {
      await this.iam.grantServiceRight(adminToken, account.service_id, right);
    }
    return account.service_id;
  }

  /**
   * Issue an app token for a service account through the IAM API (`{ days, scopes }` as the API takes them).
   * @returns {Promise<string>} the token
   */
  async appToken(adminToken, serviceId, options = {}) {
    return (await this.iam.issueAppToken(adminToken, serviceId, options)).app_token.token;
  }
}

export default LocalTestCase;
