/**
 * Backup client: talks to a running FlashCards server (local, preview, or Render) over HTTP to download the
 * two-file backup (data JSON + media ZIP) or to restore one.
 *
 * It acts as a **service account** with an **app token** (`Authorization: Bearer iamsa_…`), never as a person:
 * no password, no session, no MFA (owner decision 2026-11-11; iam-service MIGRATION.md L12). The token comes from
 * `iam-service-account setup-backup flashcards` and holds backup.export / backup.import and
 * identity.backup.export / .import.
 *
 * Restore into a new, empty database: the target has no service account yet, so `setup` first creates the
 * install's first admin through initial setup (a person must own the install); the owner then issues a token
 * with `iam-service-account` and restores with it (restore.sh walks through this).
 *
 * On Render's free plan FlashCards and the IAM service sleep when idle, and waking takes up to a
 * minute. A 503 ("starting", or the IAM service not answering yet) is therefore retried a few
 * times, with a message, instead of failing at once.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class BackupClient {
  static BACKUP_ROOT = path.join(os.homedir(), 'FlashCardsBackups');
  /** 503 answers retried while the services wake, and the pause between tries. */
  static WAKE_RETRIES = 3;
  static WAKE_PAUSE_MS = 10000;
  static TOKEN_PREFIX = 'iamsa_';

  /**
   * @param {string} baseUrl
   * @param {string|null} [token] - The backup service account's app token (not needed for setupStatus/initialSetup)
   */
  constructor(baseUrl, token = null) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(this.baseUrl)) {
      throw new Error(`A base URL like https://<app>.onrender.com is required (got "${baseUrl}")`);
    }
    if (token !== null && !String(token).startsWith(BackupClient.TOKEN_PREFIX)) {
      throw new Error('That is not an app token (iamsa_…); issue one with iam-service-account');
    }
    this.token = token;
  }

  /**
   * Send a request with the app token. A 503 is retried WAKE_RETRIES times, WAKE_PAUSE_MS apart, while the
   * services wake.
   */
  async request(apiPath, options = {}) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.send(apiPath, options);
      if (response.status !== 503 || attempt >= this.constructor.WAKE_RETRIES) return response;
      console.log(
        `FlashCards or the IAM service is still waking (free plan); trying again in ${
          this.constructor.WAKE_PAUSE_MS / 1000
        } s…`
      );
      await new Promise((resolve) => setTimeout(resolve, this.constructor.WAKE_PAUSE_MS));
    }
  }

  send(apiPath, { method = 'GET', json } = {}) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  }

  async requestJson(apiPath, options) {
    const response = await this.request(apiPath, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status === 'error') {
      const detail = [body.message, body.error].filter(Boolean).join(': ');
      throw new Error(
        `${options?.method || 'GET'} ${apiPath} failed (${response.status}) ${detail}`
      );
    }
    return body;
  }

  async setupStatus() {
    return this.requestJson('/api/system/setup-status');
  }

  /** Create the first admin of an empty install (nothing is signed in afterwards). */
  async initialSetup({ username, email, password, fullName }) {
    await this.requestJson('/api/system/initial-setup', {
      method: 'POST',
      json: { username, email, password, passwordConfirm: password, fullName },
    });
  }

  /** The token's service account and backup rights: `{ principal, allowed }`. */
  async access() {
    return this.requestJson('/api/admin/backup/access');
  }

  async downloadFile(apiPath, targetFile) {
    const response = await this.request(apiPath);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`GET ${apiPath} failed (${response.status}) ${body.message || ''}`.trim());
    }
    fs.writeFileSync(targetFile, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    return targetFile;
  }

  /**
   * Download the data JSON and media ZIP into a new timestamped folder.
   */
  async download(rootDir = this.constructor.BACKUP_ROOT) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const host = new URL(this.baseUrl).host.replace(/[^a-z0-9.-]/gi, '_');
    const dir = path.join(rootDir, `${stamp}_${host}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    const json = await this.downloadFile(
      '/api/admin/backup/download',
      path.join(dir, 'flashcards-backup.json')
    );
    const zip = await this.downloadFile(
      '/api/admin/backup/download-media',
      path.join(dir, 'flashcards-backup-media.zip')
    );
    const metadata = JSON.parse(fs.readFileSync(json, 'utf8')).metadata || {};
    return { dir, json, zip, metadata };
  }

  /**
   * Import a backup (JSON plus optional media ZIP). Two steps on the server (users, then FlashCards'
   * data), each all-or-nothing; if the second fails, running the restore again completes it.
   */
  async restore(jsonFile, zipFile = null) {
    const backup = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const mediaArchive = zipFile ? fs.readFileSync(zipFile).toString('base64') : null;
    const body = await this.requestJson('/api/admin/backup/import', {
      method: 'POST',
      json: { backup, mediaArchive },
    });
    return body.results;
  }
}

/**
 * Command-line front end: `download <url> [dir]`, `restore <url> <json> [zip]`, `check <url>`, `setup <url>`.
 * The app token comes from FLASHCARDS_BACKUP_TOKEN (backup.sh reads it from the keyring, where backup-token.sh
 * stored it). `setup` (empty target only) takes FLASHCARDS_ADMIN_USER, _PASSWORD, _EMAIL and _NAME for the first
 * admin.
 */
export class BackupCli {
  static USAGE =
    'usage: backup-cli.mjs download <url> [dir] | restore <url> <json> [zip] | check <url> | setup <url>';

  constructor(env = process.env) {
    this.token = env.FLASHCARDS_BACKUP_TOKEN || null;
    this.admin = {
      username: env.FLASHCARDS_ADMIN_USER,
      password: env.FLASHCARDS_ADMIN_PASSWORD,
      email: env.FLASHCARDS_ADMIN_EMAIL || null,
      fullName: env.FLASHCARDS_ADMIN_NAME || null,
    };
  }

  client(baseUrl) {
    if (!this.token) {
      throw new Error('FLASHCARDS_BACKUP_TOKEN is required (store one with backup-token.sh)');
    }
    return new BackupClient(baseUrl, this.token);
  }

  async download(baseUrl, dir) {
    const client = this.client(baseUrl);
    console.log('Downloading (if the services were asleep, this can take up to a minute)…');
    const result = await client.download(dir || undefined);
    console.log(`Backup saved to ${result.dir}`);
    console.log(
      `  users ${result.metadata.totalUsers ?? '?'}, flashcards ${result.metadata.totalFlashcards ?? '?'}, media ${result.metadata.totalMedia ?? '?'}`
    );
    if (!result.metadata.identityIncluded) {
      console.log('  warning: no users in this backup (the token lacks identity.backup.export)');
    }
  }

  /** Checks a token before backup-token.sh stores it: its account and which backup rights it holds. */
  async check(baseUrl) {
    const { principal, allowed } = await this.client(baseUrl).access();
    const held = Object.entries(allowed || {})
      .filter(([, yes]) => yes)
      .map(([right]) => right);
    console.log(
      `Token works for ${baseUrl}: ${principal.app_key}/${principal.name} (${held.join(', ')})`
    );
    if (principal.expires_at) {
      console.log(`  expires ${new Date(principal.expires_at).toISOString()}`);
    }
  }

  async restore(baseUrl, jsonFile, zipFile) {
    if (!jsonFile) throw new Error('usage: restore <url> <backup.json> [media.zip]');
    const client = this.client(baseUrl);
    if ((await client.setupStatus()).needsSetup) {
      throw new Error(
        'The target is empty: run restore.sh, which creates the first admin and then asks for a new token'
      );
    }
    const results = await client.restore(jsonFile, zipFile);
    const total = Object.values(results.imported).reduce((sum, count) => sum + count, 0);
    console.log(`Restored ${total} row(s) into ${baseUrl}`);
    for (const warning of results.warnings) console.log(`  warning: ${warning}`);
  }

  /** Empty target only: create the install's first admin (the backup's admin, so the accounts merge). */
  async setup(baseUrl) {
    const client = new BackupClient(baseUrl);
    if (!(await client.setupStatus()).needsSetup) {
      console.log(`${baseUrl} already has users; nothing to set up`);
      return;
    }
    const { username, password, email } = this.admin;
    if (!username || !password || !email) {
      throw new Error(
        'FLASHCARDS_ADMIN_USER, FLASHCARDS_ADMIN_PASSWORD and FLASHCARDS_ADMIN_EMAIL are required'
      );
    }
    await client.initialSetup(this.admin);
    console.log(`Empty database: created the first admin ${username}`);
  }

  /**
   * @returns {Promise<number>} process exit code
   */
  async run([command, ...args]) {
    try {
      if (command === 'download') await this.download(args[0], args[1]);
      else if (command === 'restore') await this.restore(args[0], args[1], args[2]);
      else if (command === 'check') await this.check(args[0]);
      else if (command === 'setup') await this.setup(args[0]);
      else throw new Error(BackupCli.USAGE);
      return 0;
    } catch (error) {
      console.error(`backup: ${error.message}`);
      return 1;
    }
  }
}

export const backupCli = new BackupCli();
export default backupCli;
