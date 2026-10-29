/**
 * Backup and Export Service
 * Handles full application data export and import
 * Includes schema, users, entries, quizzes, and practice history
 */

import { query, getClient } from '../db/connection.mjs';

/**
 * Export complete application data
 * Includes schema metadata and all user data
 * @returns {Promise<object>} Complete backup object
 */
export async function exportApplicationData() {
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
      const structureResult = await query(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `,
        [table]
      );

      backup.schema[table] = {
        columns: structureResult.rows,
        exists: true,
      };

      // Get table data
      const dataResult = await query(`SELECT * FROM ${table}`);
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
 * Rebuild database schema from backup
 * Creates all tables if they don't exist
 * @returns {Promise<object>} Migration results
 */
export async function rebuildSchema() {
  const results = {
    created: [],
    skipped: [],
    failed: [],
  };

  const schemaDefinitions = {
    users: `
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        is_admin BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_page_visited VARCHAR(255) DEFAULT '/' NOT NULL,
        last_visited_at TIMESTAMP DEFAULT NOW()
      )
    `,
    flashcards: `
      CREATE TABLE IF NOT EXISTS flashcards (
        flashcard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_by UUID REFERENCES users(user_id) ON DELETE CASCADE,
        is_private BOOLEAN NOT NULL DEFAULT true,
        lesson VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `,
    flashcard_shares: `
      CREATE TABLE IF NOT EXISTS flashcard_shares (
        share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        recipient_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMP,
        rejected_at TIMESTAMP,
        revoked_at TIMESTAMP,
        UNIQUE(owner_id, recipient_id, flashcard_id)
      )
    `,
    leitner_boxes: `
      CREATE TABLE IF NOT EXISTS leitner_boxes (
        box_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
        box_number INTEGER NOT NULL DEFAULT 1,
        review_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, flashcard_id)
      )
    `,
    quizzes: `
      CREATE TABLE IF NOT EXISTS quizzes (
        quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `,
    quiz_questions: `
      CREATE TABLE IF NOT EXISTS quiz_questions (
        quiz_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
        flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
    quiz_results: `
      CREATE TABLE IF NOT EXISTS quiz_results (
        result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        total_questions INTEGER NOT NULL DEFAULT 0,
        correct_answers INTEGER NOT NULL DEFAULT 0,
        score_percentage DECIMAL(5, 2) DEFAULT 0,
        completed_at TIMESTAMP DEFAULT NOW()
      )
    `,
    import_export_logs: `
      CREATE TABLE IF NOT EXISTS import_export_logs (
        log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
        action VARCHAR(20) NOT NULL,
        record_count INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
  };

  for (const [tableName, createStatement] of Object.entries(schemaDefinitions)) {
    try {
      await query(createStatement);
      results.created.push(tableName);
    } catch (error) {
      if (error.message.includes('already exists')) {
        results.skipped.push(tableName);
      } else {
        results.failed.push({
          table: tableName,
          error: error.message,
        });
      }
    }
  }

  return results;
}

/**
 * Import application data from backup
 * WARNING: This will clear existing data and replace it
 * @param {object} backup - Backup object from exportApplicationData
 * @param {boolean} rebuildFirst - Whether to rebuild schema first
 * @returns {Promise<object>} Import results
 */
export async function importApplicationData(backup, rebuildFirst = false) {
  const client = await getClient();
  const results = {
    schemaRebuilt: false,
    imported: {},
    failed: {},
    warnings: [],
  };

  try {
    await client.query('BEGIN');

    // Rebuild schema if requested
    if (rebuildFirst) {
      const schemaResults = await rebuildSchema();
      results.schemaRebuilt = true;
      results.schemaResults = schemaResults;
    }

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
        await client.query(`DELETE FROM ${table}`);
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

        // Build dynamic insert statement
        const row = tableData[0];
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const insertStatement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

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
export async function logImportExport(
  userId,
  action,
  recordCount,
  status = 'success',
  errorMessage = null
) {
  await query(
    `INSERT INTO import_export_logs (user_id, action, record_count, status, error_message)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, recordCount, status, errorMessage]
  );
}

/**
 * Get import/export history
 * @param {string} userId - User ID (null for all)
 * @param {number} limit - Max records to return
 * @returns {Promise<array>} History records
 */
export async function getImportExportHistory(userId = null, limit = 100) {
  let queryStr = 'SELECT * FROM import_export_logs';
  const params = [];

  if (userId) {
    queryStr += ' WHERE user_id = $1';
    params.push(userId);
  }

  queryStr += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);

  const result = await query(queryStr, params);
  return result.rows;
}
