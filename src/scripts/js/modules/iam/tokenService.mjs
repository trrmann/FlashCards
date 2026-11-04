/**
 * Token service (IAM phase 3).
 * Issues opaque bearer tokens (32 random bytes, base64url) and stores only their
 * SHA-256 hashes. Access tokens are short-lived; refresh tokens rotate on every
 * use. Each login starts a token family: presenting a refresh token that was
 * already used is treated as theft and revokes the whole family.
 */

import crypto from 'node:crypto';
import { identityManagementDb } from '../db/identityManagementDatabase.mjs';

export class TokenService {
  static queries = identityManagementDb.constructor.loadNamedSqlStatements(
    'pg/iam-token-queries.sql',
    identityManagementDb.constructor.sqlRoot
  );

  static ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
  static REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(
    database = identityManagementDb,
    { accessTtlMs = TokenService.ACCESS_TTL_MS, refreshTtlMs = TokenService.REFRESH_TTL_MS } = {}
  ) {
    this.database = database;
    this.accessTtlMs = accessTtlMs;
    this.refreshTtlMs = refreshTtlMs;
  }

  static generate() {
    return crypto.randomBytes(32).toString('base64url');
  }

  static hash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  async insert(kind, familyId, userId, appKey, ttlMs) {
    const token = this.constructor.generate();
    const result = await this.database.query(this.constructor.queries.insert_token, [
      this.constructor.hash(token),
      kind,
      familyId,
      userId,
      appKey,
      new Date(Date.now() + ttlMs),
    ]);
    if (result.rows.length === 0) throw new Error(`Unknown application: ${appKey}`);
    return token;
  }

  /**
   * Issue an access + refresh token pair for a user in an application.
   * A new login starts a new family; a refresh continues the existing one.
   */
  async issuePair(userId, appKey, familyId = crypto.randomUUID()) {
    const accessToken = await this.insert('access', familyId, userId, appKey, this.accessTtlMs);
    const refreshToken = await this.insert('refresh', familyId, userId, appKey, this.refreshTtlMs);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: Math.floor(this.accessTtlMs / 1000),
    };
  }

  async find(token) {
    if (!token) return null;
    const result = await this.database.query(this.constructor.queries.find_token, [
      this.constructor.hash(token),
    ]);
    return result.rows[0] || null;
  }

  isLive(row) {
    return Boolean(row) && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
  }

  /**
   * The token's record when it is a live access token, else null.
   */
  async verifyAccess(token) {
    const row = await this.find(token);
    return row && row.kind === 'access' && this.isLive(row) ? row : null;
  }

  /**
   * Rotate a refresh token for the calling application.
   * @returns {Promise<object|null>} A new token pair, or null when the token is not usable
   */
  async refresh(refreshToken, appKey) {
    const row = await this.find(refreshToken);
    if (!row || row.kind !== 'refresh' || row.app_key !== appKey || !this.isLive(row)) return null;

    if (row.used_at) {
      await this.revokeFamily(row.family_id); // reuse of a rotated token: assume theft
      return null;
    }
    const claimed = await this.database.query(this.constructor.queries.mark_refresh_used, [
      row.token_id,
    ]);
    if (claimed.rows.length === 0) {
      await this.revokeFamily(row.family_id); // lost a race with another use of the same token
      return null;
    }
    return this.issuePair(row.user_id, appKey, row.family_id);
  }

  async revokeFamily(familyId) {
    await this.database.query(this.constructor.queries.revoke_family, [familyId]);
  }

  async purgeExpired() {
    await this.database.query(this.constructor.queries.delete_expired_tokens);
  }
}

export const tokenService = new TokenService();
export default tokenService;
