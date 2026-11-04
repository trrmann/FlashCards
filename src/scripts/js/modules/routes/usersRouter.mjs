/**
 * User Profile Routes
 * The signed-in user's profile, password and directory visibility, and the share
 * directory, through the identity gateway (in-process IAM or the IAM service).
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { IdentityGateway } from '../identity/identityGateway.mjs';

class UsersRouter extends BaseRouter {
  registerRoutes() {
    const router = this.router;
    const requireAuth = this.requireAuth;

    /**
     * GET /api/users/profile
     * Get current user's profile
     */
    router.get('/profile', requireAuth, async (req, res) => {
      try {
        const user = await BaseRouter.identity(req).currentUser(req);
        return res.status(200).json({ status: 'success', user });
      } catch (error) {
        if (IdentityGateway.errorAnswer(error)?.status === 401) req.session.destroy(() => {});
        return IdentityGateway.respond(res, error, 'Failed to retrieve profile');
      }
    });

    /**
     * GET /api/users/directory
     * List public users for the share combo box (authenticated users only).
     * Non-public users can still be shared with by typing their exact username.
     */
    router.get('/directory', requireAuth, async (req, res) => {
      try {
        const users = await BaseRouter.identity(req).directory();
        return res.status(200).json({ status: 'success', users });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Failed to retrieve user directory');
      }
    });

    /**
     * PUT /api/users/visibility
     * Set whether the current user is listed in the public share directory
     */
    router.put('/visibility', requireAuth, express.json(), async (req, res) => {
      try {
        const { isPublic } = req.body;
        if (typeof isPublic !== 'boolean') {
          return res.status(400).json({ status: 'error', message: 'isPublic must be a boolean' });
        }
        const result = await BaseRouter.identity(req).setVisibility(req, isPublic);
        return res.status(200).json({
          status: 'success',
          message: isPublic
            ? 'You are now listed in the share directory'
            : 'You are no longer listed in the share directory',
          isPublic: result.is_public,
        });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Failed to update visibility');
      }
    });

    /**
     * PUT /api/users/profile
     * Update current user's profile
     */
    router.put('/profile', requireAuth, express.json(), async (req, res) => {
      try {
        const { fullName, email } = req.body;
        if (fullName !== undefined && (typeof fullName !== 'string' || fullName.length === 0)) {
          return res.status(400).json({
            status: 'error',
            message: 'Full name must be a non-empty string',
          });
        }
        const user = await BaseRouter.identity(req).updateProfile(req, {
          full_name: fullName,
          email,
        });
        return res.status(200).json({
          status: 'success',
          message: 'Profile updated successfully',
          user,
        });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Failed to update profile');
      }
    });

    /**
     * PUT /api/users/password
     * Change current user's password
     */
    router.put('/password', requireAuth, express.json(), async (req, res) => {
      try {
        const { password } = req.body;
        if (!password) {
          return res.status(400).json({ status: 'error', message: 'Password is required' });
        }
        await BaseRouter.identity(req).updatePassword(req, password);
        return res
          .status(200)
          .json({ status: 'success', message: 'Password changed successfully' });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Failed to change password');
      }
    });
  }
}

export const usersRouter = new UsersRouter();

export { UsersRouter };
export default usersRouter.router;
