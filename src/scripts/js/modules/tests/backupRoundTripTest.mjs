/**
 * Backup round-trip test (CODING_STANDARDS 0.7).
 * Proves that a full backup (data JSON + media ZIP) rebuilds every table after the database
 * is wiped, including the real recovery scenario: the admin account is re-created in the
 * empty database under a new user_id before the import. Runs only against the local scratch
 * database (local-db.sh); it refuses any other target because it drops the public schema.
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';
import { entriesService } from '../auth/entriesService.mjs';
import { practiceService } from '../auth/practiceService.mjs';
import { backupService, BackupService } from '../auth/backupService.mjs';
import { mediaArchiveService } from '../auth/mediaArchiveService.mjs';
import { QuizRouter } from '../routes/quizRouter.mjs';

export class BackupRoundTripTest {
  static LOCAL_HOSTS = ['127.0.0.1', 'localhost'];
  static LOCAL_DATABASE_SUFFIX = '_local';
  static PASSWORD = 'RoundTrip#2026';
  static PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  static AUDIO =
    'data:audio/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnAQAAAAAAAA==';
  static USER_REFERENCE_COLUMNS = BackupService.userReferenceColumns;
  static NATURAL_KEYS = { roles: ['role_id', 'role_name'], rights: ['right_id', 'right_key'] };
  static TRANSIENT_TABLES = ['session'];
  static UNSEEDED_TABLES = ['rights', 'role_rights', 'lessons', 'leitner_boxes'];

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
        this.constructor.LOCAL_HOSTS.includes(host) &&
        String(database).endsWith(this.constructor.LOCAL_DATABASE_SUFFIX);
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
   * Drop everything and bootstrap both schemas, as on a brand-new Render database.
   */
  async resetDatabase() {
    await this.database.query(this.constructor.testQueries.drop_iam_schema);
    await this.database.query(this.constructor.testQueries.drop_flashcards_schema);
    await this.database.query(this.constructor.testQueries.drop_public_schema);
    await this.database.query(this.constructor.testQueries.create_public_schema);
    await this.identityDatabase.initializeSchema();
    await this.database.initializeSchema();
  }

  async createAdmin(username) {
    const admin = await userAuthService.createUser(
      username,
      `${username}@example.test`,
      this.constructor.PASSWORD,
      'Round Trip Admin'
    );
    await userAuthService.setUserAdmin(admin.user_id);
    return admin;
  }

  /**
   * Seed synthetic data that touches every backed-up table that has a writer.
   */
  async seed() {
    const admin = await this.createAdmin('rt_admin');
    const alice = await userAuthService.createUser(
      'rt_alice',
      'rt_alice@example.test',
      this.constructor.PASSWORD,
      'Alice'
    );
    const bob = await userAuthService.createUser(
      'rt_bob',
      'rt_bob@example.test',
      this.constructor.PASSWORD,
      'Bob',
      true
    );

    const textCard = await entriesService.createFlashcard(
      alice.user_id,
      'Capital of France?',
      'Paris',
      'L1',
      'Geo',
      'World'
    );
    const imageCard = await entriesService.createFlashcard(
      alice.user_id,
      'Which pixel?',
      'Red',
      'L1',
      'Geo',
      'World',
      {
        questionBlock: { form: 'image', media: this.constructor.PNG },
      }
    );
    const audioCard = await entriesService.createFlashcard(
      alice.user_id,
      '',
      'Hello',
      'L2',
      'Words',
      'World',
      {
        questionType: 'multiple_choice',
        questionBlock: { form: 'audio', media: this.constructor.AUDIO },
        options: [
          { text: 'Hello', isCorrect: true },
          { text: 'Goodbye', isCorrect: false },
        ],
      }
    );

    await entriesService.setFlashcardsVisibilityBatch(
      alice.user_id,
      [imageCard.flashcard_id],
      false
    );
    await entriesService.removePublicCard(bob.user_id, imageCard.flashcard_id);
    const share = await entriesService.shareFlashcard(
      textCard.flashcard_id,
      alice.user_id,
      bob.user_id
    );
    await entriesService.acceptShare(share.share_id, bob.user_id);

    await practiceService.initializeAllCardsForUser(bob.user_id);
    await practiceService.recordPracticeAttemptWithSession(
      bob.user_id,
      textCard.flashcard_id,
      true,
      null,
      new Date(),
      null
    );
    await practiceService.updateDifficultyScore(textCard.flashcard_id);

    const quiz = await this.database.query(QuizRouter.queries.insert_quiz, [
      bob.user_id,
      'Round trip quiz',
      null,
    ]);
    const quizId = quiz.rows[0].quiz_id;
    await this.database.query(QuizRouter.queries.insert_quiz_question, [
      quizId,
      textCard.flashcard_id,
      1,
    ]);
    await this.database.query(QuizRouter.queries.insert_quiz_result, [
      bob.user_id,
      quizId,
      100,
      1,
      1,
    ]);

    await userAuthService.grantUserRight(alice.user_id, 'test.round_trip');
    await backupService.logImportExport(admin.user_id, 'export', 3, 'success');

    return { admin, cards: [textCard, imageCard, audioCard] };
  }

  async exportBoth() {
    return {
      backup: await backupService.exportApplicationData(),
      archive: await backupService.exportMediaArchive(),
    };
  }

  /**
   * Every table that actually exists in the database (not the backup's own list),
   * minus transient ones, so a table missing from the backup cannot go unnoticed.
   */
  async databaseTables() {
    const tables = [];
    for (const db of [this.identityDatabase, this.database]) {
      const result = await db.query(db.constructor.introspectionQueries.list_schema_tables);
      tables.push(...result.rows.map((row) => row.table_name));
    }
    return tables.filter((table) => !this.constructor.TRANSIENT_TABLES.includes(table));
  }

  /**
   * Read every row of every table straight from the database.
   */
  async snapshot() {
    const data = {};
    for (const table of await this.databaseTables()) {
      const result = await backupService
        .databaseFor(table)
        .query(BackupService.queries.select_all_rows_template.replace('{{table}}', table));
      data[table] = result.rows;
    }
    return { data };
  }

  /**
   * Map install-specific ids to stable values so two installs can be compared:
   * the merged admin's user_id, and role/right ids replaced by their names.
   */
  normalizedRows(snapshot, table, userIdMap) {
    const idToName = {};
    for (const [naturalTable, [idColumn, nameColumn]] of Object.entries(
      this.constructor.NATURAL_KEYS
    )) {
      idToName[idColumn] = new Map(
        (snapshot.data[naturalTable] || []).map((row) => [row[idColumn], row[nameColumn]])
      );
    }
    return (snapshot.data[table] || [])
      .map((source) => this.normalizeRow(source, idToName, userIdMap))
      .map((row) => JSON.stringify(row, Object.keys(row).sort()))
      .sort();
  }

  normalizeRow(source, idToName, userIdMap) {
    const row = { ...source };
    for (const column of this.constructor.USER_REFERENCE_COLUMNS) {
      if (row[column] && userIdMap.has(row[column])) row[column] = userIdMap.get(row[column]);
    }
    for (const [column, names] of Object.entries(idToName)) {
      if (row[column] !== undefined) row[column] = names.get(row[column]) ?? row[column];
    }
    return row;
  }

  compareSnapshots(expected, actual, userIdMap, label) {
    const tables = [
      ...new Set([...Object.keys(expected.data), ...Object.keys(actual.data)]),
    ].sort();
    for (const table of tables) {
      const before = this.normalizedRows(expected, table, userIdMap);
      const after = this.normalizedRows(actual, table, new Map());
      const missing = before.filter((row) => !after.includes(row)).length;
      const extra = after.filter((row) => !before.includes(row)).length;
      this.check(
        `${label}: ${table} (${before.length} row(s))`,
        missing === 0 && extra === 0,
        `${missing} missing, ${extra} unexpected`
      );
    }
  }

  compareArchives(expected, actual, label) {
    const before = mediaArchiveService.parseArchive(expected);
    const after = mediaArchiveService.parseArchive(actual);
    const identical =
      before.size === after.size &&
      [...before].every(([id, item]) => after.get(id)?.dataUrl === item.dataUrl);
    this.check(`${label}: media archive (${before.size} item(s)) byte-identical`, identical);
  }

  async run() {
    this.assertLocalTarget();
    console.log('Backup round-trip test (local scratch database)\n');

    console.log('1. Fresh database + synthetic data');
    await this.resetDatabase();
    const { admin } = await this.seed();
    const backedUp = [...BackupService.iamTables, ...BackupService.appTables];
    for (const table of await this.databaseTables()) {
      this.check(
        `backup covers table ${table}`,
        backedUp.includes(table),
        'table is not backed up'
      );
    }
    const before = await this.snapshot();
    for (const [table, rows] of Object.entries(before.data)) {
      if (this.constructor.UNSEEDED_TABLES.includes(table)) continue;
      this.check(`seeded ${table}`, rows.length > 0, 'no rows to prove the round trip with');
    }
    const original = await this.exportBoth();

    console.log('\n2. Database wiped; admin re-created under a new id; backup imported');
    await this.resetDatabase();
    const recreated = await this.createAdmin('rt_admin');
    this.check('re-created admin has a new user_id', recreated.user_id !== admin.user_id);
    const result = await backupService.importApplicationData(
      structuredClone(original.backup),
      original.archive
    );
    this.check(
      'import reported no failed tables',
      Object.keys(result.failed).length === 0,
      JSON.stringify(result.failed)
    );
    const unexpected = result.warnings.filter((w) => !w.startsWith('Merged backup user'));
    this.check(
      'import warnings are only the expected user merge',
      unexpected.length === 0,
      unexpected.slice(0, 3).join(' | ')
    );
    const restored = await this.snapshot();
    const userIdMap = new Map([[admin.user_id, recreated.user_id]]);
    this.compareSnapshots(before, restored, userIdMap, 'restored');
    this.compareArchives(original.archive, await backupService.exportMediaArchive(), 'restored');

    console.log('\n3. Same backup imported again (must change nothing)');
    await backupService.importApplicationData(structuredClone(original.backup), original.archive);
    this.compareSnapshots(restored, await this.snapshot(), new Map(), 'idempotent');

    console.log('\n4. Corrupt backup: import must be rejected and change nothing');
    await this.checkAtomicImport(original);

    console.log(`\n${this.checks - this.failures.length}/${this.checks} checks passed`);
    return { success: this.failures.length === 0, failures: this.failures };
  }

  /**
   * A backup whose first table holds a valid change (a user's full name) and
   * whose later table holds a row that must fail (an option pointing at a card
   * that does not exist). The import must throw and leave every table as it was,
   * proving the earlier change was rolled back.
   */
  async checkAtomicImport(original) {
    const beforeAttempt = await this.snapshot();
    const corrupt = structuredClone(original.backup);
    corrupt.data.users[0].full_name = 'Changed by a failed import';
    corrupt.data.flashcard_options.push({
      ...corrupt.data.flashcard_options[0],
      option_id: '00000000-0000-4000-8000-000000000001',
      flashcard_id: '00000000-0000-4000-8000-000000000002',
    });

    let rejection = null;
    try {
      await backupService.importApplicationData(corrupt, original.archive);
    } catch (error) {
      rejection = error;
    }
    this.check(
      'corrupt import was rejected',
      rejection !== null && /flashcard_options/.test(rejection.message),
      rejection ? rejection.message : 'import succeeded'
    );
    this.compareSnapshots(beforeAttempt, await this.snapshot(), new Map(), 'rolled back');
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

export const backupRoundTripTest = new BackupRoundTripTest();
export default backupRoundTripTest;
