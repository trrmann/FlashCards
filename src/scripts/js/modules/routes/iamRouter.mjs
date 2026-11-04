/**
 * IAM Routes (/api/iam)
 * Organizations, members, groups, group roles, platform admins, and
 * application access, served in-process from iam-service's OrganizationRouter
 * (until phase 3c moves FlashCards onto IamClient). FlashCards supplies its
 * session as the authentication; the rules live in iam-service.
 */

import { OrganizationRouter } from 'iam-service/routes';

class IamRouter extends OrganizationRouter {
  constructor() {
    super({
      authenticate: (req, res, next) => IamRouter.requireSession(req, res, next),
      actorOf: (req) => req.session.userId,
    });
  }

  /** Admit only signed-in FlashCards sessions. */
  static requireSession(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }
    return next();
  }
}

export const iamRouter = new IamRouter();

export { IamRouter };
export default iamRouter.router;
