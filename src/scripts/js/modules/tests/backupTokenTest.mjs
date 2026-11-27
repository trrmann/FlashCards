/**
 * Backup token test (local scratch database): backups as a service account with an app token, never a person
 * (iam-service MIGRATION.md L12). The real BackupClient against a running FlashCards server: the token's access,
 * download with users, an export-only token (no users, no restore), restore, the log entry naming the account
 * (never taken for an orphaned user), and refusals (no token, a bad token, another application's token, an app
 * token on a non-backup admin route). Identity, accounts and tokens go through the IAM service over HTTP
 * (LocalTestCase.startIam).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Server } from '../server.mjs';
import { LocalTestCase } from './localTestCase.mjs';
import { BackupClient, BackupCli } from '../tools/backupClient.mjs';
import { UserDataService } from '../auth/userDataService.mjs';

export class BackupTokenTest extends LocalTestCase {
  static PASSWORD = 'BackupToken#2026';
  static PORT = 5090;
  static IAM_PORT = 5091;

  constructor(options = {}) {
    super(options);
    this.baseUrl = `http://127.0.0.1:${BackupTokenTest.PORT}`;
  }

  static async errorOf(action) {
    try {
      await action();
      return null;
    } catch (error) {
      return error;
    }
  }

  /** The tokens: the full backup account, an export-only one, and a Heros Companion one. */
  async issueTokens(rootToken) {
    const rights = LocalTestCase.BACKUP_RIGHTS;
    const backup = await this.serviceAccount(rootToken, 'flashcards', 'backup', rights);
    this.backupToken = await this.appToken(rootToken, backup, { scopes: rights });
    const exportOnly = await this.serviceAccount(rootToken, 'flashcards', 'export-only', [
      'backup.export',
    ]);
    this.exportOnlyToken = await this.appToken(rootToken, exportOnly);
    const heros = await this.serviceAccount(rootToken, 'heros-companion', 'backup', rights);
    this.herosToken = await this.appToken(rootToken, heros, { scopes: rights });
    this.shortToken = await this.appToken(rootToken, exportOnly, { days: 10 });
    this.renewToken = await this.appToken(rootToken, backup, { days: 20 });
  }

  async status(apiPath, token) {
    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.status;
  }

  async checkRefusals() {
    console.log('Refusals');
    this.check(
      'no token and no session: the backup is 401',
      (await this.status('/api/admin/backup/download')) === 401
    );
    this.check(
      'a made-up token is 401',
      (await this.status('/api/admin/backup/download', `iamsa_00000000_${'x'.repeat(43)}`)) === 401
    );
    this.check(
      "another application's token is 401",
      (await this.status('/api/admin/backup/download', this.herosToken)) === 401
    );
    this.check(
      'an app token is not an admin session: /api/admin/users is 401',
      (await this.status('/api/admin/users', this.backupToken)) === 401
    );
    this.check(
      'the client refuses something that is not an app token',
      Boolean(await BackupTokenTest.errorOf(() => new BackupClient(this.baseUrl, 'password123')))
    );
  }

  async checkBackupAndRestore() {
    console.log('\nThe backup account');
    const client = new BackupClient(this.baseUrl, this.backupToken);
    const access = await client.access();
    this.check(
      'its access: flashcards/backup with backup.export and identity.backup.export',
      access.principal?.name === 'backup' &&
        access.allowed['backup.export'] === true &&
        access.allowed['identity.backup.export'] === true
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-token-test-'));
    try {
      const result = await client.download(dir);
      this.check(
        'downloads both files, users included',
        fs.existsSync(result.json) &&
          fs.existsSync(result.zip) &&
          result.metadata.identityIncluded === true &&
          result.metadata.totalUsers === 2
      );
      const backup = JSON.parse(fs.readFileSync(result.json, 'utf8'));
      this.check(
        'the identity part carries the service accounts (the token survives a rebuild)',
        backup.identity.data.service_accounts?.length === 3 &&
          backup.identity.data.service_tokens?.length === 5
      );
      const results = await client.restore(result.json, result.zip);
      this.check(
        'restores it: users, then FlashCards',
        results.steps.join() === 'identity,flashcards'
      );

      console.log('\nAn export-only token');
      const limited = new BackupClient(this.baseUrl, this.exportOnlyToken);
      const partial = await limited.download(dir);
      this.check(
        'downloads FlashCards without users (no identity.backup.export)',
        partial.metadata.identityIncluded === false
      );
      const refused = await BackupTokenTest.errorOf(() => limited.restore(result.json, result.zip));
      this.check('cannot restore (403, no backup.import)', /\(403\)/.test(refused?.message || ''));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    console.log('\nThe log');
    const logged = await this.database.query(
      LocalTestCase.testQueries.select_service_import_export_logs
    );
    this.check(
      'export and import are logged for flashcards/backup, with no user',
      logged.rows.some((row) => row.action === 'EXPORT') &&
        logged.rows.some((row) => row.action === 'IMPORT') &&
        logged.rows.every((row) => row.user_id === null)
    );
    const ids = await this.database.query(UserDataService.queries.user_ids_with_data);
    this.check(
      'the orphan check never sees those rows',
      ids.rows.every((row) => row.user_id !== null)
    );
  }

  /** backup.sh asks `token-state`: ok, renew (within 30 days) or invalid; an outage is an error, not "invalid". */
  async checkTokenState() {
    console.log('\nToken state (backup.sh decides whether to get its own token)');
    const state = (token) =>
      new BackupCli({ FLASHCARDS_BACKUP_TOKEN: token ?? '' }).tokenState(this.baseUrl);
    this.check('the backup token: ok', (await state(this.backupToken)) === 'ok');
    this.check('expiring within 30 days: renew', (await state(this.renewToken)) === 'renew');
    this.check('no token: invalid', (await state(null)) === 'invalid');
    this.check(
      'unknown, or without identity.backup.export: invalid',
      (await state(`iamsa_00000000_${'x'.repeat(43)}`)) === 'invalid' &&
        (await state(this.shortToken)) === 'invalid'
    );
    const down = await BackupTokenTest.errorOf(() =>
      new BackupCli({ FLASHCARDS_BACKUP_TOKEN: this.backupToken }).tokenState('http://127.0.0.1:9')
    );
    this.check(
      'the server not answering is an error (never a reason to replace the token)',
      Boolean(down)
    );
  }

  async run() {
    this.assertLocalTarget();
    console.log('Backup token test (local scratch database; identity over HTTP)\n');
    await this.resetDatabase();
    await this.startIam();
    await this.registerUser('bt_root');
    await this.registerUser('bt_plain');
    await this.issueTokens(await this.iamToken('bt_root'));

    const server = new Server({
      env: 'development',
      port: BackupTokenTest.PORT,
      identity: this.identity,
    });
    await server.start();
    try {
      await this.checkRefusals();
      await this.checkBackupAndRestore();
      await this.checkTokenState();
    } finally {
      await new Promise((resolve) => server.httpServer.close(resolve));
      await this.stopIam();
    }
    return this.summary();
  }
}

export default BackupTokenTest;
