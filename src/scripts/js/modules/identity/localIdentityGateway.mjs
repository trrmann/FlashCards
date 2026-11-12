/**
 * Identity in-process: iam-service's UserAccountService (and the user service for the few
 * reads it doesn't wrap) on the shared database. The session holds only the user id.
 * The organizations API is iam-service's OrganizationRouter, mounted in this server.
 */

import {
  userAccountService,
  userAuthService,
  iamBackupService,
  userEventService,
  appRightsService,
} from 'iam-service/services';
import express from 'express';
import { UserAdminRouter } from 'iam-service/routes';
import { IdentityGateway } from './identityGateway.mjs';
import { IamRouter } from '../routes/iamRouter.mjs';

export class LocalIdentityGateway extends IdentityGateway {
  constructor({
    accounts = userAccountService,
    users = userAuthService,
    backups = iamBackupService,
    events = userEventService,
    rights = appRightsService,
  } = {}) {
    super();
    this.rights = rights;
    this.accounts = accounts;
    this.users = users;
    this.backups = backups;
    this.events = events;
  }

  get mode() {
    return 'local';
  }

  get runsInProcess() {
    return true;
  }

  // ----- Sign-in -----

  /** @returns {Promise<{user_id, username, email, full_name}>} */
  login(req, username, password) {
    return this.accounts.authenticate(username, password, this.appKey);
  }

  async logout() {}

  // ----- Application calls -----

  register(fields) {
    return this.accounts.register(fields, this.appKey);
  }

  availability(query) {
    return this.accounts.availability(query);
  }

  async countUsers() {
    return (await this.accounts.count()).count;
  }

  /** Summary of an active user by username (any case), or null. */
  async lookupUser(username) {
    const user = await this.users.findUserByUsernameInsensitive(String(username));
    return user && user.status === 'active'
      ? { user_id: user.user_id, username: user.username, full_name: user.full_name }
      : null;
  }

  /** Map<user_id, {user_id, username, full_name}> */
  getUserSummaries(userIds) {
    return this.users.getUserSummaries(userIds);
  }

  async directory() {
    return (await this.accounts.directory()).users;
  }

  /** Header info for the session user ({full_name, is_admin, …}), or null. */
  displayInfo(req) {
    return req.session?.userId
      ? this.users.getUserDisplayInfo(req.session.userId, this.appKey)
      : Promise.resolve(null);
  }

  // ----- The signed-in user -----

  async currentUser(req) {
    return (await this.accounts.me(IdentityGateway.userIdOf(req), this.appKey)).user;
  }

  isAdmin(req) {
    return req.session?.userId
      ? this.accounts.isAdministrator(req.session.userId, this.appKey)
      : Promise.resolve(false);
  }

  async updateProfile(req, fields) {
    return (await this.accounts.updateProfile(IdentityGateway.userIdOf(req), this.appKey, fields))
      .user;
  }

  updatePassword(req, password) {
    return this.accounts.updatePassword(IdentityGateway.userIdOf(req), password);
  }

  setVisibility(req, isPublic) {
    return this.accounts.setVisibility(IdentityGateway.userIdOf(req), isPublic);
  }

  // ----- Administration (the route has checked isAdmin) -----

  listUsers() {
    return this.accounts.listUsers(this.appKey);
  }

  async getUser(req, userId) {
    return (await this.accounts.getUser(this.appKey, userId)).user;
  }

  createUser(req, fields) {
    return this.accounts.adminCreate(this.appKey, fields);
  }

  async setUserStatus(req, userId, enabled) {
    return (await this.accounts.setStatus(IdentityGateway.userIdOf(req), userId, enabled)).user;
  }

  deleteUser(req, userId) {
    return this.accounts.deleteUser(IdentityGateway.userIdOf(req), this.appKey, userId);
  }

  setUserAdmin(req, userId, admin) {
    return this.accounts.setAdmin(IdentityGateway.userIdOf(req), this.appKey, userId, admin);
  }

  setUserVisibility(req, userId, isPublic) {
    return this.accounts.setVisibility(userId, isPublic);
  }

  // ----- Notices from the IAM (phase 3d) -----

  /** @returns {Promise<Array<{event_id, user_id, event_type}>>} the next unacknowledged events */
  async pullEvents() {
    return (await this.events.list(this.appKey)).events;
  }

  acknowledgeEvents(eventId) {
    return this.events.acknowledge(this.appKey, eventId);
  }

  // ----- Identity backup (platform admins only; owner decision, phase 3d) -----

  isPlatformAdmin(req) {
    return req.session?.userId
      ? this.users.isPlatformAdmin(req.session.userId)
      : Promise.resolve(false);
  }

  /** In-process: the IAM's access check, for FlashCards (iam-service MIGRATION.md L17). */
  async checkAppToken(req, rights) {
    const token = IdentityGateway.appTokenOf(req);
    return token ? this.rights.check(this.appKey, { token }, rights) : null;
  }

  /** The identity part of a backup (a platform admin, or a service account with identity.backup.export). */
  async exportIdentity(req) {
    await this.requireIdentityBackup(req, 'export');
    return this.backups.exportPart();
  }

  /** @returns {Promise<{imported, warnings, user_id_map}>} */
  async importIdentity(req, identity, options) {
    await this.requireIdentityBackup(req, 'import');
    return this.backups.importPart(identity, options);
  }

  // ----- Organizations, groups, platform admins, app access (/api/iam) -----

  /**
   * /api/iam in-process: user administration (the shared <iam-user-admin> screen) and the
   * organizations API, with FlashCards' session as the sign-in.
   */
  organizationRouter() {
    const router = express.Router();
    router.use(
      new UserAdminRouter({
        authenticate: (req, res, next) => IamRouter.requireSession(req, res, next),
        actorOf: (req) => req.session.userId,
        appKey: this.appKey,
      }).router
    );
    router.use(new IamRouter().router);
    return router;
  }
}

export default LocalIdentityGateway;
