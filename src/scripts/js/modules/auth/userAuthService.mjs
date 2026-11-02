/**
 * User Service Module
 * Handles user-related database operations
 */

import { flashCardsDb } from '../db/flashCardsDatabase.mjs';
import { validationService } from './validationService.mjs';

class UserAuthService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/auth-user-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  async createUser(username, email, password, fullName = null) {
    const passwordHash = await validationService.hashPassword(password);
    const result = await this.database.query(this.constructor.queries.create_user, [
      username,
      email,
      passwordHash,
      fullName,
    ]);

    return result.rows[0];
  }

  async findUserByUsername(username) {
    const result = await this.database.query(this.constructor.queries.find_user_by_username, [
      username,
    ]);
    return result.rows[0] || null;
  }

  async findUserByEmail(email) {
    const result = await this.database.query(this.constructor.queries.find_user_by_email, [email]);
    return result.rows[0] || null;
  }

  async findUserById(userId) {
    const result = await this.database.query(this.constructor.queries.find_user_by_id, [userId]);
    return result.rows[0] || null;
  }

  async authenticateUser(username, password) {
    const user = await this.findUserByUsername(username);

    if (!user || user.status !== 'active') {
      return null;
    }

    const passwordMatch = await validationService.comparePassword(password, user.password_hash);

    if (!passwordMatch) {
      return null;
    }

    const userWithoutPassword = { ...user };
    delete userWithoutPassword.password_hash;
    return userWithoutPassword;
  }

  async updateUserProfile(userId, updates) {
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
      return this.findUserById(userId);
    }

    const updateTemplate = this.constructor.queries.update_user_profile_template;
    const query = updateTemplate
      .replace('{{columns}}', [...fields, 'updated_at = NOW()'].join(', '))
      .replace('{{user_id}}', `$${paramCount}`);

    values.push(userId);

    const result = await this.database.query(query, values);
    return result.rows[0];
  }

  async getAllUsers() {
    const result = await this.database.query(this.constructor.queries.get_all_users);
    return result.rows;
  }

  async disableUser(userId) {
    const result = await this.database.query(this.constructor.queries.disable_user, [
      'disabled',
      userId,
    ]);
    return result.rows[0];
  }

  async enableUser(userId) {
    const result = await this.database.query(this.constructor.queries.enable_user, [
      'active',
      userId,
    ]);
    return result.rows[0];
  }

  async deleteUser(userId) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');
      await client.query(this.constructor.queries.delete_import_export_logs, [userId]);
      await client.query(this.constructor.queries.delete_quiz_results, [userId]);
      await client.query(this.constructor.queries.delete_quiz_questions, [userId]);
      await client.query(this.constructor.queries.delete_quizzes, [userId]);
      await client.query(this.constructor.queries.delete_leitner_boxes, [userId]);
      await client.query(this.constructor.queries.delete_flashcards, [userId]);
      await client.query(this.constructor.queries.delete_user, [userId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async isAdmin(userId) {
    const result = await this.database.query(this.constructor.queries.get_is_admin, [userId]);
    return result.rows.length > 0 && result.rows[0].is_admin;
  }

  async updateLastPageVisited(userId, page) {
    const result = await this.database.query(this.constructor.queries.update_last_page_visited, [
      page,
      userId,
    ]);
    return result.rows[0]?.last_page_visited || '/';
  }

  async getLastPageVisited(userId) {
    const result = await this.database.query(this.constructor.queries.get_last_page_visited, [
      userId,
    ]);
    return result.rows[0]?.last_page_visited || '/';
  }

  async isUsernameAvailable(username) {
    const user = await this.findUserByUsername(username);
    return !user;
  }

  async isEmailAvailable(email) {
    const user = await this.findUserByEmail(email);
    return !user;
  }

  async countUsers() {
    const result = await this.database.query(this.constructor.queries.count_users);
    return parseInt(result.rows[0].count, 10);
  }

  async setUserAdmin(userId) {
    await this.database.query(this.constructor.queries.set_user_admin, [userId]);
  }

  async updateUserPassword(userId, newPassword) {
    const passwordHash = await validationService.hashPassword(newPassword);
    const result = await this.database.query(this.constructor.queries.update_user_password, [
      passwordHash,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async getUserDisplayInfo(userId) {
    const result = await this.database.query(this.constructor.queries.get_user_display, [userId]);
    return result.rows[0] || null;
  }
}

export const userAuthService = new UserAuthService();

export { UserAuthService };
export default userAuthService;
