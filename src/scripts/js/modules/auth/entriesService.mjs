/**
 * Entries/Flashcards Service Module
 * Handles flashcard CRUD operations and sharing
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';

class EntriesService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/entries-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  /**
   * Create a new flashcard entry
   * @param {string} userId - User ID who owns the entry
   * @param {string} question - Question text
   * @param {string} answer - Answer text
   * @param {string} lesson - Lesson (optional)
   * @param {string} category - Category (optional)
   * @param {string} flashClass - Class this belongs to (optional)
   * @returns {Promise<object>} Created flashcard
   */
  async createFlashcard(
    userId,
    question,
    answer,
    lesson = null,
    category = null,
    flashClass = null
  ) {
    const result = await this.database.query(this.constructor.queries.insert_flashcard, [
      userId,
      question,
      answer,
      userId,
      lesson,
      category,
      flashClass,
    ]);

    return result.rows[0];
  }

  /**
   * Get user's own flashcards
   * @param {string} userId - User ID
   * @returns {Promise<array>} Array of flashcards
   */
  async getUserFlashcards(userId) {
    const result = await this.database.query(this.constructor.queries.select_user_flashcards, [
      userId,
    ]);

    return result.rows;
  }

  /**
   * Get a flashcard by question text (for duplicate detection during import)
   * @param {string} userId - User ID who owns the flashcard
   * @param {string} question - Question text to search for
   * @returns {Promise<object>} Flashcard object or null
   */
  async getFlashcardByQuestion(userId, question) {
    const result = await this.database.query(
      this.constructor.queries.select_flashcard_by_question,
      [userId, question]
    );

    return result.rows[0] || null;
  }

  /**
   * Get user's flashcards filtered by class, lesson, and/or category
   * @param {string} userId - User ID
   * @param {object} filters - { class: string, lesson: string, category: string }
   * @returns {Promise<array>} Array of filtered flashcards
   */
  /**
   * Convert a filter value to an ILIKE pattern with trailing-* wildcard
   * support, matching the header filter / practice semantics.
   */
  getFilterPattern(filterValue) {
    if (!filterValue || String(filterValue).trim() === '') return null;
    const trimmed = String(filterValue).trim();
    if (trimmed.endsWith('*')) {
      return trimmed.substring(0, trimmed.length - 1) + '%';
    }
    return trimmed;
  }

  async getUserFlashcardsFiltered(userId, filters = {}) {
    const filterConditions = [];
    const params = [userId];
    let paramIndex = 2;

    const classPattern = this.getFilterPattern(filters.class);
    if (classPattern) {
      filterConditions.push(`AND class ILIKE $${paramIndex}`);
      params.push(classPattern);
      paramIndex += 1;
    }

    const lessonPattern = this.getFilterPattern(filters.lesson);
    if (lessonPattern) {
      filterConditions.push(`AND lesson ILIKE $${paramIndex}`);
      params.push(lessonPattern);
      paramIndex += 1;
    }

    const categoryPattern = this.getFilterPattern(filters.category);
    if (categoryPattern) {
      filterConditions.push(`AND category ILIKE $${paramIndex}`);
      params.push(categoryPattern);
    }

    const result = await this.database.query(
      this.constructor.queries.select_user_flashcards_filtered_template.replace(
        '{{filter_clause}}',
        filterConditions.join('\n  ')
      ),
      params
    );
    return result.rows;
  }

  /**
   * Get a specific flashcard
   * @param {string} flashcardId - Flashcard ID
   * @param {string} userId - User ID (to check ownership/sharing)
   * @returns {Promise<object>} Flashcard object or null
   */
  async getFlashcard(flashcardId, userId) {
    const result = await this.database.query(
      this.constructor.queries.select_flashcard_with_access,
      [flashcardId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update a flashcard
   * @param {string} flashcardId - Flashcard ID
   * @param {string} userId - User ID (must be owner)
   * @param {object} updates - Fields to update (question, answer, lesson, is_private)
   * @returns {Promise<object>} Updated flashcard
   */
  async updateFlashcard(flashcardId, userId, updates) {
    // Verify ownership
    const checkResult = await this.database.query(this.constructor.queries.select_flashcard_owner, [
      flashcardId,
    ]);

    if (checkResult.rows.length === 0 || checkResult.rows[0].created_by !== userId) {
      return null;
    }

    const allowedFields = ['question', 'answer', 'lesson', 'category', 'class', 'is_private'];
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount += 1;
      }
    }

    if (fields.length === 0) {
      return this.getFlashcard(flashcardId, userId);
    }

    values.push(flashcardId);

    const result = await this.database.query(
      this.constructor.queries.update_flashcard_template
        .replace('{{columns}}', fields.join(', '))
        .replace('{{flashcard_id}}', `$${paramCount}`),
      values
    );

    return result.rows[0];
  }

  /**
   * Delete a flashcard
   * @param {string} flashcardId - Flashcard ID
   * @param {string} userId - User ID (must be owner)
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteFlashcard(flashcardId, userId) {
    const result = await this.database.query(this.constructor.queries.delete_flashcard, [
      flashcardId,
      userId,
    ]);

    return result.rowCount > 0;
  }

  /**
   * Share a flashcard with another user
   * @param {string} flashcardId - Flashcard ID to share
   * @param {string} ownerId - User ID who owns the flashcard
   * @param {string} recipientId - User ID to share with
   * @returns {Promise<object>} Share object
   */
  /**
   * List public cards from other users that this user has not removed.
   */
  async getPublicCards(userId) {
    const result = await this.database.query(
      this.constructor.queries.select_public_cards_for_user,
      [userId]
    );
    return result.rows;
  }

  /**
   * Remove a public card from this user's study set (auto-approval opt-out).
   */
  async removePublicCard(userId, flashcardId) {
    await this.database.query(this.constructor.queries.insert_public_card_removal, [
      userId,
      flashcardId,
    ]);
    return true;
  }

  /**
   * Restore a previously removed public card to this user's study set.
   */
  async restorePublicCard(userId, flashcardId) {
    await this.database.query(this.constructor.queries.delete_public_card_removal, [
      userId,
      flashcardId,
    ]);
    return true;
  }

  /**
   * List public cards this user removed (for undo).
   */
  async getRemovedPublicCards(userId) {
    const result = await this.database.query(this.constructor.queries.select_removed_public_cards, [
      userId,
    ]);
    return result.rows;
  }

  /**
   * Set visibility (public/private) for multiple owned flashcards at once.
   * Only cards owned by ownerId are affected.
   * @returns {Promise<number>} Count of cards updated
   */
  async setFlashcardsVisibilityBatch(ownerId, flashcardIds, isPrivate) {
    const result = await this.database.query(
      this.constructor.queries.update_flashcards_visibility_batch,
      [isPrivate, ownerId, flashcardIds]
    );
    return result.rows.length;
  }

  /**
   * Share multiple flashcards with multiple recipients in one operation.
   * Attempts every flashcard/recipient pair; failures are collected per
   * pair rather than aborting the batch.
   * @param {string} ownerId - User ID who owns the flashcards
   * @param {string[]} flashcardIds - Flashcards to share
   * @param {Array<{user_id: string, username: string}>} recipients - Resolved recipients
   * @returns {Promise<{shared: number, failures: Array<{flashcardId: string, username: string, error: string}>}>}
   */
  async shareFlashcardsBatch(ownerId, flashcardIds, recipients) {
    const results = { shared: 0, failures: [] };

    for (const flashcardId of flashcardIds) {
      for (const recipient of recipients) {
        try {
          await this.shareFlashcard(flashcardId, ownerId, recipient.user_id);
          results.shared += 1;
        } catch (error) {
          results.failures.push({
            flashcardId,
            username: recipient.username,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  async shareFlashcard(flashcardId, ownerId, recipientId) {
    // Verify ownership
    const checkResult = await this.database.query(this.constructor.queries.select_flashcard_owner, [
      flashcardId,
    ]);

    if (checkResult.rows.length === 0 || checkResult.rows[0].created_by !== ownerId) {
      throw new Error('Not authorized to share this flashcard');
    }

    // Prevent sharing with self
    if (ownerId === recipientId) {
      throw new Error('Cannot share with yourself');
    }

    // Insert or update share (ON CONFLICT to handle existing shares)
    const result = await this.database.query(this.constructor.queries.upsert_flashcard_share, [
      ownerId,
      recipientId,
      flashcardId,
    ]);

    return result.rows[0];
  }

  /**
   * Revoke a flashcard share
   * @param {string} flashcardId - Flashcard ID
   * @param {string} ownerId - User ID who owns the flashcard
   * @param {string} recipientId - User ID who received the share
   * @returns {Promise<boolean>} True if revoked (share record deleted)
   */
  async revokeShare(flashcardId, ownerId, recipientId) {
    const result = await this.database.query(this.constructor.queries.revoke_flashcard_share, [
      flashcardId,
      ownerId,
      recipientId,
    ]);

    return result.rowCount > 0;
  }

  /**
   * Accept a shared flashcard
   * @param {string} shareId - Share ID
   * @param {string} recipientId - User ID accepting the share
   * @returns {Promise<object>} Updated share
   */
  async acceptShare(shareId, recipientId) {
    const result = await this.database.query(this.constructor.queries.accept_flashcard_share, [
      shareId,
      recipientId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Reject a shared flashcard
   * @param {string} shareId - Share ID
   * @param {string} recipientId - User ID rejecting the share
   * @returns {Promise<object>} Deleted share identifiers
   * Note: Rejection deletes the share record (not reported to the owner),
   * so the owner may share the card again later.
   */
  async rejectShare(shareId, recipientId) {
    const result = await this.database.query(this.constructor.queries.reject_flashcard_share, [
      shareId,
      recipientId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Get pending shares for a user
   * @param {string} recipientId - User ID
   * @returns {Promise<array>} Array of pending shares
   */
  async getPendingShares(recipientId) {
    const result = await this.database.query(this.constructor.queries.select_pending_shares, [
      recipientId,
    ]);

    return result.rows;
  }

  /**
   * Get accepted shares for a user
   * @param {string} recipientId - User ID
   * @returns {Promise<array>} Array of accepted shares
   */
  async getAcceptedShares(recipientId) {
    const result = await this.database.query(this.constructor.queries.select_accepted_shares, [
      recipientId,
    ]);

    return result.rows;
  }

  /**
   * Get all shares owned by a user (to see who they've shared with)
   * @param {string} ownerId - User ID
   * @returns {Promise<array>} Array of shares
   */
  async getOwnedShares(ownerId) {
    const result = await this.database.query(this.constructor.queries.select_owned_shares, [
      ownerId,
    ]);

    return result.rows;
  }

  /**
   * Get distinct classes visible to a user (owned or created)
   * @param {string} userId - User ID
   * @returns {Promise<array>} Array of class names
   */
  async getDistinctClasses(userId) {
    const result = await this.database.query(this.constructor.queries.select_distinct_classes, [
      userId,
    ]);
    return result.rows.map((row) => row.class);
  }

  /**
   * Get distinct lessons visible to a user (owned or created)
   * @param {string} userId - User ID
   * @returns {Promise<array>} Array of lesson names
   */
  async getDistinctLessons(userId) {
    const result = await this.database.query(this.constructor.queries.select_distinct_lessons, [
      userId,
    ]);
    return result.rows.map((row) => row.lesson);
  }

  /**
   * Get distinct categories visible to a user (owned or created)
   * @param {string} userId - User ID
   * @returns {Promise<array>} Array of category names
   */
  async getDistinctCategories(userId) {
    const result = await this.database.query(this.constructor.queries.select_distinct_categories, [
      userId,
    ]);
    return result.rows.map((row) => row.category);
  }

  /**
   * Get distinct lessons for a specific class visible to a user
   * @param {string} className - Class name
   * @param {string} userId - User ID
   * @returns {Promise<array>} Array of lesson names
   */
  async getDistinctLessonsForClass(className, userId) {
    const result = await this.database.query(
      this.constructor.queries.select_distinct_lessons_for_class,
      [className, userId]
    );
    return result.rows.map((row) => row.lesson);
  }
}

export const entriesService = new EntriesService();

export { EntriesService };
export default entriesService;
