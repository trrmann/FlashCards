/**
 * Base class for tests that run against the local scratch database (local-db.sh).
 * Provides the safety guard (refuses any non-local target, because these tests
 * drop and rebuild the schemas), schema reset + bootstrap, check bookkeeping,
 * and pool cleanup. Subclasses implement run().
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';

export class LocalTestCase {
  static LOCAL_HOSTS = ['127.0.0.1', 'localhost'];
  static LOCAL_DATABASE_SUFFIX = '_local';

  static testQueries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/test-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  constructor({ database = flashCardsDb, identityDatabase = identityManagementDb } = {}) {
    this.database = database;
    this.identityDatabase = identityDatabase;
    this.failures = [];
    this.checks = 0;
  }

  /**
   * Refuse to run anywhere except the local scratch database.
   */
  assertLocalTarget() {
    for (const db of [this.database, this.identityDatabase]) {
      const { host, database } = db.config;
      const local =
        LocalTestCase.LOCAL_HOSTS.includes(host) &&
        String(database).endsWith(LocalTestCase.LOCAL_DATABASE_SUFFIX);
      if (!local) {
        throw new Error(
          `Refusing to run: target ${host}/${database} is not the local scratch database. Use: local-db.sh run …`
        );
      }
    }
  }

  check(label, condition, detail = '') {
    this.checks += 1;
    if (condition) {
      console.log(`  ✓ ${label}`);
    } else {
      console.log(`  ✗ ${label}${detail ? `: ${detail}` : ''}`);
      this.failures.push(label);
    }
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
    await this.identityDatabase.initializeSchema();
    await this.database.initializeSchema();
  }

  summary() {
    console.log(`\n${this.checks - this.failures.length}/${this.checks} checks passed`);
    return { success: this.failures.length === 0, failures: this.failures };
  }

  async run() {
    throw new Error(`${this.constructor.name} must implement run()`);
  }

  /**
   * Run the test and always release the database pools. Returns true on success.
   */
  async execute() {
    try {
      const { success } = await this.run();
      return success;
    } finally {
      await this.close();
    }
  }

  async close() {
    await this.database.close();
    await this.identityDatabase.close();
  }
}

export default LocalTestCase;
