/**
 * Backup and Export Service
 * Handles full application data export and import
 * Includes schema, users, entries, quizzes, and practice history
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';

class BackupService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/backup-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  /**
   * Export complete application data
   * Includes schema metadata and all user data
   * @returns {Promise<object>} Complete backup object
   */
  async exportApplicationData() {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      schema: {},
      data: {},
    };

    // Get all table schemas
    const tables = [
      'users',
      'flashcards',
      'flashcard_shares',
      'leitner_boxes',
      'quizzes',
      'quiz_questions',
      'quiz_results',
      'import_export_logs',
    ];

    for (const table of tables) {
      try {
        // Get table structure
        const structureResult = await this.database.query(
          this.database.constructor.introspectionQueries.select_table_columns,
          [table]
        );

        backup.schema[table] = {
          columns: structureResult.rows,
          exists: true,
        };

        // Get table data
        const dataResult = await this.database.query(
          this.constructor.queries.select_all_rows_template.replace('{{table}}', table)
        );
        backup.data[table] = dataResult.rows;
      } catch (error) {
        console.warn(`Warning: Could not export table ${table}:`, error.message);
        backup.schema[table] = {
          exists: false,
          error: error.message,
        };
        backup.data[table] = [];
      }
    }

    // Add metadata
    backup.metadata = {
      totalUsers: backup.data.users ? backup.data.users.length : 0,
      totalFlashcards: backup.data.flashcards ? backup.data.flashcards.length : 0,
      totalQuizzes: backup.data.quizzes ? backup.data.quizzes.length : 0,
      totalQuizResults: backup.data.quiz_results ? backup.data.quiz_results.length : 0,
    };

    return backup;
  }

  /**
   * Import application data from backup.
   * The schema is bootstrapped via the database object's SQL-file initialization
   * and is intentionally not rebuilt here.
   * WARNING: This will clear existing data and replace it.
   * @param {object} backup - Backup object from exportApplicationData
   * @returns {Promise<object>} Import results
   */
  async importApplicationData(backup) {
    const client = await this.database.getClient();
    const results = {
      imported: {},
      failed: {},
      warnings: [],
    };

    try {
      await client.query('BEGIN');

      // Clear existing data (in reverse dependency order)
      const clearOrder = [
        'quiz_results',
        'quiz_questions',
        'import_export_logs',
        'quizzes',
        'flashcard_shares',
        'leitner_boxes',
        'flashcards',
        'users',
      ];

      for (const table of clearOrder) {
        try {
          await client.query(
            this.constructor.queries.delete_all_rows_template.replace('{{table}}', table)
          );
        } catch (error) {
          results.warnings.push(`Could not clear ${table}: ${error.message}`);
        }
      }

      // Import data tables (in dependency order)
      const importOrder = [
        'users',
        'flashcards',
        'leitner_boxes',
        'quizzes',
        'quiz_questions',
        'flashcard_shares',
        'quiz_results',
        'import_export_logs',
      ];

      for (const table of importOrder) {
        try {
          const tableData = backup.data[table] || [];

          if (tableData.length === 0) {
            results.imported[table] = 0;
            continue;
          }

          // Build insert statement from the backup row shape
          const row = tableData[0];
          const columns = Object.keys(row);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const insertStatement = this.constructor.queries.insert_row_template
            .replace('{{table}}', table)
            .replace('{{columns}}', columns.join(', '))
            .replace('{{placeholders}}', placeholders);

          let imported = 0;
          for (const dataRow of tableData) {
            const values = columns.map((col) => dataRow[col]);
            try {
              await client.query(insertStatement, values);
              imported += 1;
            } catch (error) {
              results.warnings.push(`Failed to import row in ${table}: ${error.message}`);
            }
          }

          results.imported[table] = imported;
        } catch (error) {
          results.failed[table] = error.message;
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return results;
  }

  /**
   * Log an import/export action
   * @param {string} userId - User ID performing the action
   * @param {string} action - 'export' or 'import'
   * @param {number} recordCount - Number of records processed
   * @param {string} status - 'success' or 'failed'
   * @param {string} errorMessage - Error message if failed
   */
  async logImportExport(userId, action, recordCount, status = 'success', errorMessage = null) {
    const normalizedStatus = status === 'success' ? 'completed' : status;
    await this.database.query(this.constructor.queries.insert_import_export_log, [
      userId,
      action.toUpperCase(),
      recordCount,
      normalizedStatus,
      errorMessage,
    ]);
  }

  /**
   * Get import/export history
   * @param {string} userId - User ID (null for all)
   * @param {number} limit - Max records to return
   * @returns {Promise<array>} History records
   */
  async getImportExportHistory(userId = null, limit = 100) {
    const result = userId
      ? await this.database.query(this.constructor.queries.select_import_export_history_for_user, [
          userId,
          limit,
        ])
      : await this.database.query(this.constructor.queries.select_import_export_history, [limit]);

    return result.rows;
  }
}

export const backupService = new BackupService();

export { BackupService };
export default backupService;
