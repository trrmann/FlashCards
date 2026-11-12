/**
 * Backup round-trip test (CODING_STANDARDS 0.7).
 * Proves that a full backup (data JSON + media ZIP) rebuilds every table after the database
 * is wiped, including the real recovery scenario: the admin account is re-created in the
 * empty database under a new user_id before the import. Runs only against the local scratch
 * database (local-db.sh); it refuses any other target because it drops the public schema.
 *
 * Format 4.0 (phase 3d): the identity part goes through the identity gateway, as the signed-in
 * admin; with `remoteIam: true` (npm run test:roundtrip:remote) through the IAM service over
 * HTTP, started in the test. Also: the two-step restore (a failed second step keeps the first,
 * and running it again completes it), a FlashCards-only backup for a non-platform admin, and
 * older 3.1 and 2.0 files.
 */

import crypto from 'node:crypto';
import { TableBackup } from 'platform-db';
import { LocalTestCase } from './localTestCase.mjs';
import { userAuthService, organizationService, IamBackupService } from 'iam-service/services';
import { IamTables } from 'iam-service/db';
import {
  MfaService,
  ServiceAccountService,
  appRightsService,
  DomainService,
} from 'iam-service/services';
import { MfaKey, Totp } from 'iam-service/mfa';
import { tokenPolicyService, IamServer, ApplicationCredentials } from 'iam-service/server';
import { LocalIdentityGateway, RemoteIdentityGateway } from '../identity/index.mjs';
import { entriesService } from '../auth/entriesService.mjs';
import { practiceService } from '../auth/practiceService.mjs';
import { BackupService } from '../auth/backupService.mjs';
import { mediaArchiveService } from '../auth/mediaArchiveService.mjs';
import { QuizRouter } from '../routes/quizRouter.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';

export class BackupRoundTripTest extends LocalTestCase {
  static PASSWORD = 'RoundTrip#2026';
  static PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  static AUDIO =
    'data:audio/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnAQAAAAAAAA==';
  static USER_REFERENCE_COLUMNS = [
    ...new Set([...BackupService.userReferenceColumns, ...IamBackupService.USER_REFERENCE_COLUMNS]),
  ];
  static IAM_PORT = 5095;
  static NATURAL_KEYS = {
    applications: ['app_id', 'app_key'],
    roles: ['role_id', 'role_name'],
    rights: ['right_id', 'right_key'],
  };
  /** Natural-key tables whose own id each install assigns afresh on restore (compared without it). */
  static INSTALL_ASSIGNED_IDS = { principal_rights: 'grant_id', domain: 'domain_id' };
  static LEGACY_ONLY_TABLES = [
    'applications',
    'application_users',
    'organizations',
    'organization_members',
    'groups',
    'group_members',
    'group_roles',
    'token_policies',
    // MFA (iam-service v0.2): no backup from before format 3.0 can hold these.
    'user_mfa',
    'user_recovery_codes',
    'mfa_key_check',
    'mfa_admin_policies',
    // Service accounts (iam-service v0.3): newer than every pre-3.0 backup.
    'service_accounts',
    'principal_rights',
    'service_tokens',
    'domain_settings',
    // Sharing between organizations (iam-service v0.5).
    'organization_partners',
    // The domain row (iam-service v0.5): newer than every pre-3.0 backup.
    'domain',
  ];
  /** Not backed up: FlashCards' sessions, and the IAM's transient tables (its own list, so new ones follow). */
  static TRANSIENT_TABLES = ['session', ...IamTables.TRANSIENT];

  constructor({ remoteIam = false, ...options } = {}) {
    super(options);
    this.remoteIam = remoteIam;
  }

  /** The signed-in admin (or user) as the backup sees them: a request with a session. */
  async actor(username) {
    const req = { session: {} };
    const user = await this.identity.login(req, username, this.constructor.PASSWORD);
    req.session.userId = user.user_id;
    req.session.username = user.username;
    return req;
  }
  static UNSEEDED_TABLES = ['rights', 'role_rights', 'lessons', 'leitner_boxes'];

  async createAdmin(username) {
    const admin = await userAuthService.createUser(
      username,
      `${username}@example.test`,
      this.constructor.PASSWORD,
      'Round Trip Admin'
    );
    await userAuthService.makeFirstAdmin(admin.user_id); // as initial setup does
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

    await userSettingsService.setStorageLimit(alice.user_id, 1048576);
    await userSettingsService.updateLastPageVisited(bob.user_id, '/practice');
    // A right of FlashCards' own, granted to Alice by its admin (iam-service v0.4: principal_rights).
    await appRightsService.registerRights('flashcards', [{ key: 'test.round_trip' }]);
    await appRightsService.setRight(
      { actorId: admin.user_id, viaAppKey: 'flashcards' },
      'flashcards',
      'user',
      alice.user_id,
      'test.round_trip',
      true
    );
    await this.backups.logImportExport(
      { session: { userId: admin.user_id } },
      'export',
      3,
      'success'
    );

    const org = await organizationService.createOrganization(admin.user_id, {
      name: 'Round Trip Org',
      slug: 'round-trip-org',
      ownerUsername: 'rt_alice',
    });
    await organizationService.addMember(alice.user_id, org.org_id, { username: 'rt_bob' });
    // A partner organization (iam-service v0.5: organization_partners).
    const partner = await organizationService.createOrganization(admin.user_id, {
      name: 'Round Trip Partner',
      slug: 'round-trip-partner',
      ownerUsername: 'rt_alice',
    });
    await organizationService.addPartner(alice.user_id, org.org_id, partner.org_id);
    // The domain (iam-service v0.5): its row, primary admin and owning organization, as the IAM's start-up makes them.
    await new DomainService(this.identityDatabase).bootstrap();
    const group = await organizationService.createGroup(alice.user_id, org.org_id, {
      name: 'Study group',
      description: 'Round trip',
    });
    await organizationService.addGroupMember(alice.user_id, group.group_id, { username: 'rt_bob' });
    await organizationService.grantGroupRole(admin.user_id, group.group_id, {
      appKey: 'flashcards',
      roleName: 'user',
    });

    // MFA (iam-service v0.2): Alice turns it on (secret, recovery codes, the key's fingerprint), and the domain
    // admin sets FlashCards' application-admin MFA setting.
    const mfa = new MfaService(this.identityDatabase, {
      key: new MfaKey({ key: crypto.randomBytes(MfaKey.KEY_BYTES).toString('base64') }),
    });
    const enrollment = await mfa.startEnrollment(alice.user_id, 'flashcards');
    await mfa.confirmEnrollment(alice.user_id, Totp.code(enrollment.secret, Totp.stepAt()));
    // The domain switch (iam-service v0.3): recorded, then back on (the default), so the row is in the backup.
    await mfa.setActive(admin.user_id, { active: true });
    await mfa.setPolicy(admin.user_id, {
      scopeType: 'application',
      appKey: 'flashcards',
      required: true,
    });
    // Service accounts (iam-service v0.3): FlashCards' backup account, its four rights and a token.
    await new ServiceAccountService(this.identityDatabase).setUpBackup(admin.user_id, 'flashcards');
    // Token lifetime policies: references to an application, a group, and a user.
    await tokenPolicyService.set(admin.user_id, {
      scopeType: 'application',
      appKey: 'flashcards',
      accessTtlSeconds: 1800,
    });
    await tokenPolicyService.set(admin.user_id, {
      scopeType: 'group',
      scopeId: group.group_id,
      refreshTtlSeconds: 604800,
    });
    await tokenPolicyService.set(admin.user_id, {
      scopeType: 'user',
      scopeId: alice.user_id,
      accessTtlSeconds: 900,
    });

    return { admin, cards: [textCard, imageCard, audioCard] };
  }

  async exportBoth(actor) {
    return {
      backup: await this.backups.exportBackup(actor),
      archive: await this.backups.exportMediaArchive(),
    };
  }

  /**
   * Every table that actually exists in the database (not the backup's own list),
   * minus transient ones, so a table missing from the backup cannot go unnoticed.
   */
  async databaseTables() {
    const tables = [];
    for (const db of [this.identityDatabase, this.database]) {
      tables.push(...(await db.listSchemaTables()));
    }
    return tables.filter((table) => !this.constructor.TRANSIENT_TABLES.includes(table));
  }

  /**
   * Read every row of every table straight from the database.
   */
  async snapshot() {
    const data = {};
    for (const table of await this.databaseTables()) {
      const db = IamTables.backupTables().includes(table) ? this.identityDatabase : this.database;
      const reader = new TableBackup({
        database: db,
        schema: db.constructor.SCHEMA,
        tables: [table],
      });
      data[table] = await reader.selectAll(table);
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
    const ownId = this.constructor.INSTALL_ASSIGNED_IDS[table];
    return (snapshot.data[table] || [])
      .map((source) => {
        const row = { ...source };
        if (ownId) delete row[ownId];
        return row;
      })
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

  /** The gateway and backup service for this run: in-process, or the IAM service over HTTP. */
  async startIdentity() {
    this.iamServer = null;
    if (!this.remoteIam) {
      this.identity = new LocalIdentityGateway();
    } else {
      const secret = crypto.randomBytes(32).toString('hex');
      this.iamServer = new IamServer({
        port: this.constructor.IAM_PORT,
        routerOptions: {
          credentials: new ApplicationCredentials({
            [ApplicationCredentials.envName('flashcards')]: secret,
          }),
        },
      });
      await this.iamServer.start();
      this.identity = new RemoteIdentityGateway({
        baseUrl: `http://127.0.0.1:${this.constructor.IAM_PORT}`,
        clientSecret: secret,
      });
      await this.identity.start();
    }
    this.backups = new BackupService({ identity: this.identity });
  }

  async stopIdentity() {
    await this.identity.stop();
    if (this.iamServer) await this.iamServer.stop();
  }

  /** Wipe the database, re-create the admin under a new id, and sign them in. */
  async freshInstall(admin) {
    await this.resetDatabase();
    const recreated = await this.createAdmin('rt_admin');
    this.check('re-created admin has a new user_id', recreated.user_id !== admin.user_id);
    return { recreated, actor: await this.actor('rt_admin') };
  }

  async run() {
    this.assertLocalTarget();
    console.log(
      `Backup round-trip test (local scratch database; identity ${this.remoteIam ? 'over HTTP' : 'in-process'})\n`
    );
    await this.startIdentity();
    try {
      await this.runChecks();
    } finally {
      await this.stopIdentity();
    }
    return this.summary();
  }

  async runChecks() {
    console.log('1. Fresh database + synthetic data');
    await this.resetDatabase();
    const { admin } = await this.seed();
    const backedUp = [...IamTables.backupTables(), ...BackupService.appTables];
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
    const original = await this.exportBoth(await this.actor('rt_admin'));
    this.check(
      'the backup is format 4.0 with an identity part and a FlashCards part',
      original.backup.version === '4.0' &&
        original.backup.identity?.data?.users?.length === 3 &&
        original.backup.flashcards?.data?.flashcards?.length === 3
    );

    console.log('\n2. Database wiped; admin re-created under a new id; backup imported');
    const { recreated, actor } = await this.freshInstall(admin);
    const result = await this.backups.importBackup(
      actor,
      structuredClone(original.backup),
      original.archive
    );
    this.check(
      'both steps ran (identity, then FlashCards)',
      result.steps.join(',') === 'identity,flashcards',
      result.steps.join(',')
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
    this.compareArchives(original.archive, await this.backups.exportMediaArchive(), 'restored');

    console.log('\n3. Same backup imported again (must change nothing)');
    await this.backups.importBackup(actor, structuredClone(original.backup), original.archive);
    this.compareSnapshots(restored, await this.snapshot(), new Map(), 'idempotent');

    console.log("\n4. A bad row in FlashCards' part: that step is rolled back");
    await this.checkAtomicImport(original, actor);

    console.log('\n5. Two steps: the second fails, then running it again completes it');
    await this.checkTwoStepRerun(original, actor);

    console.log('\n6. Only platform admins back up and restore users');
    await this.checkPlatformAdminOnly(original);

    console.log('\n7. A format 3.1 file (one data set, as made before phase 3d) restores');
    await this.checkFormat31(original, admin);

    console.log('\n8. Legacy (format 2.0) backup restores into a wiped database');
    await this.checkLegacyRestore(original, admin);
  }

  /** The combined single data set of format 3.1 (what backups looked like before 4.0). */
  static toFormat31(backup) {
    return {
      version: '3.1',
      exportedAt: backup.exportedAt,
      data: {
        ...structuredClone(backup.identity.data),
        ...structuredClone(backup.flashcards.data),
      },
      mediaManifest: backup.flashcards.mediaManifest,
    };
  }

  async checkFormat31(original, admin) {
    const { recreated, actor } = await this.freshInstall(admin);
    const result = await this.backups.importBackup(
      actor,
      this.constructor.toFormat31(original.backup),
      original.archive
    );
    this.check(
      'a 3.1 file is split and both steps run',
      result.steps.join(',') === 'identity,flashcards'
    );
    const after = await this.snapshot();
    this.check(
      '3.1 restore: every card and user back',
      after.data.flashcards.length === original.backup.flashcards.data.flashcards.length &&
        after.data.users.length === original.backup.identity.data.users.length &&
        recreated.user_id !== admin.user_id
    );
  }

  /**
   * Turn a current backup into the shape of a format 2.0 backup (before
   * applications, app-scoped roles, organizations, and groups existed).
   */
  toLegacyBackup(backup) {
    const legacy = this.constructor.toFormat31(backup);
    legacy.version = '2.0';
    const platformRoles = new Set(
      legacy.data.roles.filter((role) => role.app_id === null).map((role) => role.role_id)
    );
    for (const table of this.constructor.LEGACY_ONLY_TABLES) delete legacy.data[table];
    legacy.data.roles = legacy.data.roles
      .filter((role) => !platformRoles.has(role.role_id))
      .map(({ app_id: _appId, ...role }) => role);
    legacy.data.user_roles = legacy.data.user_roles.filter(
      (row) => !platformRoles.has(row.role_id)
    );
    legacy.data.rights = legacy.data.rights.map(({ app_id: _appId, ...right }) => right);
    // Before format 3.1, FlashCards' per-user settings were columns of users.
    const settings = new Map(legacy.data.user_settings.map((row) => [row.user_id, row]));
    delete legacy.data.user_settings;
    for (const user of legacy.data.users) {
      const row = settings.get(user.user_id);
      user.last_page_visited = row?.last_page_visited ?? '/';
      user.storage_max_bytes = row?.storage_max_bytes ?? '26214400';
    }
    return legacy;
  }

  /**
   * A format 2.0 backup must restore: its admin/user roles become FlashCards
   * roles and every restored user can sign in to FlashCards.
   */
  async checkLegacyRestore(original, admin) {
    const { recreated, actor } = await this.freshInstall(admin);
    const result = await this.backups.importBackup(
      actor,
      this.toLegacyBackup(original.backup),
      original.archive
    );
    this.check(
      'legacy backup was upgraded',
      result.warnings.some((w) => w.startsWith('Legacy backup'))
    );
    const users = (await this.snapshot()).data.users;
    this.check(
      'legacy restore: all users restored',
      users.length === original.backup.identity.data.users.length
    );
    let allAccess = true;
    for (const user of users) {
      if (!(await userAuthService.hasAppAccess(user.user_id))) allAccess = false;
    }
    this.check('legacy restore: every user has FlashCards access', allAccess);
    const alice = users.find((user) => user.username === 'rt_alice');
    const roles = await userAuthService.getUserRoles(alice.user_id);
    this.check(
      'legacy restore: user role belongs to FlashCards',
      roles.some((role) => role.role_name === 'user' && role.app_key === 'flashcards')
    );
    this.check(
      'legacy restore: merged admin is still a platform admin',
      admin.user_id !== recreated.user_id &&
        (await userAuthService.isPlatformAdmin(recreated.user_id))
    );
    this.check(
      "legacy restore: a user's storage limit (a users column before 3.1) is kept",
      (await userSettingsService.getStorageLimit(alice.user_id)) === 1048576
    );
    const cards = (await this.snapshot()).data.flashcards;
    this.check(
      'legacy restore: flashcards restored',
      cards.length === original.backup.flashcards.data.flashcards.length
    );
  }

  /** A FlashCards part with an option pointing at a card that doesn't exist. */
  static withBrokenOption(backup) {
    const broken = structuredClone(backup);
    const options = broken.flashcards.data.flashcard_options;
    options.push({
      ...options[0],
      option_id: '00000000-0000-4000-8000-000000000001',
      flashcard_id: '00000000-0000-4000-8000-000000000002',
    });
    return broken;
  }

  /**
   * FlashCards' part holds a valid change (a card's question) and a row that must fail: the
   * import is refused (422 naming the table) and that step's change is rolled back.
   */
  async checkAtomicImport(original, actor) {
    const beforeAttempt = await this.snapshot();
    const corrupt = this.constructor.withBrokenOption(original.backup);
    corrupt.flashcards.data.flashcards[0].question = 'Changed by a failed import';
    let rejection = null;
    try {
      await this.backups.importBackup(actor, corrupt, original.archive);
    } catch (error) {
      rejection = error;
    }
    this.check(
      'corrupt import was rejected (422, naming flashcard_options)',
      rejection?.status === 422 && /flashcard_options/.test(rejection.message),
      rejection ? `${rejection.status} ${rejection.message}` : 'import succeeded'
    );
    this.compareSnapshots(beforeAttempt, await this.snapshot(), new Map(), 'rolled back');
  }

  /**
   * The identity part changes a user's name and FlashCards' part fails: step 1 stays applied
   * (owner decision), the message says to run it again, and running the fixed file completes it.
   */
  async checkTwoStepRerun(original, actor) {
    const renamed = structuredClone(original.backup);
    const alice = renamed.identity.data.users.find((user) => user.username === 'rt_alice');
    alice.full_name = 'Alice (restored)';
    let rejection = null;
    try {
      await this.backups.importBackup(
        actor,
        this.constructor.withBrokenOption(renamed),
        original.archive
      );
    } catch (error) {
      rejection = error;
    }
    const users = (await this.snapshot()).data.users;
    this.check(
      'step 2 failed, step 1 stayed applied, and the message says to run it again',
      rejection?.status === 422 &&
        /run the restore again/.test(rejection.message) &&
        users.find((user) => user.username === 'rt_alice')?.full_name === 'Alice (restored)',
      rejection?.message
    );
    const rerun = await this.backups.importBackup(actor, renamed, original.archive);
    this.check('running the fixed file again completes both steps', rerun.steps.length === 2);
    await this.backups.importBackup(actor, structuredClone(original.backup), original.archive);
  }

  /** A non-platform admin's backup has no identity part, and restoring users is refused. */
  async checkPlatformAdminOnly(original) {
    const bob = await this.actor('rt_bob');
    const own = await this.backups.exportBackup(bob);
    this.check(
      "a non-platform admin's backup has FlashCards' part only",
      own.identity === null &&
        own.metadata.identityIncluded === false &&
        own.flashcards.data.flashcards.length > 0
    );
    let refused = null;
    try {
      await this.backups.importBackup(bob, structuredClone(original.backup), original.archive);
    } catch (error) {
      refused = error;
    }
    this.check(
      'restoring users needs a platform admin (403)',
      refused?.status === 403,
      refused?.message
    );
  }
}

export const backupRoundTripTest = new BackupRoundTripTest();
export default backupRoundTripTest;
