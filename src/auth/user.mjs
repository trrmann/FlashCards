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
    'SELECT user_id, username, email, full_name, created_at, updated_at FROM users WHERE user_id = $1',
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

  if (!user) {
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
     RETURNING user_id, username, email, full_name, created_at, updated_at`,
    values
  );

  return result.rows[0];
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
