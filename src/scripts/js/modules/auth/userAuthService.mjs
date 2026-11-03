/**
 * User Service Module
 * Handles identity operations through the IAM database and user-scoped
 * application data (cascade deletes, special right assignments) through
 * the application database.
 */

import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { validationService } from './validationService.mjs';

class UserAuthService {
  static queries = identityManagementDb.constructor.loadNamedSqlStatements(
    'pg/iam-user-queries.sql',
    identityManagementDb.constructor.sqlRoot
  );

  constructor(database = identityManagementDb) {
    this.database = database;
  }

  async createUser(username, email, password, fullName = null, isPublic = false) {
    const passwordHash = await validationService.hashPassword(password);
    const result = await this.database.query(this.constructor.queries.create_user, [
      username,
      email,
      passwordHash,
      fullName,
      isPublic,
    ]);

    const user = result.rows[0];
    await this.assignRole(user.user_id, 'user');
    return user;
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

  /**
   * Delete an identity. Every application's data that references the user is
   * removed by its foreign keys to iam.users (ON DELETE CASCADE); the IAM never
   * touches application tables (CODING_STANDARDS 0.8).
   */
  async deleteUser(userId) {
    await this.database.query(this.constructor.queries.delete_user, [userId]);
    return true;
  }

  /**
   * Usernames and display names for a set of user ids (for apps that show
   * who owns or shared something). Returns Map<user_id, {username, full_name}>.
   */
  async getUserSummaries(userIds) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return new Map();
    const result = await this.database.query(this.constructor.queries.get_user_summaries, [ids]);
    return new Map(result.rows.map((row) => [row.user_id, row]));
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
    await this.assignRole(userId, 'admin');
  }

  async assignRole(userId, roleName) {
    await this.database.query(this.constructor.queries.assign_role, [userId, roleName]);
  }

  async revokeRole(userId, roleName) {
    await this.database.query(this.constructor.queries.revoke_role, [userId, roleName]);
  }

  async getUserRoles(userId) {
    const result = await this.database.query(this.constructor.queries.get_user_roles, [userId]);
    return result.rows.map((row) => row.role_name);
  }

  /**
   * Effective rights: rights granted through IAM roles, overridden by any
   * user-specific overrides (user_rights), all within the IAM.
   */
  async getUserRights(userId) {
    const roleResult = await this.database.query(this.constructor.queries.get_role_rights, [
      userId,
    ]);
    const rights = new Set(roleResult.rows.map((row) => row.right_key));

    const overrideResult = await this.database.query(this.constructor.queries.get_user_rights, [
      userId,
    ]);
    for (const row of overrideResult.rows) {
      if (row.granted) {
        rights.add(row.right_key);
      } else {
        rights.delete(row.right_key);
      }
    }

    return [...rights].sort();
  }

  async grantUserRight(userId, rightKey, granted = true) {
    await this.database.query(this.constructor.queries.grant_user_right, [
      userId,
      rightKey,
      granted,
    ]);
  }

  async revokeUserRight(userId, rightKey) {
    await this.database.query(this.constructor.queries.revoke_user_right, [userId, rightKey]);
  }

  async updateUserPassword(userId, newPassword) {
    const passwordHash = await validationService.hashPassword(newPassword);
    const result = await this.database.query(this.constructor.queries.update_user_password, [
      passwordHash,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async findUserByUsernameInsensitive(username) {
    const result = await this.database.query(
      this.constructor.queries.find_user_by_username_insensitive,
      [username]
    );
    return result.rows[0] || null;
  }

  async getPublicUsers() {
    const result = await this.database.query(this.constructor.queries.get_public_users);
    return result.rows;
  }

  async setUserVisibility(userId, isPublic) {
    const result = await this.database.query(this.constructor.queries.update_user_visibility, [
      isPublic,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async getStorageLimit(userId) {
    const result = await this.database.query(this.constructor.queries.get_storage_limit, [userId]);
    return result.rows[0] ? parseInt(result.rows[0].storage_max_bytes) : null;
  }

  async setStorageLimit(userId, maxBytes) {
    const result = await this.database.query(this.constructor.queries.update_storage_limit, [
      maxBytes,
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
