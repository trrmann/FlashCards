/**
 * IAM Routes (/api/iam)
 * Organizations, members, groups, group roles, platform admins, and
 * application access. Authorization rules live in OrganizationService.
 */

import { BaseRouter } from './baseRouter.mjs';
import { organizationService, IamError } from '../auth/organizationService.mjs';

class IamRouter extends BaseRouter {
  static UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  static APP_KEY = /^[a-z0-9-]{1,50}$/;

  /**
   * Wrap a handler: validate path ids, run the service call, and map
   * IamError to its status. `work(req)` returns the JSON body to send.
   */
  handle(work, successStatus = 200) {
    return async (req, res) => {
      for (const [name, value] of Object.entries(req.params)) {
        const pattern = name === 'appKey' ? this.constructor.APP_KEY : this.constructor.UUID;
        if (!pattern.test(value)) {
          return res.status(404).json({ status: 'error', message: `Unknown ${name}` });
        }
      }
      try {
        const body = await work(req, req.session.userId);
        return res.status(successStatus).json({ status: 'success', ...body });
      } catch (error) {
        if (error instanceof IamError) {
          return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        console.error(`IAM ${req.method} ${req.originalUrl} error:`, error.message);
        return res.status(500).json({ status: 'error', message: 'IAM request failed' });
      }
    };
  }

  registerRoutes() {
    const router = this.router;
    const service = organizationService;
    router.use(this.requireAuth);

    // Organizations
    router.get(
      '/organizations',
      this.handle(async (req, actor) => service.listOrganizations(actor))
    );
    router.post(
      '/organizations',
      this.handle(
        async (req, actor) => ({ organization: await service.createOrganization(actor, req.body) }),
        201
      )
    );
    router.put(
      '/organizations/:orgId',
      this.handle(async (req, actor) => ({
        organization: await service.updateOrganization(actor, req.params.orgId, req.body),
      }))
    );
    router.delete(
      '/organizations/:orgId',
      this.handle(async (req, actor) => {
        await service.deleteOrganization(actor, req.params.orgId);
        return { message: 'Organization deleted' };
      })
    );

    // Organization members
    router.get(
      '/organizations/:orgId/members',
      this.handle(async (req, actor) => ({
        members: await service.listMembers(actor, req.params.orgId),
      }))
    );
    router.post(
      '/organizations/:orgId/members',
      this.handle(
        async (req, actor) => ({
          member: await service.addMember(actor, req.params.orgId, req.body),
        }),
        201
      )
    );
    router.put(
      '/organizations/:orgId/members/:userId',
      this.handle(async (req, actor) => ({
        member: await service.updateMemberRole(
          actor,
          req.params.orgId,
          req.params.userId,
          req.body
        ),
      }))
    );
    router.delete(
      '/organizations/:orgId/members/:userId',
      this.handle(async (req, actor) => {
        await service.removeMember(actor, req.params.orgId, req.params.userId);
        return { message: 'Member removed' };
      })
    );

    // Groups
    router.get(
      '/organizations/:orgId/groups',
      this.handle(async (req, actor) => ({
        groups: await service.listGroups(actor, req.params.orgId),
      }))
    );
    router.post(
      '/organizations/:orgId/groups',
      this.handle(
        async (req, actor) => ({
          group: await service.createGroup(actor, req.params.orgId, req.body),
        }),
        201
      )
    );
    router.put(
      '/groups/:groupId',
      this.handle(async (req, actor) => ({
        group: await service.updateGroup(actor, req.params.groupId, req.body),
      }))
    );
    router.delete(
      '/groups/:groupId',
      this.handle(async (req, actor) => {
        await service.deleteGroup(actor, req.params.groupId);
        return { message: 'Group deleted' };
      })
    );

    // Group members
    router.get(
      '/groups/:groupId/members',
      this.handle(async (req, actor) => ({
        members: await service.listGroupMembers(actor, req.params.groupId),
      }))
    );
    router.post(
      '/groups/:groupId/members',
      this.handle(
        async (req, actor) => ({
          member: await service.addGroupMember(actor, req.params.groupId, req.body),
        }),
        201
      )
    );
    router.delete(
      '/groups/:groupId/members/:userId',
      this.handle(async (req, actor) => {
        await service.removeGroupMember(actor, req.params.groupId, req.params.userId);
        return { message: 'Group member removed' };
      })
    );

    // Group roles
    router.get(
      '/groups/:groupId/roles',
      this.handle(async (req, actor) => ({
        roles: await service.listGroupRoles(actor, req.params.groupId),
      }))
    );
    router.post(
      '/groups/:groupId/roles',
      this.handle(
        async (req, actor) => ({
          role: await service.grantGroupRole(actor, req.params.groupId, req.body),
        }),
        201
      )
    );
    router.delete(
      '/groups/:groupId/roles/:roleId',
      this.handle(async (req, actor) => {
        await service.revokeGroupRole(actor, req.params.groupId, req.params.roleId);
        return { message: 'Group role revoked' };
      })
    );

    // Platform admins
    router.post(
      '/platform-admins/:userId',
      this.handle(async (req, actor) => service.setPlatformAdmin(actor, req.params.userId, true))
    );
    router.delete(
      '/platform-admins/:userId',
      this.handle(async (req, actor) => service.setPlatformAdmin(actor, req.params.userId, false))
    );

    // Applications and access
    router.get(
      '/applications',
      this.handle(async (req, actor) => ({
        applications: await service.listApplications(actor),
      }))
    );
    router.put(
      '/applications/:appKey/users/:userId',
      this.handle(async (req, actor) => ({
        access: await service.setAppAccess(actor, req.params.appKey, req.params.userId, req.body),
      }))
    );
  }
}

export const iamRouter = new IamRouter();

export { IamRouter };
export default iamRouter.router;
