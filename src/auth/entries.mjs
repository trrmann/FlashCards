/**
 * Entries/Flashcards Service Module
 * Handles flashcard CRUD operations and sharing
 */

import { query } from '../db/connection.mjs';

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
export async function createFlashcard(
  userId,
  question,
  answer,
  lesson = null,
  category = null,
  flashClass = null
) {
  const result = await query(
    `INSERT INTO flashcards (user_id, question, answer, created_by, lesson, category, class, is_private)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING flashcard_id, question, answer, lesson, category, class, is_private, created_at`,
    [userId, question, answer, userId, lesson, category, flashClass]
  );

  return result.rows[0];
}

/**
 * Get user's own flashcards
 * @param {string} userId - User ID
 * @returns {Promise<array>} Array of flashcards
 */
export async function getUserFlashcards(userId) {
  const result = await query(
    `SELECT flashcard_id, question, answer, lesson, category, class, is_private, created_at
     FROM flashcards 
     WHERE created_by = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * Get a specific flashcard
 * @param {string} flashcardId - Flashcard ID
 * @param {string} userId - User ID (to check ownership/sharing)
 * @returns {Promise<object>} Flashcard object or null
 */
export async function getFlashcard(flashcardId, userId) {
  const result = await query(
    `SELECT f.flashcard_id, f.question, f.answer, f.lesson, f.category, f.class, f.is_private, f.created_by, f.created_at,
            u.username, u.full_name
     FROM flashcards f
     LEFT JOIN users u ON f.created_by = u.user_id
     WHERE f.flashcard_id = $1
       AND (f.created_by = $2 OR EXISTS (
         SELECT 1 FROM flashcard_shares 
         WHERE flashcard_id = $1 
           AND recipient_id = $2 
           AND status != 'revoked'
           AND recipient_status = 'accepted'
       ))`,
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
export async function updateFlashcard(flashcardId, userId, updates) {
  // Verify ownership
  const checkResult = await query('SELECT created_by FROM flashcards WHERE flashcard_id = $1', [
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
    return getFlashcard(flashcardId, userId);
  }

  values.push(flashcardId);

  const result = await query(
    `UPDATE flashcards SET ${fields.join(', ')} WHERE flashcard_id = $${paramCount}
     RETURNING flashcard_id, question, answer, lesson, category, class, is_private, created_at`,
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
export async function deleteFlashcard(flashcardId, userId) {
  const result = await query('DELETE FROM flashcards WHERE flashcard_id = $1 AND created_by = $2', [
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
export async function shareFlashcard(flashcardId, ownerId, recipientId) {
  // Verify ownership
  const checkResult = await query('SELECT created_by FROM flashcards WHERE flashcard_id = $1', [
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
  const result = await query(
    `INSERT INTO flashcard_shares (owner_id, recipient_id, flashcard_id, status, recipient_status)
     VALUES ($1, $2, $3, 'active', 'pending')
     ON CONFLICT (owner_id, recipient_id, flashcard_id) 
     DO UPDATE SET status = 'active', recipient_status = COALESCE(flashcard_shares.recipient_status, 'pending')
     RETURNING share_id, owner_id, recipient_id, flashcard_id, status, recipient_status, shared_at`,
    [ownerId, recipientId, flashcardId]
  );

  return result.rows[0];
}

/**
 * Revoke a flashcard share
 * @param {string} flashcardId - Flashcard ID
 * @param {string} ownerId - User ID who owns the flashcard
 * @param {string} recipientId - User ID who received the share
 * @returns {Promise<boolean>} True if revoked
 */
export async function revokeShare(flashcardId, ownerId, recipientId) {
  const result = await query(
    `UPDATE flashcard_shares 
     SET status = 'revoked', revoked_at = NOW()
     WHERE flashcard_id = $1 AND owner_id = $2 AND recipient_id = $3`,
    [flashcardId, ownerId, recipientId]
  );

  return result.rowCount > 0;
}

/**
 * Accept a shared flashcard
 * @param {string} shareId - Share ID
 * @param {string} recipientId - User ID accepting the share
 * @returns {Promise<object>} Updated share
 */
export async function acceptShare(shareId, recipientId) {
  const result = await query(
    `UPDATE flashcard_shares 
     SET recipient_status = 'accepted', accepted_at = NOW()
     WHERE share_id = $1 AND recipient_id = $2
     RETURNING share_id, owner_id, recipient_id, flashcard_id, status, recipient_status`,
    [shareId, recipientId]
  );

  return result.rows[0] || null;
}

/**
 * Reject a shared flashcard
 * @param {string} shareId - Share ID
 * @param {string} recipientId - User ID rejecting the share
 * @returns {Promise<object>} Updated share
 * Note: Rejection is not reported back to owner
 */
export async function rejectShare(shareId, recipientId) {
  const result = await query(
    `UPDATE flashcard_shares 
     SET recipient_status = 'rejected', rejected_at = NOW()
     WHERE share_id = $1 AND recipient_id = $2
     RETURNING share_id, owner_id, recipient_id, flashcard_id, status, recipient_status`,
    [shareId, recipientId]
  );

  return result.rows[0] || null;
}

/**
 * Get pending shares for a user
 * @param {string} recipientId - User ID
 * @returns {Promise<array>} Array of pending shares
 */
export async function getPendingShares(recipientId) {
  const result = await query(
    `SELECT fs.share_id, fs.owner_id, fs.flashcard_id, fs.recipient_status, fs.shared_at,
            u.username, u.full_name,
            f.question, f.answer, f.lesson
     FROM flashcard_shares fs
     JOIN users u ON fs.owner_id = u.user_id
     JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
     WHERE fs.recipient_id = $1 
       AND fs.status != 'revoked'
       AND fs.recipient_status = 'pending'
     ORDER BY fs.shared_at DESC`,
    [recipientId]
  );

  return result.rows;
}

/**
 * Get accepted shares for a user
 * @param {string} recipientId - User ID
 * @returns {Promise<array>} Array of accepted shares
 */
export async function getAcceptedShares(recipientId) {
  const result = await query(
    `SELECT fs.share_id, fs.owner_id, fs.flashcard_id, fs.recipient_status, fs.accepted_at,
            u.username, u.full_name,
            f.question, f.answer, f.lesson, f.created_at
     FROM flashcard_shares fs
     JOIN users u ON fs.owner_id = u.user_id
     JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
     WHERE fs.recipient_id = $1 
       AND fs.status != 'revoked'
       AND fs.recipient_status = 'accepted'
     ORDER BY fs.accepted_at DESC`,
    [recipientId]
  );

  return result.rows;
}

/**
 * Get all shares owned by a user (to see who they've shared with)
 * @param {string} ownerId - User ID
 * @returns {Promise<array>} Array of shares
 */
export async function getOwnedShares(ownerId) {
  const result = await query(
    `SELECT fs.share_id, fs.recipient_id, fs.flashcard_id, fs.status, fs.recipient_status, fs.shared_at,
            u.username, u.full_name,
            f.question, f.answer
     FROM flashcard_shares fs
     JOIN users u ON fs.recipient_id = u.user_id
     JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
     WHERE fs.owner_id = $1
     ORDER BY fs.shared_at DESC`,
    [ownerId]
  );

  return result.rows;
}
