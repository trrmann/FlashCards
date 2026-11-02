/**
 * App-specific PostgreSQL adapter for the FlashCards application.
 * Owns the application tables (flashcards, lessons, practice, quizzes,
 * backups, and user_rights special assignments). Identity tables are owned
 * by IdentityManagementDatabase, whose schema must be bootstrapped first.
 */

import { PostgresDatabase } from './postgresDatabase.mjs';

export class FlashCardsDatabase extends PostgresDatabase {
  static sqlRoot = PostgresDatabase.sqlRoot;

  constructor(config = {}) {
    super(config);
  }

  async initializeSchema() {
    // The app schema's foreign keys reference the IAM-owned users table;
    // fail fast with a clear message instead of erroring statement by statement.
    const usersExists = await this.tableExists('users');
    if (!usersExists) {
      throw new Error(
        'IAM schema must be bootstrapped before the FlashCards schema: required table "users" is missing. Run IdentityManagementDatabase.initializeSchema() first.'
      );
    }

    return this.initializeSchemaFromFile(
      'pg/flashcards-postgres-schema.sql',
      'FlashCards Database Initialization'
    );
  }
}

export const flashCardsDb = new FlashCardsDatabase();
export default flashCardsDb;
