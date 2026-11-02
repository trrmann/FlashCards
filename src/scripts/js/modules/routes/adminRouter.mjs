/**
 * Admin Routes
 * Handles user management by system administrators
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { userAuthService } from '../auth/userAuthService.mjs';
import { validationService } from '../auth/validationService.mjs';
import { backupService } from '../auth/backupService.mjs';
import { practiceService } from '../auth/practiceService.mjs';

class AdminRouter extends BaseRouter {
  registerRoutes() {
    const router = this.router;
    const requireAuth = this.requireAuth;
    const requireAdmin = this.requireAdmin;

    /**
     * GET /api/admin/users
     * List all users (admin only)
     */
    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const users = await userAuthService.getAllUsers();

        return res.status(200).json({
          status: 'success',
          users,
          count: users.length,
        });
      } catch (error) {
        console.error('Get users error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve users',
        });
      }
    });

    /**
     * POST /api/admin/users
     * Create a new user (admin only)
     */
    router.post('/users', requireAuth, requireAdmin, express.json(), async (req, res) => {
      try {
        const { username, email, password, fullName, isPublic } = req.body;

        // Validate required fields
        if (!username || !email || !password) {
          return res.status(400).json({
            status: 'error',
            message: 'Missing required fields: username, email, password',
          });
        }

        const errors = [];

        // Validate username
        const usernameValidation = validationService.validateUsername(username);
        if (!usernameValidation.valid) {
          errors.push(...usernameValidation.errors);
        }

        // Validate email
        if (!validationService.validateEmail(email)) {
          errors.push('Invalid email address');
        }

        // Validate password
        const passwordValidation = validationService.validatePassword(password);
        if (!passwordValidation.valid) {
          errors.push(...passwordValidation.errors);
        }

        if (errors.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors,
          });
        }

        // Check if username is available
        const usernameAvailable = await userAuthService.isUsernameAvailable(username);
        if (!usernameAvailable) {
          return res.status(400).json({
            status: 'error',
            message: 'Username is already taken',
          });
        }

        // Check if email is available
        const emailAvailable = await userAuthService.isEmailAvailable(email);
        if (!emailAvailable) {
          return res.status(400).json({
            status: 'error',
            message: 'Email is already registered',
          });
        }

        // Create user (admin may set directory visibility at creation)
        const user = await userAuthService.createUser(
          username,
          email,
          password,
          fullName || null,
          Boolean(isPublic)
        );

        return res.status(201).json({
          status: 'success',
          message: 'User created successfully',
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            created_at: user.created_at,
          },
        });
      } catch (error) {
        console.error('Create user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create user',
          error: error.message,
        });
      }
    });

    /**
     * GET /api/admin/users/:userId
     * Get specific user details (admin only)
     */
    router.get('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await userAuthService.findUserById(userId);

        if (!user) {
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
        console.error('Get user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve user',
        });
      }
    });

    /**
     * POST /api/admin/users/:userId/disable
     * Disable a user (admin only)
     */
    router.post('/users/:userId/disable', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;

        // Prevent disabling oneself
        if (userId === req.session.userId) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot disable your own account',
          });
        }

        const user = await userAuthService.disableUser(userId);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'User disabled successfully',
          user,
        });
      } catch (error) {
        console.error('Disable user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to disable user',
        });
      }
    });

    /**
     * POST /api/admin/users/:userId/enable
     * Enable a user (admin only)
     */
    router.post('/users/:userId/enable', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await userAuthService.enableUser(userId);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        return res.status(200).json({
          status: 'success',
          message: 'User enabled successfully',
          user,
        });
      } catch (error) {
        console.error('Enable user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to enable user',
        });
      }
    });

    /**
     * DELETE /api/admin/users/:userId
     * Delete a user and all related data (admin only)
     */
    router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;

        // Prevent deleting oneself
        if (userId === req.session.userId) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot delete your own account',
          });
        }

        await userAuthService.deleteUser(userId);

        return res.status(200).json({
          status: 'success',
          message: 'User deleted successfully',
        });
      } catch (error) {
        console.error('Delete user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to delete user',
        });
      }
    });

    /**
     * PUT /api/admin/users/:userId/visibility
     * Set a user's share-directory visibility (admin only)
     */
    router.put(
      '/users/:userId/visibility',
      requireAuth,
      requireAdmin,
      express.json(),
      async (req, res) => {
        try {
          const { userId } = req.params;
          const { isPublic } = req.body;

          if (typeof isPublic !== 'boolean') {
            return res.status(400).json({
              status: 'error',
              message: 'isPublic must be a boolean',
            });
          }

          const result = await userAuthService.setUserVisibility(userId, isPublic);

          if (!result) {
            return res.status(404).json({
              status: 'error',
              message: 'User not found',
            });
          }

          return res.status(200).json({
            status: 'success',
            message: isPublic ? 'User is now public' : 'User is now private',
            isPublic: result.is_public,
          });
        } catch (error) {
          console.error('Set user visibility error:', error.message);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to update user visibility',
          });
        }
      }
    );

    /**
     * POST /api/admin/users/:userId/promote
     * Grant the system admin role to a user (admin only)
     */
    router.post('/users/:userId/promote', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await userAuthService.findUserById(userId);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        await userAuthService.setUserAdmin(userId);

        return res.status(200).json({
          status: 'success',
          message: `${user.username} is now a system admin`,
        });
      } catch (error) {
        console.error('Promote user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to promote user',
        });
      }
    });

    /**
     * POST /api/admin/users/:userId/demote
     * Remove the system admin role from a user (admin only)
     */
    router.post('/users/:userId/demote', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;

        // Prevent removing your own admin role
        if (userId === req.session.userId) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot remove your own admin role',
          });
        }

        const user = await userAuthService.findUserById(userId);

        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        await userAuthService.revokeRole(userId, 'admin');

        return res.status(200).json({
          status: 'success',
          message: `${user.username} is no longer a system admin`,
        });
      } catch (error) {
        console.error('Demote user error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to demote user',
        });
      }
    });

    /**
     * Admin Backup and Export Routes
     * Admin-only endpoints for full application data export/import
     */

    /**
     * GET /api/admin/backup/export
     * Export complete application data
     * Includes schema and all user data, entries, quizzes, results
     */
    router.get('/backup/export', requireAdmin, async (req, res) => {
      try {
        const backup = await backupService.exportApplicationData();

        await backupService.logImportExport(
          req.session.userId,
          'export',
          backup.metadata.totalFlashcards +
            backup.metadata.totalQuizzes +
            backup.metadata.totalQuizResults,
          'success'
        );

        return res.status(200).json({
          status: 'success',
          message: 'Application data exported successfully',
          backup,
        });
      } catch (error) {
        console.error('Export error:', error.message);

        await backupService.logImportExport(
          req.session.userId,
          'export',
          0,
          'failed',
          error.message
        );

        return res.status(500).json({
          status: 'error',
          message: 'Failed to export application data',
          error: error.message,
        });
      }
    });

    /**
     * GET /api/admin/backup/download
     * Download the complete dataset (identity + app data) as a JSON file
     */
    router.get('/backup/download', requireAuth, requireAdmin, async (req, res) => {
      try {
        const backup = await backupService.exportApplicationData();

        await backupService.logImportExport(
          req.session.userId,
          'export',
          backup.metadata.totalFlashcards +
            backup.metadata.totalQuizzes +
            backup.metadata.totalQuizResults,
          'success'
        );

        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="flashcards-backup-${stamp}.json"`
        );
        return res.status(200).send(JSON.stringify(backup, null, 2));
      } catch (error) {
        console.error('Backup download error:', error.message);

        await backupService.logImportExport(
          req.session.userId,
          'export',
          0,
          'failed',
          error.message
        );

        return res.status(500).json({
          status: 'error',
          message: 'Failed to download backup',
          error: error.message,
        });
      }
    });

    /**
     * POST /api/admin/backup/import
     * Import a backup with upsert semantics: existing records are updated
     * to the imported values, new records are inserted, nothing is deleted.
     */
    router.post(
      '/backup/import',
      requireAuth,
      requireAdmin,
      express.json({ limit: '50mb' }),
      async (req, res) => {
        try {
          const { backup } = req.body;

          if (!backup || !backup.data) {
            return res.status(400).json({
              status: 'error',
              message: 'Invalid backup format. Must include backup.data',
            });
          }

          const results = await backupService.importApplicationData(backup);

          const totalImported = Object.values(results.imported).reduce((a, b) => a + b, 0);

          await backupService.logImportExport(
            req.session.userId,
            'import',
            totalImported,
            'success'
          );

          return res.status(200).json({
            status: 'success',
            message: 'Application data imported successfully',
            results,
          });
        } catch (error) {
          console.error('Import error:', error.message);

          await backupService.logImportExport(
            req.session.userId,
            'import',
            0,
            'failed',
            error.message
          );

          return res.status(500).json({
            status: 'error',
            message: 'Failed to import application data',
            error: error.message,
          });
        }
      }
    );

    /**
     * GET /api/admin/backup/history
     * Get import/export history
     * Query params: limit (default 100)
     */
    router.get('/backup/history', requireAdmin, async (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit || '100'), 1000);

        const history = await backupService.getImportExportHistory(null, limit);

        return res.status(200).json({
          status: 'success',
          count: history.length,
          history,
        });
      } catch (error) {
        console.error('Get history error:', error.message);

        return res.status(500).json({
          status: 'error',
          message: 'Failed to fetch import/export history',
        });
      }
    });

    /**
     * POST /api/admin/users/:userId/reset-stats
     * Reset all Leitner practice statistics for a user (admin only)
     * Resets all cards back to Box 1 with zero stats, allowing user to start fresh
     */
    router.post('/users/:userId/reset-stats', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { userId } = req.params;

        // Prevent resetting oneself as admin might accidentally do this
        if (userId === req.session.userId) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot reset your own stats. Ask another admin.',
          });
        }

        // Verify the target user exists
        const user = await userAuthService.findUserById(userId);
        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        // Reset the user's Leitner progress
        const result = await practiceService.resetUserLeitnerStats(userId);

        console.log(
          `Admin ${req.session.userId} reset stats for user ${userId}: ${result.cardsReset} cards reset`
        );

        return res.status(200).json({
          status: 'success',
          message: result.message,
          cardsReset: result.cardsReset,
          userName: user.username,
        });
      } catch (error) {
        console.error('Reset user stats error:', error.message);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to reset user statistics',
          error: error.message,
        });
      }
    });
  }
}

export const adminRouter = new AdminRouter();

export { AdminRouter };
export default adminRouter.router;
