/**
 * Organization Service (IAM domain)
 * Organizations, their members (owner / admin / member), groups inside an
 * organization, group membership, and roles held by groups.
 *
 * Who may do what (IAM_MULTI_APP_DESIGN.md, owner-approved):
 * - Platform admins: everything, and they alone create or delete organizations.
 * - Organization owners and admins: manage that organization's members and groups.
 *   Only owners (or platform admins) grant or remove the owner role, and an
 *   organization always keeps at least one owner.
 * - Roles held by groups grant application permissions, so only platform admins
 *   or that application's admins may change them.
 * Non-members get 404 for an organization, so its existence is not revealed.
 */

import { identityManagementDb } from '../db/identityManagementDatabase.mjs';
import { userAuthService } from './userAuthService.mjs';

/**
 * An expected failure with the HTTP status the router should return.
 */
export class IamError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class OrganizationService {
  static queries = identityManagementDb.constructor.loadNamedSqlStatements(
    'pg/iam-organization-queries.sql',
    identityManagementDb.constructor.sqlRoot
  );

  static ORG_ROLES = ['owner', 'admin', 'member'];
  static MANAGER_ROLES = ['owner', 'admin'];
  static STATUSES = ['active', 'disabled'];
  static SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$/;
  static UNIQUE_VIOLATION = '23505';

  constructor(database = identityManagementDb, users = userAuthService) {
    this.database = database;
    this.users = users;
  }

  // ------------------------------------------------------------------ helpers

  async queryRows(name, params) {
    const result = await this.database.query(this.constructor.queries[name], params);
    return result.rows;
  }

  async queryRow(name, params) {
    const rows = await this.queryRows(name, params);
    return rows[0] || null;
  }

  /**
   * Run an insert/update and turn a unique-constraint violation into a 409.
   */
  async uniqueWrite(name, params, conflictMessage) {
    try {
      return await this.queryRow(name, params);
    } catch (error) {
      if (error.code === this.constructor.UNIQUE_VIOLATION)
        throw new IamError(409, conflictMessage);
      throw error;
    }
  }

  requireText(value, label, max = 255) {
    const text = String(value ?? '').trim();
    if (!text || text.length > max) {
      throw new IamError(400, `${label} is required (1–${max} characters)`);
    }
    return text;
  }

  optionalText(value, label, max = 255) {
    return value === undefined || value === null ? null : this.requireText(value, label, max);
  }

  validateOrgRole(orgRole) {
    if (!this.constructor.ORG_ROLES.includes(orgRole)) {
      throw new IamError(400, `orgRole must be one of: ${this.constructor.ORG_ROLES.join(', ')}`);
    }
    return orgRole;
  }

  async findUserByUsername(username) {
    const user = await this.users.findUserByUsernameInsensitive(String(username ?? '').trim());
    if (!user) throw new IamError(404, `User not found: ${username}`);
    return user;
  }

  // ------------------------------------------------------------ authorization

  async requirePlatformAdmin(actorId) {
    if (!(await this.users.isPlatformAdmin(actorId))) {
      throw new IamError(403, 'Platform administrator privileges required');
    }
  }

  /**
   * Load an organization with the actor's relationship to it.
   * Non-members who are not platform admins get 404.
   */
  async orgContext(actorId, orgId) {
    const org = await this.queryRow('get_organization', [orgId]);
    const platformAdmin = await this.users.isPlatformAdmin(actorId);
    const membership = org ? await this.queryRow('get_org_role', [orgId, actorId]) : null;
    if (!org || (!membership && !platformAdmin)) {
      throw new IamError(404, 'Organization not found');
    }
    return { org, role: membership?.org_role || null, platformAdmin };
  }

  requireManager(context) {
    if (!context.platformAdmin && !this.constructor.MANAGER_ROLES.includes(context.role)) {
      throw new IamError(403, 'Organization owner or admin privileges required');
    }
  }

  requireOwner(context) {
    if (!context.platformAdmin && context.role !== 'owner') {
      throw new IamError(403, 'Organization owner privileges required');
    }
  }

  async groupContext(actorId, groupId) {
    const group = await this.queryRow('get_group', [groupId]);
    if (!group) throw new IamError(404, 'Group not found');
    const context = await this.orgContext(actorId, group.org_id);
    return { ...context, group };
  }

  // ------------------------------------------------------------ organizations

  async listOrganizations(actorId) {
    const all = await this.users.isPlatformAdmin(actorId);
    return {
      isPlatformAdmin: all,
      organizations: await this.queryRows(
        all ? 'list_all_organizations' : 'list_member_organizations',
        [actorId]
      ),
    };
  }

  /**
   * Platform admins only. The owner is `ownerUsername` if given, else the actor.
   */
  async createOrganization(actorId, { name, slug, ownerUsername }) {
    await this.requirePlatformAdmin(actorId);
    const orgName = this.requireText(name, 'name');
    const orgSlug = String(slug ?? '')
      .trim()
      .toLowerCase();
    if (!this.constructor.SLUG_PATTERN.test(orgSlug)) {
      throw new IamError(
        400,
        'slug must be 3–100 characters: lowercase letters, digits, and hyphens (not at the ends)'
      );
    }
    const owner = ownerUsername
      ? await this.findUserByUsername(ownerUsername)
      : { user_id: actorId };

    try {
      return await this.database.withTransaction(async (client) => {
        const created = await client.query(this.constructor.queries.insert_organization, [
          orgName,
          orgSlug,
          actorId,
        ]);
        const org = created.rows[0];
        await client.query(this.constructor.queries.insert_org_member, [
          org.org_id,
          owner.user_id,
          'owner',
        ]);
        return org;
      });
    } catch (error) {
      if (error.code === this.constructor.UNIQUE_VIOLATION) {
        throw new IamError(409, `An organization with slug "${orgSlug}" already exists`);
      }
      throw error;
    }
  }

  async updateOrganization(actorId, orgId, { name, status }) {
    const context = await this.orgContext(actorId, orgId);
    this.requireManager(context);
    if (status !== undefined && !this.constructor.STATUSES.includes(status)) {
      throw new IamError(400, `status must be one of: ${this.constructor.STATUSES.join(', ')}`);
    }
    return this.queryRow('update_organization', [
      orgId,
      this.optionalText(name, 'name'),
      status ?? null,
    ]);
  }

  async deleteOrganization(actorId, orgId) {
    await this.requirePlatformAdmin(actorId);
    const org = await this.queryRow('get_organization', [orgId]);
    if (!org) throw new IamError(404, 'Organization not found');
    await this.queryRows('delete_organization', [orgId]);
  }

  // ------------------------------------------------------------------ members

  async listMembers(actorId, orgId) {
    await this.orgContext(actorId, orgId);
    return this.queryRows('list_org_members', [orgId]);
  }

  async addMember(actorId, orgId, { username, orgRole = 'member' }) {
    const context = await this.orgContext(actorId, orgId);
    this.requireManager(context);
    const role = this.validateOrgRole(orgRole);
    if (role === 'owner') this.requireOwner(context);
    const user = await this.findUserByUsername(username);
    const member = await this.queryRow('insert_org_member', [orgId, user.user_id, role]);
    if (!member) throw new IamError(409, `${user.username} is already a member`);
    return member;
  }

  async assertNotLastOwner(orgId, userId) {
    const current = await this.queryRow('get_org_role', [orgId, userId]);
    if (current?.org_role !== 'owner') return;
    const { owners } = await this.queryRow('count_org_owners', [orgId]);
    if (parseInt(owners, 10) <= 1) {
      throw new IamError(409, 'An organization must keep at least one owner');
    }
  }

  async updateMemberRole(actorId, orgId, userId, { orgRole }) {
    const context = await this.orgContext(actorId, orgId);
    this.requireManager(context);
    const role = this.validateOrgRole(orgRole);
    const current = await this.queryRow('get_org_role', [orgId, userId]);
    if (!current) throw new IamError(404, 'Member not found');
    if (role === 'owner' || current.org_role === 'owner') this.requireOwner(context);
    if (role !== 'owner') await this.assertNotLastOwner(orgId, userId);
    return this.queryRow('update_org_member_role', [orgId, userId, role]);
  }

  /**
   * Remove a member, and remove them from the organization's groups too.
   */
  async removeMember(actorId, orgId, userId) {
    const context = await this.orgContext(actorId, orgId);
    this.requireManager(context);
    const current = await this.queryRow('get_org_role', [orgId, userId]);
    if (!current) throw new IamError(404, 'Member not found');
    if (current.org_role === 'owner') this.requireOwner(context);
    await this.assertNotLastOwner(orgId, userId);

    await this.database.withTransaction(async (client) => {
      await client.query(this.constructor.queries.delete_member_from_org_groups, [orgId, userId]);
      await client.query(this.constructor.queries.delete_org_member, [orgId, userId]);
    });
  }

  // ------------------------------------------------------------------- groups

  async listGroups(actorId, orgId) {
    await this.orgContext(actorId, orgId);
    return this.queryRows('list_org_groups', [orgId]);
  }

  async createGroup(actorId, orgId, { name, description }) {
    const context = await this.orgContext(actorId, orgId);
    this.requireManager(context);
    return this.uniqueWrite(
      'insert_group',
      [orgId, this.requireText(name, 'name'), this.optionalText(description, 'description', 2000)],
      `A group named "${String(name).trim()}" already exists in this organization`
    );
  }

  async updateGroup(actorId, groupId, { name, description }) {
    const context = await this.groupContext(actorId, groupId);
    this.requireManager(context);
    return this.uniqueWrite(
      'update_group',
      [
        groupId,
        this.optionalText(name, 'name'),
        this.optionalText(description, 'description', 2000),
      ],
      `A group named "${String(name).trim()}" already exists in this organization`
    );
  }

  async deleteGroup(actorId, groupId) {
    const context = await this.groupContext(actorId, groupId);
    this.requireManager(context);
    await this.queryRows('delete_group', [groupId]);
  }

  async listGroupMembers(actorId, groupId) {
    await this.groupContext(actorId, groupId);
    return this.queryRows('list_group_members', [groupId]);
  }

  async addGroupMember(actorId, groupId, { username }) {
    const context = await this.groupContext(actorId, groupId);
    this.requireManager(context);
    const user = await this.findUserByUsername(username);
    const membership = await this.queryRow('get_org_role', [context.group.org_id, user.user_id]);
    if (!membership) {
      throw new IamError(400, `${user.username} must be a member of the organization first`);
    }
    const added = await this.queryRow('insert_group_member', [groupId, user.user_id]);
    if (!added) throw new IamError(409, `${user.username} is already in this group`);
    return added;
  }

  async removeGroupMember(actorId, groupId, userId) {
    const context = await this.groupContext(actorId, groupId);
    this.requireManager(context);
    await this.queryRows('delete_group_member', [groupId, userId]);
  }

  // --------------------------------------------------------------- group roles

  async listGroupRoles(actorId, groupId) {
    await this.groupContext(actorId, groupId);
    return this.queryRows('list_group_roles', [groupId]);
  }

  /**
   * Roles grant application permissions: platform admins, or admins of the
   * role's application, only. Platform-wide roles: platform admins only.
   */
  async requireRoleAuthority(actorId, appKey) {
    const allowed = appKey
      ? await this.users.isAdmin(actorId, appKey)
      : await this.users.isPlatformAdmin(actorId);
    if (!allowed) {
      throw new IamError(
        403,
        `Only ${appKey ? `${appKey} admins or ` : ''}platform admins can change this role`
      );
    }
  }

  async grantGroupRole(actorId, groupId, { appKey = null, roleName }) {
    await this.groupContext(actorId, groupId);
    const role = await this.users.findRole(appKey || null, String(roleName ?? '').trim());
    if (!role) throw new IamError(404, `Role not found: ${appKey ? `${appKey}/` : ''}${roleName}`);
    await this.requireRoleAuthority(actorId, role.app_key);
    const granted = await this.queryRow('insert_group_role', [groupId, role.role_id]);
    if (!granted) throw new IamError(409, 'The group already holds this role');
    return { ...granted, role_name: role.role_name, app_key: role.app_key };
  }

  async revokeGroupRole(actorId, groupId, roleId) {
    await this.groupContext(actorId, groupId);
    const role = await this.queryRow('get_group_role', [groupId, roleId]);
    if (!role) throw new IamError(404, 'The group does not hold this role');
    await this.requireRoleAuthority(actorId, role.app_key);
    await this.queryRows('delete_group_role', [groupId, roleId]);
  }

  // ---------------------------------------------- platform admins / app access

  async setPlatformAdmin(actorId, userId, grant) {
    await this.requirePlatformAdmin(actorId);
    if (!grant && actorId === userId) {
      throw new IamError(400, 'You cannot remove your own platform admin role');
    }
    const user = await this.users.findUserById(userId);
    if (!user) throw new IamError(404, 'User not found');
    if (grant) await this.users.assignRole(userId, 'platform_admin', null);
    else await this.users.revokeRole(userId, 'platform_admin', null);
    return { user_id: userId, username: user.username, isPlatformAdmin: grant };
  }

  async listApplications(actorId) {
    await this.requirePlatformAdmin(actorId);
    return this.users.listApplications();
  }

  /**
   * Enable or disable a user's access to an application (platform admins or that app's admins).
   */
  async setAppAccess(actorId, appKey, userId, { status }) {
    if (!(await this.users.isAdmin(actorId, appKey))) {
      throw new IamError(403, `Only ${appKey} admins or platform admins can change access`);
    }
    if (!this.constructor.STATUSES.includes(status)) {
      throw new IamError(400, `status must be one of: ${this.constructor.STATUSES.join(', ')}`);
    }
    if (actorId === userId && status !== 'active') {
      throw new IamError(400, 'You cannot remove your own access');
    }
    const membership = await this.users.setAppAccess(userId, status, appKey);
    if (!membership) throw new IamError(404, 'User is not enrolled in this application');
    return membership;
  }
}

export const organizationService = new OrganizationService();

export { OrganizationService };
export default organizationService;
