/**
 * App-specific PostgreSQL adapter for the FlashCards application.
 */

import { PostgresDatabase } from './postGres.mjs';

export class FlashCardsDatabase extends PostgresDatabase {
  static sqlRoot = PostgresDatabase.sqlRoot;

  constructor(config = {}) {
    super(config);
  }

  async initializeSchema() {
    const allSQL = this.constructor.loadSqlStatements(
      'pg/flashcards-postgres-schema.sql',
      this.constructor.sqlRoot
    );
    const sqlNames = [
      'Extensions',
      'Users Table',
      'Flashcards Table',
      'Leitner Boxes Table',
      'Quizzes Table',
      'Quiz Questions Table',
      'Quiz Results Table',
      'Import/Export Logs Table',
    ];

    const client = await this.pool.connect();

    try {
      console.log('╔════════════════════════════════════════════════╗');
      console.log('║ FlashCards Database Initialization             ║');
      console.log('╚════════════════════════════════════════════════╝\n');
      console.log('[INFO] Connecting to database...');
      console.log(`Host: ${this.config.host}`);
      console.log(`Database: ${this.config.database}`);
      console.log(`User: ${this.config.user}\n`);

      for (let i = 0; i < allSQL.length; i += 1) {
        try {
          process.stdout.write(`[${i + 1}/${allSQL.length}] ${sqlNames[i]}... `);
          await client.query(allSQL[i]);
          console.log('✅');
        } catch (error) {
          console.log('⚠️');
          console.error(`  Error: ${error.message}`);
        }
      }

      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      console.log(`Created ${result.rows.length} tables:`);
      result.rows.forEach((row) => {
        console.log(`  ✅ ${row.table_name}`);
      });

      console.log('\n✅ Database ready for use!');
      return result.rows;
    } finally {
      client.release();
    }
  }

  async testQuery() {
    console.warn(
      'FlashCardsDatabase.testQuery() is a development helper and should not be used in production code.'
    );
    return [];
  }
}

export const flashCardsDb = new FlashCardsDatabase();
export const flashCardDB = flashCardsDb;
export default flashCardsDb;
