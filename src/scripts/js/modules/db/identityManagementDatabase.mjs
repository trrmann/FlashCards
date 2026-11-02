/**
 * Identity and Access Management PostgreSQL adapter.
 * Owns the identity tables: users, roles, rights, role_rights, user_roles,
 * and the session store. Handles user and role management up to the
 * assignment of rights to roles; user-specific special right assignments
 * are owned by the application database (user_rights).
 */

import { PostgresDatabase } from './postgresDatabase.mjs';

export class IdentityManagementDatabase extends PostgresDatabase {
  static sqlRoot = PostgresDatabase.sqlRoot;

  constructor(config = {}) {
    super(config);
  }

  async initializeSchema() {
    return this.initializeSchemaFromFile(
      'pg/iam-postgres-schema.sql',
      'IAM Database Initialization'
    );
  }
}

export const identityManagementDb = new IdentityManagementDatabase();
export default identityManagementDb;
