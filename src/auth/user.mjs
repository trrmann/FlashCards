/**
 * User Service Module
 * Handles user-related database operations
 */

import { query } from '../db/connection.mjs';
import { hashPassword, comparePassword } from './validator.mjs';

/**
 * Create a new user
 * @param {string} username - User's username
 * @param {string} email - User's email
 * @param {string} password - Plain text password
 * @param {string} fullName - User's full name (optional)
 * @returns {Promise<object>} User object (without password)
 * @throws {Error} If user creation fails
 */
export async function createUser(username, email, password, fullName = null) {
  const passwordHash = await hashPassword(password);

  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, username, email, full_name, created_at`,
    [username, email, passwordHash, fullName]
  );

  return result.rows[0];
}

/**
 * Find user by username
 * @param {string} username - Username to search for
 * @returns {Promise<object|null>} User object or null if not found
 */
export async function findUserByUsername(username) {
  const result = await query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

/**
 * Find user by email
 * @param {string} email - Email to search for
 * @returns {Promise<object|null>} User object or null if not found
 */
export async function findUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User object (without password) or null
 */
export async function findUserById(userId) {
  const result = await query(
    'SELECT user_id, username, email, full_name, is_admin, status, created_at, updated_at FROM users WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Authenticate user with username and password
 * @param {string} username - User's username
 * @param {string} password - Plain text password
 * @returns {Promise<object|null>} User object (without password) on success, null on failure
 */
export async function authenticateUser(username, password) {
  const user = await findUserByUsername(username);

  if (!user || user.status !== 'active') {
    return null;
  }

  const passwordMatch = await comparePassword(password, user.password_hash);

  if (!passwordMatch) {
    return null;
  }

  // Return user without password hash
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} updates - Object with fields to update (full_name, email, etc.)
 * @returns {Promise<object>} Updated user object (without password)
 */
export async function updateUserProfile(userId, updates) {
  const allowedFields = ['full_name', 'email'];
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
    return findUserById(userId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${paramCount} 
     RETURNING user_id, username, email, full_name, is_admin, status, created_at, updated_at`,
    values
  );

  return result.rows[0];
}

/**
 * Get all users (admin only)
 * @returns {Promise<array>} Array of all users without passwords
 */
export async function getAllUsers() {
  const result = await query(
    'SELECT user_id, username, email, full_name, is_admin, status, created_at FROM users ORDER BY created_at'
  );
  return result.rows;
}

/**
 * Disable a user (admin only)
 * @param {string} userId - User ID to disable
 * @returns {Promise<object>} Updated user object
 */
export async function disableUser(userId) {
  const result = await query(
    'UPDATE users SET status = $1 WHERE user_id = $2 RETURNING user_id, username, email, full_name, is_admin, status, created_at',
    ['disabled', userId]
  );
  return result.rows[0];
}

/**
 * Enable a user (admin only)
 * @param {string} userId - User ID to enable
 * @returns {Promise<object>} Updated user object
 */
export async function enableUser(userId) {
  const result = await query(
    'UPDATE users SET status = $1 WHERE user_id = $2 RETURNING user_id, username, email, full_name, is_admin, status, created_at',
    ['active', userId]
  );
  return result.rows[0];
}

/**
 * Delete a user and all related data (admin only)
 * Cascades delete to all related tables
 * @param {string} userId - User ID to delete
 * @returns {Promise<boolean>} True if deletion successful
 */
export async function deleteUser(userId) {
  const client = await (await import('../db/connection.mjs')).getClient();

  try {
    await client.query('BEGIN');

    // Delete in order of foreign key dependencies
    await client.query('DELETE FROM import_export_logs WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM quiz_results WHERE user_id = $1', [userId]);
    await client.query(
      'DELETE FROM quiz_questions WHERE quiz_id IN (SELECT quiz_id FROM quizzes WHERE user_id = $1)',
      [userId]
    );
    await client.query('DELETE FROM quizzes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM leitner_boxes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM flashcards WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if user is admin
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if user is admin
 */
export async function isAdmin(userId) {
  const result = await query('SELECT is_admin FROM users WHERE user_id = $1', [userId]);
  return result.rows.length > 0 && result.rows[0].is_admin;
}

/**
 * Check if username is available
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if username is available
 */
export async function isUsernameAvailable(username) {
  const user = await findUserByUsername(username);
  return !user;
}

/**
 * Check if email is available
 * @param {string} email - Email to check
 * @returns {Promise<boolean>} True if email is available
 */
export async function isEmailAvailable(email) {
  const user = await findUserByEmail(email);
  return !user;
}
