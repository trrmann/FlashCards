/**
 * App-specific PostgreSQL adapter for the FlashCards application.
 */

import { PostgresDatabase } from './postgresDatabase.mjs';

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

    const describeStatement = (sql) => {
      const match = sql.match(
        /CREATE\s+(TABLE|INDEX|EXTENSION)(?:\s+IF\s+NOT\s+EXISTS)?\s+("?[\w-]+"?)/i
      );
      if (match) {
        return `${match[1].toUpperCase()} ${match[2]}`;
      }
      return sql.replace(/\s+/g, ' ').slice(0, 40);
    };

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
          process.stdout.write(`[${i + 1}/${allSQL.length}] ${describeStatement(allSQL[i])}... `);
          await client.query(allSQL[i]);
          console.log('✅');
        } catch (error) {
          console.log('⚠️');
          console.error(`  Error: ${error.message}`);
        }
      }

      const result = await client.query(this.constructor.introspectionQueries.list_public_tables);

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
}

export const flashCardsDb = new FlashCardsDatabase();
export default flashCardsDb;
