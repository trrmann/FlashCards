/**
 * FlashCards' own per-user settings: the last page visited and the storage limit
 * (flashcards.user_settings). They were columns of iam.users; they moved here in IAM
 * phase 3c so FlashCards keeps its own data and the IAM keeps only identity.
 * A user without a row has the defaults ('/', 25 MiB).
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';

export class UserSettingsService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/user-settings-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  /** PostgreSQL foreign-key violation: the user doesn't exist. */
  static FOREIGN_KEY_VIOLATION = '23503';

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  async getLastPageVisited(userId) {
    const result = await this.database.query(this.constructor.queries.get_last_page_visited, [
      userId,
    ]);
    return result.rows[0].last_page_visited;
  }

  async updateLastPageVisited(userId, page) {
    const result = await this.database.query(this.constructor.queries.upsert_last_page_visited, [
      userId,
      page,
    ]);
    return result.rows[0].last_page_visited;
  }

  /** @returns {Promise<number>} bytes */
  async getStorageLimit(userId) {
    const result = await this.database.query(this.constructor.queries.get_storage_limit, [userId]);
    return Number(result.rows[0].storage_max_bytes);
  }

  /**
   * @returns {Promise<{storage_max_bytes: string}|null>} null when the user doesn't exist
   */
  async setStorageLimit(userId, maxBytes) {
    try {
      const result = await this.database.query(this.constructor.queries.upsert_storage_limit, [
        userId,
        maxBytes,
      ]);
      return result.rows[0];
    } catch (error) {
      if (error.code === this.constructor.FOREIGN_KEY_VIOLATION) return null;
      throw error;
    }
  }
}

export const userSettingsService = new UserSettingsService();
export default userSettingsService;
