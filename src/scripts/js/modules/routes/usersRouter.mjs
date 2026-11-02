/**
 * User Profile Routes
 * Handles user profile retrieval and updates
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';
import { validationService } from '../auth/validationService.mjs';

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
        const user = await userAuthService.findUserById(req.session.userId);

        if (!user) {
          req.session.destroy();
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          user,
        });
      } catch (error) {
        console.error('Get profile error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve profile',
        });
      }
    });

    /**
     * PUT /api/users/profile
     * Update current user's profile
     */
    router.put('/profile', requireAuth, express.json(), async (req, res) => {
      try {
        const { fullName, email } = req.body;

        // Prepare update object
        const updates = {};

        if (fullName !== undefined) {
          if (typeof fullName !== 'string' || fullName.length === 0) {
            return res.status(400).json({
              status: 'error',
              message: 'Full name must be a non-empty string',
            });
          }
          updates.full_name = fullName;
        }

        if (email !== undefined) {
          if (!validationService.validateEmail(email)) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid email address',
            });
          }
          updates.email = email;
        }

        // Update user
        const updatedUser = await userAuthService.updateUserProfile(req.session.userId, updates);

        if (!updatedUser) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Profile updated successfully',
          user: updatedUser,
        });
      } catch (error) {
        console.error('Update profile error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update profile',
          error: error.message,
        });
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
          return res.status(400).json({
            status: 'error',
            message: 'Password is required',
          });
        }

        // Validate password
        const validation = validationService.validatePassword(password);
        if (!validation.valid) {
          return res.status(400).json({
            status: 'error',
            message: 'Password does not meet requirements',
            errors: validation.errors,
          });
        }

        // Update password in database (hashing happens in the service)
        const updatedUser = await userAuthService.updateUserPassword(req.session.userId, password);

        if (!updatedUser) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to change password',
          error: error.message,
        });
      }
    });
  }
}

export const usersRouter = new UsersRouter();

export { UsersRouter };
export default usersRouter.router;
