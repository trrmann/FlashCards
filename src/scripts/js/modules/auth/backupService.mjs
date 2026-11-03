/**
 * Backup and Export Service
 * Exports the entire application dataset (identity + application data) as
 * JSON and imports it with upsert semantics: existing records are updated
 * to the imported values, new records are inserted, and nothing is deleted.
 * Identity tables are read/written through the IAM database and application
 * tables through the app database, respecting the ownership split.
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { mediaArchiveService } from './mediaArchiveService.mjs';

class BackupService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/backup-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  /**
   * Identity tables (IAM database ownership), in FK-safe import order.
   * The transient session store is intentionally excluded.
   */
  static iamTables = ['users', 'roles', 'rights', 'role_rights', 'user_roles'];

  /**
   * Application tables (app database ownership), in FK-safe import order.
   */
  static appTables = [
    'user_rights',
    'lessons',
    'media',
    'flashcards',
    'flashcard_options',
    'flashcard_shares',
    'public_card_removals',
    'leitner_boxes',
    'flashcard_leitner_progress',
    'practice_history',
    'session_card_attempts',
    'difficulty_history',
    'quizzes',
    'quiz_questions',
    'quiz_results',
    'import_export_logs',
  ];

  /**
   * Tables whose primary keys are install-specific generated UUIDs but whose
   * identity is a natural key: on import they are matched by the natural key
   * and their ids are remapped in referencing tables.
   */
  static naturalKeyTables = {
    roles: { naturalKey: 'role_name', id: 'role_id' },
    rights: { naturalKey: 'right_key', id: 'right_id' },
  };

  /**
   * Columns (in any backed-up table) that hold a users.user_id reference.
   * Rewritten on import when a backup user is merged into an existing account.
   */
  static userReferenceColumns = ['user_id', 'created_by', 'owner_id', 'recipient_id'];

  /**
   * Serial-PK tables whose sequences must be realigned after an import.
   */
  static serialPkTables = {
    flashcard_leitner_progress: 'id',
    practice_history: 'id',
    session_card_attempts: 'id',
    difficulty_history: 'id',
  };

  constructor(database = flashCardsDb, identityDatabase = identityManagementDb) {
    this.database = database;
    this.identityDatabase = identityDatabase;
  }

  /**
   * Resolve the owning database adapter for a table.
   */
  databaseFor(table) {
    return this.constructor.iamTables.includes(table) ? this.identityDatabase : this.database;
  }

  /**
   * Export the complete dataset (identity + application data).
   * @returns {Promise<object>} Complete backup object
   */
  async exportApplicationData() {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      schema: {},
      data: {},
    };

    const tables = [...this.constructor.iamTables, ...this.constructor.appTables];

    for (const table of tables) {
      const db = this.databaseFor(table);
      try {
        const structureResult = await db.query(
          db.constructor.introspectionQueries.select_table_columns,
          [table]
        );

        backup.schema[table] = {
          columns: structureResult.rows,
          exists: true,
        };

        const dataResult = await db.query(
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

    // Two-file model: the JSON holds media rows without their binary data;
    // the data lives in the linked media ZIP (exportMediaArchive), matched
    // back on import by media id.
    const mediaRows = backup.data.media || [];
    backup.mediaManifest = mediaArchiveService.buildManifest(mediaRows);
    backup.data.media = mediaRows.map(({ data: _data, ...rest }) => rest);

    backup.metadata = {
      totalTables: tables.length,
      totalUsers: backup.data.users ? backup.data.users.length : 0,
      totalFlashcards: backup.data.flashcards ? backup.data.flashcards.length : 0,
      totalQuizzes: backup.data.quizzes ? backup.data.quizzes.length : 0,
      totalQuizResults: backup.data.quiz_results ? backup.data.quiz_results.length : 0,
      totalMedia: mediaRows.length,
    };

    return backup;
  }

  /**
   * Export the media half of the two-file backup: a ZIP of every media row,
   * each stored as media/<media_id>.<ext>, linked to the JSON by media id.
   */
  async exportMediaArchive() {
    const dataResult = await this.database.query(
      this.constructor.queries.select_all_rows_template.replace('{{table}}', 'media')
    );
    return mediaArchiveService.buildArchive(dataResult.rows);
  }

  /**
   * Fetch the primary key column names for a table.
   * @param {{query: Function}} executor - A database adapter or a transaction client
   */
  async getPrimaryKeyColumns(executor, table) {
    const result = await executor.query(
      this.database.constructor.introspectionQueries.get_primary_key_columns,
      [table]
    );
    return result.rows.map((row) => row.column_name);
  }

  /**
   * Case-insensitive identity key for matching usernames and emails.
   */
  static identityKey(value) {
    return String(value ?? '').toLowerCase();
  }

  /**
   * Map exported user ids to the ids of existing accounts with the same
   * username (case-insensitive), falling back to email. A backup restored into
   * an install whose accounts were re-created (e.g. a new database where the
   * admin ran initial setup) would otherwise fail on the users unique
   * constraints and orphan every row that references those users.
   * @returns {Promise<Map<string, string>>} exported user_id -> existing user_id
   */
  async buildUserIdMap(backupUsers, results) {
    const map = new Map();
    if (backupUsers.length === 0) return map;

    let existingRows;
    try {
      const existing = await this.identityDatabase.query(
        this.constructor.queries.select_all_rows_template.replace('{{table}}', 'users')
      );
      existingRows = existing.rows;
    } catch {
      return map; // users table absent; nothing to merge into
    }

    const key = this.constructor.identityKey;
    const byUsername = new Map(existingRows.map((user) => [key(user.username), user]));
    const byEmail = new Map(existingRows.map((user) => [key(user.email), user]));

    for (const user of backupUsers) {
      const usernameMatch = byUsername.get(key(user.username));
      const emailMatch = byEmail.get(key(user.email));

      if (usernameMatch && emailMatch && usernameMatch.user_id !== emailMatch.user_id) {
        results.warnings.push(
          `User ${user.username}: username and email belong to different existing accounts; not merged`
        );
        continue;
      }

      const match = usernameMatch || emailMatch;
      if (match && match.user_id !== user.user_id) {
        map.set(user.user_id, match.user_id);
        results.warnings.push(
          `Merged backup user ${user.username} into existing account ${match.username}`
        );
      }
    }

    return map;
  }

  /**
   * Rewrite user references in every backed-up table using the merge map.
   */
  remapUserReferences(data, userIdMap) {
    for (const rows of Object.values(data)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        for (const column of this.constructor.userReferenceColumns) {
          if (row[column] && userIdMap.has(row[column])) {
            row[column] = userIdMap.get(row[column]);
          }
        }
      }
    }
  }

  /**
   * Upsert one row. Existing records are updated to the imported values (import wins).
   * Only identifiers and $n placeholders are filled into the SQL templates (CODING_STANDARDS 0.1).
   * @param {{query: Function}} executor - A database adapter or a transaction client
   */
  async upsertRow(executor, table, row, conflictColumns) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updatable = columns.filter((c) => !conflictColumns.includes(c));
    const template =
      updatable.length > 0
        ? this.constructor.queries.upsert_rows_template
        : this.constructor.queries.upsert_rows_ignore_template;

    const statement = template
      .replace('{{table}}', table)
      .replace('{{columns}}', columns.join(', '))
      .replace('{{placeholders}}', placeholders)
      .replace('{{conflict_columns}}', conflictColumns.join(', '))
      .replaceAll('{{update_columns}}', updatable.join(', '));

    await executor.query(
      statement,
      columns.map((c) => row[c])
    );
  }

  /**
   * Clear a media reference that will not resolve after import, with a warning.
   * The media reference columns are nullable by design.
   */
  scrubMediaReference(row, column, availableMedia, results) {
    if (row[column] && !availableMedia.has(row[column])) {
      results.warnings.push(`Cleared ${column} ${row[column]}: media not available`);
      row[column] = null;
    }
  }

  /**
   * Import a backup with upsert semantics. Existing rows (matched by key)
   * are updated to the imported values; new rows are inserted; rows absent
   * from the backup are left untouched.
   *
   * All-or-nothing: every write runs in one transaction. If any row fails, the
   * whole import is rolled back and an error naming the table is thrown, so a
   * restore never leaves the database half-imported.
   *
   * roles/rights are matched by natural key (role_name/right_key) and their
   * install-specific UUIDs are remapped in user_roles/role_rights so a
   * backup can be restored into a freshly bootstrapped install.
   *
   * @param {object} backup - Backup object from exportApplicationData
   * @returns {Promise<object>} Import results
   */
  async importApplicationData(backup, mediaArchive = null) {
    const results = {
      imported: {},
      failed: {},
      warnings: [],
    };

    // Two-file model: media binary data arrives in the linked ZIP and is
    // matched back onto the JSON's media rows by media id. Legacy single-file
    // backups that still carry inline data import unchanged.
    let archiveMedia = new Map();
    if (mediaArchive) {
      archiveMedia = mediaArchiveService.parseArchive(mediaArchive);
    }
    if (Array.isArray(backup.data.media)) {
      const resolved = [];
      for (const row of backup.data.media) {
        if (row.data) {
          resolved.push(row);
          continue;
        }
        const item = archiveMedia.get(row.media_id);
        if (item) {
          resolved.push({ ...row, data: item.dataUrl });
        } else {
          results.warnings.push(
            `Skipped media ${row.media_id}: no data in backup and no matching archive item`
          );
        }
      }
      backup.data.media = resolved;
    }

    // Scrub media references that will not resolve after import (media absent
    // from both the backup and this install) so card/option upserts do not
    // fail on foreign keys; the reference columns are nullable by design.
    const availableMedia = new Set((backup.data.media || []).map((row) => row.media_id));
    try {
      const existing = await this.database.query(
        this.constructor.queries.select_all_rows_template.replace('{{table}}', 'media')
      );
      for (const row of existing.rows) availableMedia.add(row.media_id);
    } catch {
      // media table absent on this install; scrub all references
    }
    for (const row of backup.data.flashcards || []) {
      this.scrubMediaReference(row, 'question_media_id', availableMedia, results);
      this.scrubMediaReference(row, 'answer_media_id', availableMedia, results);
    }
    for (const row of backup.data.flashcard_options || []) {
      this.scrubMediaReference(row, 'option_media_id', availableMedia, results);
    }

    // Users are identified by username/email, not by their install-specific
    // UUID: merge backup users into existing accounts and rewrite every user
    // reference so dependent rows do not violate users foreign keys.
    const userIdMap = await this.buildUserIdMap(backup.data.users || [], results);
    if (userIdMap.size > 0) {
      this.remapUserReferences(backup.data, userIdMap);
    }

    // Every write below runs in one transaction on one connection (IAM and app
    // tables currently share the database), so a failure rolls everything back.
    await this.database.withTransaction((client) => this.importTables(client, backup, results));

    return results;
  }

  /**
   * Upsert every table in FK-safe order on the given transaction client, then
   * realign serial sequences. Throws on the first failing row (the caller rolls back).
   */
  async importTables(client, backup, results) {
    const idMaps = {}; // table -> Map(exported id -> current id)
    const importOrder = [...this.constructor.iamTables, ...this.constructor.appTables];

    for (const table of importOrder) {
      const rows = backup.data[table] || [];
      if (rows.length === 0) {
        results.imported[table] = 0;
        continue;
      }

      const natural = this.constructor.naturalKeyTables[table];
      const conflictColumns = natural
        ? [natural.naturalKey]
        : await this.getPrimaryKeyColumns(client, table);
      if (conflictColumns.length === 0) {
        throw new Error(`Import aborted: no primary key found for ${table}`);
      }

      let imported = 0;
      for (const dataRow of rows) {
        const row = this.prepareRow(dataRow, table, natural, idMaps, results);
        if (!row) continue;
        try {
          await this.upsertRow(client, table, row, conflictColumns);
        } catch (error) {
          throw new Error(`Import aborted at table ${table}: ${error.message}`, { cause: error });
        }
        imported += 1;
      }
      results.imported[table] = imported;

      if (natural) {
        idMaps[table] = await this.naturalKeyIdMap(client, table, natural, rows);
      }
    }

    // Realign serial sequences so future inserts do not collide.
    for (const [table, column] of Object.entries(this.constructor.serialPkTables)) {
      await client.query(
        this.constructor.queries.reset_serial_sequence_template
          .replace(/\{\{table\}\}/g, table)
          .replace(/\{\{column\}\}/g, column)
      );
    }
  }

  /**
   * Copy a backup row for import: drop the install-specific id of natural-key
   * tables and remap references to them. Returns null to skip an unresolvable row.
   */
  prepareRow(dataRow, table, natural, idMaps, results) {
    const row = { ...dataRow };
    if (natural) delete row[natural.id];

    for (const [refTable, ref] of Object.entries(this.constructor.naturalKeyTables)) {
      const map = idMaps[refTable];
      if (map && row[ref.id] !== undefined) {
        const mapped = map.get(row[ref.id]);
        if (!mapped) {
          results.warnings.push(`Skipped ${table} row: unknown ${refTable} id ${row[ref.id]}`);
          return null;
        }
        row[ref.id] = mapped;
      }
    }
    return row;
  }

  /**
   * After importing a natural-key table, map exported ids to this install's ids.
   */
  async naturalKeyIdMap(client, table, natural, rows) {
    const current = await client.query(
      this.constructor.queries.select_all_rows_template.replace('{{table}}', table)
    );
    const byNatural = new Map(current.rows.map((r) => [r[natural.naturalKey], r[natural.id]]));
    return new Map(
      rows
        .filter((r) => byNatural.has(r[natural.naturalKey]))
        .map((r) => [r[natural.id], byNatural.get(r[natural.naturalKey])])
    );
  }

  /**
   * Log an import/export action
   */
  async logImportExport(userId, action, recordCount, status = 'success', errorMessage = null) {
    // Map to the schema's CHECK-constrained values:
    // action must be 'IMPORT' or 'EXPORT'; status must be 'pending', 'completed', or 'failed'.
    const dbAction = action.toUpperCase();
    const dbStatus = status === 'success' ? 'completed' : status;

    await this.database.query(this.constructor.queries.insert_import_export_log, [
      userId,
      dbAction,
      recordCount,
      dbStatus,
      errorMessage,
    ]);
  }

  /**
   * Get import/export history
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
