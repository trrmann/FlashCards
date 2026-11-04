/**
 * A user's FlashCards data (phase 3d). FlashCards holds no foreign keys to the IAM's users
 * (owner decision), so:
 * - deleteUserData removes one user's rows from every FlashCards table, in one transaction, in
 *   the order the old ON DELETE CASCADE used. Repeatable: a second run changes nothing.
 * - findOrphans / removeOrphans: the safety net. User ids FlashCards holds data for that the IAM
 *   no longer knows (a missed or purged notice). Admin-run only, never automatic: if the IAM
 *   were ever empty (say, after a wrong restore) an automatic run would remove everyone's data.
 *   It refuses when the IAM confirms none of the users, or when more than MAX_ORPHAN_SHARE of
 *   them (at least one) would go.
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';

export class UserDataService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/user-data-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  /** Deletion order (named queries). */
  static DELETE_STEPS = [
    'delete_user_shares',
    'delete_user_public_card_removals',
    'delete_user_leitner_progress',
    'delete_user_practice_history',
    'delete_user_session_card_attempts',
    'delete_user_leitner_boxes',
    'delete_user_quiz_results',
    'delete_user_quizzes',
    'delete_user_flashcards',
    'delete_user_lessons',
    'delete_user_media',
    'delete_user_import_export_logs',
    'delete_user_settings',
  ];

  /** The orphan check refuses when more than this share of the users would be removed. */
  static MAX_ORPHAN_SHARE = 0.25;

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  /** @returns {Promise<number>} rows removed */
  async deleteUserData(userId) {
    return this.database.withTransaction(
      async (client) => {
        let removed = 0;
        for (const step of this.constructor.DELETE_STEPS) {
          removed += (await client.query(this.constructor.queries[step], [userId])).rowCount;
        }
        return removed;
      },
      { priority: 'background' }
    );
  }

  /**
   * User ids with FlashCards data that the IAM doesn't know.
   * @param {{getUserSummaries: Function}} identity - The identity gateway
   * @returns {Promise<{orphans: string[], users: number}>}
   */
  async findOrphans(identity) {
    const ids = (await this.database.query(this.constructor.queries.user_ids_with_data)).rows.map(
      (row) => row.user_id
    );
    if (ids.length === 0) return { orphans: [], users: 0 };
    const known = await identity.getUserSummaries(ids);
    return { orphans: ids.filter((id) => !known.has(id)), users: ids.length };
  }

  /**
   * Remove orphans' data, unless too many would go (then nothing is removed).
   * @returns {Promise<{orphans: string[], users: number, removedRows: number}>}
   */
  async removeOrphans(identity) {
    const found = await this.findOrphans(identity);
    const allowed = Math.max(1, Math.floor(found.users * this.constructor.MAX_ORPHAN_SHARE));
    const noneKnown = found.users > 0 && found.orphans.length === found.users;
    if (noneKnown || found.orphans.length > allowed) {
      const error = new Error(
        `Refused: ${found.orphans.length} of ${found.users} users are unknown to the IAM; ` +
          'check the IAM before removing their data'
      );
      error.status = 409;
      throw error;
    }
    let removedRows = 0;
    for (const id of found.orphans) removedRows += await this.deleteUserData(id);
    return { ...found, removedRows };
  }
}

export const userDataService = new UserDataService();
export default userDataService;
