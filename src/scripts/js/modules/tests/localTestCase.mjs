/**
 * Base class for FlashCards tests on the local scratch database (local-db.sh,
 * database flashcards_local). platform-db's LocalDatabaseTest provides the
 * local-only guard, checks, summary, and pool cleanup; this class adds the
 * reset of both domains (iam from iam-service, then flashcards).
 */

import { LocalDatabaseTest } from 'platform-db';
import { identityManagementDb } from 'iam-service/db';
import { flashCardsDb } from '../db/flashCardsDatabase.mjs';

export class LocalTestCase extends LocalDatabaseTest {
  static testQueries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/test-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

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
    await this.identityDatabase.initializeSchema();
    await this.database.initializeSchema();
  }
}

export default LocalTestCase;
