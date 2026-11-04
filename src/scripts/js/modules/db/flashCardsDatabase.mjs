/**
 * App-specific PostgreSQL adapter for the FlashCards application.
 * Owns the application tables (flashcards, lessons, practice, quizzes,
 * backups, and user_rights special assignments). Identity tables are owned
 * by IdentityManagementDatabase (iam-service), whose schema must be bootstrapped first.
 * Built on platform-db; SQL comes from this project's src/scripts/sql folder.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresDatabase } from 'platform-db';

export class FlashCardsDatabase extends PostgresDatabase {
  static sqlRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../sql');
  static SCHEMA = 'flashcards';

  async initializeSchema() {
    // The app schema's foreign keys reference the IAM-owned users table;
    // fail fast with a clear message instead of erroring statement by statement.
    const usersExists = await this.tableExists('iam.users');
    if (!usersExists) {
      throw new Error(
        'IAM schema must be bootstrapped before the FlashCards schema: required table "iam.users" is missing. Run IdentityManagementDatabase.initializeSchema() first.'
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
