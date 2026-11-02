/**
 * User Service Module
 * Handles user-related database operations
 */

import { flashCardsDb } from '../db/flashCardsDb.mjs';
import { hashPassword, comparePassword } from './validator.mjs';

const authQueryStatements = flashCardsDb.constructor.loadSqlStatements(
  'pg/auth-user-queries.sql',
  flashCardsDb.constructor.sqlRoot
);

const authSqlQueries = {
  create_user: authQueryStatements[0],
  find_user_by_username: authQueryStatements[1],
  find_user_by_email: authQueryStatements[2],
  find_user_by_id: authQueryStatements[3],
  update_user_profile_template: authQueryStatements[4],
  get_all_users: authQueryStatements[5],
  disable_user: authQueryStatements[6],
  enable_user: authQueryStatements[7],
  delete_import_export_logs: authQueryStatements[8],
  delete_quiz_results: authQueryStatements[9],
  delete_quiz_questions: authQueryStatements[10],
  delete_quizzes: authQueryStatements[11],
  delete_leitner_boxes: authQueryStatements[12],
  delete_flashcards: authQueryStatements[13],
  delete_user: authQueryStatements[14],
  get_is_admin: authQueryStatements[15],
  update_last_page_visited: authQueryStatements[16],
  get_last_page_visited: authQueryStatements[17],
};

class UserAuthService {
  constructor(database = flashCardsDb) {
    this.database = database;
  }

  async createUser(username, email, password, fullName = null) {
    const passwordHash = await hashPassword(password);
    const result = await this.database.query(authSqlQueries.create_user, [
      username,
      email,
      passwordHash,
      fullName,
    ]);

    return result.rows[0];
  }

  async findUserByUsername(username) {
    const result = await this.database.query(authSqlQueries.find_user_by_username, [username]);
    return result.rows[0] || null;
  }

  async findUserByEmail(email) {
    const result = await this.database.query(authSqlQueries.find_user_by_email, [email]);
    return result.rows[0] || null;
  }

  async findUserById(userId) {
    const result = await this.database.query(authSqlQueries.find_user_by_id, [userId]);
    return result.rows[0] || null;
  }

  async authenticateUser(username, password) {
    const user = await this.findUserByUsername(username);

    if (!user || user.status !== 'active') {
      return null;
    }

    const passwordMatch = await comparePassword(password, user.password_hash);

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

    const updateTemplate = authSqlQueries.update_user_profile_template;
    const query = updateTemplate
      .replace('{{columns}}', [...fields, 'updated_at = NOW()'].join(', '))
      .replace('{{user_id}}', `$${paramCount}`);

    values.push(userId);

    const result = await this.database.query(query, values);
    return result.rows[0];
  }

  async getAllUsers() {
    const result = await this.database.query(authSqlQueries.get_all_users);
    return result.rows;
  }

  async disableUser(userId) {
    const result = await this.database.query(authSqlQueries.disable_user, ['disabled', userId]);
    return result.rows[0];
  }

  async enableUser(userId) {
    const result = await this.database.query(authSqlQueries.enable_user, ['active', userId]);
    return result.rows[0];
  }

  async deleteUser(userId) {
    const client = await this.database.getClient();

    try {
      await client.query('BEGIN');
      await client.query(authSqlQueries.delete_import_export_logs, [userId]);
      await client.query(authSqlQueries.delete_quiz_results, [userId]);
      await client.query(authSqlQueries.delete_quiz_questions, [userId]);
      await client.query(authSqlQueries.delete_quizzes, [userId]);
      await client.query(authSqlQueries.delete_leitner_boxes, [userId]);
      await client.query(authSqlQueries.delete_flashcards, [userId]);
      await client.query(authSqlQueries.delete_user, [userId]);
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
    const result = await this.database.query(authSqlQueries.get_is_admin, [userId]);
    return result.rows.length > 0 && result.rows[0].is_admin;
  }

  async updateLastPageVisited(userId, page) {
    const result = await this.database.query(authSqlQueries.update_last_page_visited, [
      page,
      userId,
    ]);
    return result.rows[0]?.last_page_visited || '/';
  }

  async getLastPageVisited(userId) {
    const result = await this.database.query(authSqlQueries.get_last_page_visited, [userId]);
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
}

export const userAuthService = new UserAuthService();

export { UserAuthService };
export default userAuthService;
