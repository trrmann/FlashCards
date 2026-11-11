/**
 * Backup and restore (format 4.0, phase 3d): each service backs up its own tables.
 *
 * A backup file bundles two parts plus the media ZIP:
 *   { version: '4.0', exportedAt, identity: <IAM part or null>, flashcards: { schema, data,
 *     mediaManifest }, metadata }
 * - The identity part (every user and password hash) comes from the IAM, through the identity
 *   gateway, and only for a platform admin (owner decision); anyone else's backup has
 *   identity: null.
 * - FlashCards' part is the `flashcards` schema (platform-db TableBackup); media data lives in
 *   the ZIP, matched by media id.
 *
 * Restore runs in two steps, each one transaction: the identity part through the gateway (users
 * merged by username or email; it returns the old → new user id map), then FlashCards' part with
 * its user ids rewritten through that map. If the second step fails, the first stays applied, and
 * running the restore again completes it (owner decision): every import is an upsert that changes
 * nothing the second time. Files of format 3.x and 2.0 (one combined data set) are split into the
 * two parts first.
 */

import { TableBackup } from 'platform-db';
import { IamTables } from 'iam-service/db';
import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { mediaArchiveService } from './mediaArchiveService.mjs';
import { LocalIdentityGateway } from '../identity/localIdentityGateway.mjs';
import { IdentityError } from '../identity/identityGateway.mjs';

class BackupService {
  /** Scheduling class for backup work: it yields to users' requests (platform-db QueryScheduler). */
  static WORK = { priority: 'background' };

  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/backup-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  static FORMAT_VERSION = '4.0';

  /** FlashCards' tables, references first (import order). Transient: `session`. */
  static appTables = [
    'user_settings',
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

  /** The identity tables, as older single-set files hold them (owned by the IAM). */
  static identityTables = IamTables.backupTables();

  /** Columns of FlashCards' tables that hold a user id. */
  static userReferenceColumns = ['user_id', 'created_by', 'owner_id', 'recipient_id', 'updated_by'];

  /** Serial-PK tables whose sequences are realigned after an import. */
  static serialPkTables = {
    flashcard_leitner_progress: 'id',
    practice_history: 'id',
    session_card_attempts: 'id',
    difficulty_history: 'id',
  };

  /** Per-user settings that files before 3.1 carry as columns of users. */
  static LEGACY_USER_SETTINGS = ['last_page_visited', 'storage_max_bytes'];

  /**
   * @param {object} [options]
   * @param {object} [options.database] - FlashCards' adapter
   * @param {object} [options.identity] - The identity gateway (the server sets its own)
   */
  constructor({ database = flashCardsDb, identity = new LocalIdentityGateway() } = {}) {
    this.database = database;
    this.identity = identity;
    this.tables = new TableBackup({
      database,
      schema: database.constructor.SCHEMA,
      tables: BackupService.appTables,
      serialPkTables: BackupService.serialPkTables,
      work: BackupService.WORK,
    });
  }

  // ----- Export -----

  /**
   * A full backup as the acting user sees it: the identity part only for a platform admin.
   * @param {object} actor - The request (its session identifies the admin)
   */
  async exportBackup(actor) {
    const platformAdmin = await this.identity.isPlatformAdmin(actor);
    const identity = platformAdmin ? await this.identity.exportIdentity(actor) : null;
    const { schema, data } = await this.tables.exportTables();

    // Media data goes in the ZIP (exportMediaArchive), matched back by media id.
    const mediaRows = data.media || [];
    const flashcards = {
      schema,
      data: { ...data, media: mediaRows.map(({ data: _data, ...rest }) => rest) },
      mediaManifest: mediaArchiveService.buildManifest(mediaRows),
    };

    return {
      version: this.constructor.FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      identity,
      flashcards,
      metadata: {
        identityIncluded: Boolean(identity),
        ...(identity ? {} : { identityOmitted: 'only platform administrators back up users' }),
        totalUsers: identity?.data?.users?.length ?? 0,
        totalFlashcards: data.flashcards?.length ?? 0,
        totalQuizzes: data.quizzes?.length ?? 0,
        totalQuizResults: data.quiz_results?.length ?? 0,
        totalMedia: mediaRows.length,
      },
    };
  }

  /** The media half of a backup: a ZIP of every media item (media/<media_id>.<ext>). */
  async exportMediaArchive() {
    const rows = await this.tables.selectAll('media', BackupService.WORK);
    return mediaArchiveService.buildArchive(rows);
  }

  // ----- Restore -----

  /**
   * The two parts of any supported file: 4.x as is; 3.x / 2.0 (one combined `data`) split, with
   * per-user settings taken from users' columns when the file has no user_settings.
   * @returns {{identity: object|null, flashcards: {data: object}}}
   */
  static parts(backup) {
    if (!backup || typeof backup !== 'object') throw BackupService.invalid('not a backup');
    if (String(backup.version || '').startsWith('4.')) {
      if (!backup.flashcards?.data) throw BackupService.invalid('the FlashCards part is missing');
      return { identity: backup.identity ?? null, flashcards: { data: backup.flashcards.data } };
    }
    if (!backup.data || typeof backup.data !== 'object')
      throw BackupService.invalid('data is missing');
    const pick = (tables) =>
      Object.fromEntries(tables.filter((t) => backup.data[t]).map((t) => [t, backup.data[t]]));
    const identityData = pick(BackupService.identityTables);
    const appData = pick(BackupService.appTables);
    if (!appData.user_settings) {
      const settings = (backup.data.users || [])
        .map((user) => {
          const fields = BackupService.LEGACY_USER_SETTINGS.filter((field) => field in user);
          return fields.length
            ? { user_id: user.user_id, ...Object.fromEntries(fields.map((f) => [f, user[f]])) }
            : null;
        })
        .filter(Boolean);
      if (settings.length) appData.user_settings = settings;
    }
    return {
      identity: Object.keys(identityData).length ? { data: identityData } : null,
      flashcards: { data: appData },
    };
  }

  static invalid(reason) {
    return new IdentityError(400, `Invalid backup: ${reason}`);
  }

  /** Media rows get their data back from the ZIP; references to media nobody has are cleared. */
  async resolveMedia(data, mediaArchive, warnings) {
    const archive = mediaArchive ? mediaArchiveService.parseArchive(mediaArchive) : new Map();
    if (Array.isArray(data.media)) {
      data.media = data.media.filter((row) => {
        if (row.data) return true;
        const item = archive.get(row.media_id);
        if (item) {
          row.data = item.dataUrl;
          return true;
        }
        warnings.push(
          `Skipped media ${row.media_id}: no data in backup and no matching archive item`
        );
        return false;
      });
    }
    const available = new Set((data.media || []).map((row) => row.media_id));
    const rows = await this.tables.selectAll('media', BackupService.WORK);
    for (const row of rows) available.add(row.media_id);
    const scrub = (row, column) => {
      if (row[column] && !available.has(row[column])) {
        warnings.push(`Cleared ${column} ${row[column]}: media not available`);
        row[column] = null;
      }
    };
    for (const row of data.flashcards || []) {
      scrub(row, 'question_media_id');
      scrub(row, 'answer_media_id');
    }
    for (const row of data.flashcard_options || []) scrub(row, 'option_media_id');
  }

  /**
   * Restore a backup (any supported format) as the acting user. Restoring users needs a platform
   * admin (the gateway refuses others with 403).
   * @returns {Promise<{imported: object, failed: object, warnings: string[], steps: string[]}>}
   */
  async importBackup(actor, backup, mediaArchive = null) {
    const { identity, flashcards } = this.constructor.parts(backup);
    const results = { imported: {}, failed: {}, warnings: [], steps: [] };

    // Step 1: users and everything identity, at the IAM.
    let userIdMap = new Map();
    if (identity) {
      const step = await this.identity.importIdentity(actor, identity, {
        legacyAppKey: 'flashcards',
      });
      Object.assign(results.imported, step.imported);
      results.warnings.push(...step.warnings);
      userIdMap = new Map(Object.entries(step.user_id_map || {}));
      results.steps.push('identity');
    }

    // Step 2: FlashCards' tables, with merged users' ids rewritten.
    const data = structuredClone(flashcards.data);
    await this.resolveMedia(data, mediaArchive, results.warnings);
    TableBackup.remapColumns(data, this.constructor.userReferenceColumns, userIdMap);
    let step;
    try {
      step = await this.database.withTransaction(async (client) => {
        const attempt = { imported: {}, warnings: [] };
        await this.tables.importTables(client, data, attempt);
        return attempt;
      }, BackupService.WORK);
    } catch (error) {
      if (!error.message?.startsWith('Import aborted')) throw error;
      const done = identity
        ? ' Users were restored (step 1); fix the file and run the restore again.'
        : '';
      throw new IdentityError(422, `${error.message}. FlashCards' data was not changed.${done}`);
    }
    Object.assign(results.imported, step.imported);
    results.warnings.push(...step.warnings);
    results.steps.push('flashcards');
    return results;
  }

  // ----- Log -----

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
