/**
 * Backup client: talks to a running FlashCards server (local, preview, or Render)
 * over HTTP, as an admin, to download the two-file backup (data JSON + media ZIP)
 * or to restore one. Restore also performs the whole new-database recovery: when
 * the target has no users, it creates the admin through initial setup first.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class BackupClient {
  static BACKUP_ROOT = path.join(os.homedir(), 'FlashCardsBackups');

  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(this.baseUrl)) {
      throw new Error(`A base URL like https://<app>.onrender.com is required (got "${baseUrl}")`);
    }
    this.cookie = null;
  }

  /**
   * Send a request with the session cookie; remember any cookie the server sets.
   */
  async request(apiPath, { method = 'GET', json } = {}) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (json !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });

    const setCookie = response.headers.getSetCookie?.() || [];
    const session = setCookie.find((value) => value.startsWith('connect.sid='));
    if (session) this.cookie = session.split(';')[0];
    return response;
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

  async login(username, password) {
    await this.requestJson('/api/auth/login', { method: 'POST', json: { username, password } });
  }

  async initialSetup({ username, email, password, fullName }) {
    await this.requestJson('/api/system/initial-setup', {
      method: 'POST',
      json: { username, email, password, passwordConfirm: password, fullName },
    });
  }

  /**
   * Sign in as admin, or create the admin first when the database is empty.
   * @returns {Promise<boolean>} true when initial setup created the admin
   */
  async ensureAdminSession(credentials) {
    const status = await this.setupStatus();
    if (status.needsSetup) {
      if (!credentials.email) {
        throw new Error('The target has no users: an admin email is required for initial setup');
      }
      await this.initialSetup(credentials);
      return true;
    }
    await this.login(credentials.username, credentials.password);
    return false;
  }

  async downloadFile(apiPath, targetFile) {
    const response = await this.request(apiPath);
    if (!response.ok) throw new Error(`GET ${apiPath} failed (${response.status})`);
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
   * Import a backup (JSON plus optional media ZIP). All-or-nothing on the server.
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
 * Command-line front end: `download <url> [dir]` and `restore <url> <json> [zip]`.
 * Credentials come from the environment (the shell wrappers prompt for them):
 * FLASHCARDS_ADMIN_USER, FLASHCARDS_ADMIN_PASSWORD, and, for an empty target,
 * FLASHCARDS_ADMIN_EMAIL and FLASHCARDS_ADMIN_NAME.
 */
export class BackupCli {
  constructor(env = process.env) {
    this.credentials = {
      username: env.FLASHCARDS_ADMIN_USER,
      password: env.FLASHCARDS_ADMIN_PASSWORD,
      email: env.FLASHCARDS_ADMIN_EMAIL || null,
      fullName: env.FLASHCARDS_ADMIN_NAME || null,
    };
  }

  requireCredentials() {
    if (!this.credentials.username || !this.credentials.password) {
      throw new Error('FLASHCARDS_ADMIN_USER and FLASHCARDS_ADMIN_PASSWORD are required');
    }
  }

  async download(baseUrl, dir) {
    const client = new BackupClient(baseUrl);
    await client.login(this.credentials.username, this.credentials.password);
    const result = await client.download(dir || undefined);
    console.log(`Backup saved to ${result.dir}`);
    console.log(
      `  users ${result.metadata.totalUsers ?? '?'}, flashcards ${result.metadata.totalFlashcards ?? '?'}, media ${result.metadata.totalMedia ?? '?'}`
    );
  }

  async restore(baseUrl, jsonFile, zipFile) {
    if (!jsonFile) throw new Error('usage: restore <url> <backup.json> [media.zip]');
    const client = new BackupClient(baseUrl);
    const createdAdmin = await client.ensureAdminSession(this.credentials);
    if (createdAdmin) console.log(`Empty database: created admin ${this.credentials.username}`);
    const results = await client.restore(jsonFile, zipFile);
    const total = Object.values(results.imported).reduce((sum, count) => sum + count, 0);
    console.log(`Restored ${total} row(s) into ${baseUrl}`);
    for (const warning of results.warnings) console.log(`  warning: ${warning}`);
  }

  /**
   * @returns {Promise<number>} process exit code
   */
  async run([command, ...args]) {
    try {
      this.requireCredentials();
      if (command === 'download') await this.download(args[0], args[1]);
      else if (command === 'restore') await this.restore(args[0], args[1], args[2]);
      else
        throw new Error('usage: backup-cli.mjs download <url> [dir] | restore <url> <json> [zip]');
      return 0;
    } catch (error) {
      console.error(`backup: ${error.message}`);
      return 1;
    }
  }
}

export const backupCli = new BackupCli();
export default backupCli;
