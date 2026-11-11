/**
 * Admin Routes
 * Handles user management by system administrators
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';
import { IdentityGateway } from '../identity/identityGateway.mjs';
import { userDataService } from '../auth/userDataService.mjs';
import { backupService } from '../auth/backupService.mjs';
import { practiceService } from '../auth/practiceService.mjs';

class AdminRouter extends BaseRouter {
  registerRoutes() {
    const router = this.router;
    const requireAuth = this.requireAuth;
    const requireAdmin = this.requireAdmin;

    /**
     * User administration through the identity gateway (in-process IAM or the IAM service).
     * The gateway validates, refuses an admin disabling, deleting or demoting themselves, and
     * (remote) checks again that the caller administers FlashCards.
     */
    const answer = (res, error, message) => IdentityGateway.respond(res, error, message);
    const identity = (req) => BaseRouter.identity(req);

    /** GET /api/admin/users: list all users */
    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { users, count } = await identity(req).listUsers(req);
        return res.status(200).json({ status: 'success', users, count });
      } catch (error) {
        return answer(res, error, 'Failed to retrieve users');
      }
    });

    /** POST /api/admin/users: create a user (the admin may set directory visibility) */
    router.post('/users', requireAuth, requireAdmin, express.json(), async (req, res) => {
      try {
        const { username, email, password, fullName, isPublic } = req.body;
        const { user } = await identity(req).createUser(req, {
          username,
          email,
          password,
          full_name: fullName || null,
          is_public: Boolean(isPublic),
        });
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
        return answer(res, error, 'Failed to create user');
      }
    });

    /** GET /api/admin/users/:userId: one user's details */
    router.get('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
      try {
        const user = await identity(req).getUser(req, req.params.userId);
        return res.status(200).json({ status: 'success', user });
      } catch (error) {
        return answer(res, error, 'Failed to retrieve user');
      }
    });

    /** POST /api/admin/users/:userId/disable and /enable */
    for (const [action, enabled] of [
      ['disable', false],
      ['enable', true],
    ]) {
      router.post(`/users/:userId/${action}`, requireAuth, requireAdmin, async (req, res) => {
        try {
          const user = await identity(req).setUserStatus(req, req.params.userId, enabled);
          return res.status(200).json({
            status: 'success',
            message: `User ${action}d successfully`,
            user,
          });
        } catch (error) {
          return answer(res, error, `Failed to ${action} user`);
        }
      });
    }

    /** DELETE /api/admin/users/:userId: delete a user and all their data */
    router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
      try {
        await identity(req).deleteUser(req, req.params.userId);
        // The IAM's notice removes the user's FlashCards data; handle it now, not in 10 minutes.
        await req.app.locals.userEvents
          ?.pull()
          .catch((error) => console.error('User data clean-up deferred:', error.message));
        return res.status(200).json({ status: 'success', message: 'User deleted successfully' });
      } catch (error) {
        return answer(res, error, 'Failed to delete user');
      }
    });

    /** PUT /api/admin/users/:userId/visibility: a user's share-directory visibility */
    router.put(
      '/users/:userId/visibility',
      requireAuth,
      requireAdmin,
      express.json(),
      async (req, res) => {
        try {
          const { isPublic } = req.body;
          if (typeof isPublic !== 'boolean') {
            return res.status(400).json({ status: 'error', message: 'isPublic must be a boolean' });
          }
          const result = await identity(req).setUserVisibility(req, req.params.userId, isPublic);
          return res.status(200).json({
            status: 'success',
            message: isPublic ? 'User is now public' : 'User is now private',
            isPublic: result.is_public,
          });
        } catch (error) {
          return answer(res, error, 'Failed to update user visibility');
        }
      }
    );

    /**
     * PUT /api/admin/users/:userId/storage-limit
     * Set a user's storage quota in bytes (admin only, adjustable)
     */
    router.put(
      '/users/:userId/storage-limit',
      requireAuth,
      requireAdmin,
      express.json(),
      async (req, res) => {
        try {
          const maxBytes = parseInt(req.body.maxBytes, 10);
          if (!Number.isFinite(maxBytes) || maxBytes < 0) {
            return res.status(400).json({
              status: 'error',
              message: 'maxBytes must be a non-negative integer',
            });
          }
          const result = await userSettingsService.setStorageLimit(req.params.userId, maxBytes);
          if (!result) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
          }
          return res.status(200).json({
            status: 'success',
            message: `Storage limit set to ${maxBytes} bytes`,
            maxBytes: parseInt(result.storage_max_bytes),
          });
        } catch (error) {
          console.error('Set storage limit error:', error.message);
          return res.status(500).json({ status: 'error', message: 'Failed to set storage limit' });
        }
      }
    );

    /** POST /api/admin/users/:userId/promote and /demote: the FlashCards admin role */
    for (const [action, admin] of [
      ['promote', true],
      ['demote', false],
    ]) {
      router.post(`/users/:userId/${action}`, requireAuth, requireAdmin, async (req, res) => {
        try {
          const result = await identity(req).setUserAdmin(req, req.params.userId, admin);
          return res.status(200).json({
            status: 'success',
            message: admin
              ? `${result.username} is now a system admin`
              : `${result.username} is no longer a system admin`,
          });
        } catch (error) {
          return answer(res, error, `Failed to ${action} user`);
        }
      });
    }

    /**
     * GET  /api/admin/maintenance/orphans: user ids FlashCards holds data for that the IAM
     *      doesn't know (a dry run: nothing is removed)
     * POST /api/admin/maintenance/orphans: remove their data; refused (409) when more than a
     *      quarter of the users would go, which points at an IAM problem rather than orphans
     */
    router.get('/maintenance/orphans', requireAuth, requireAdmin, async (req, res) => {
      try {
        const found = await userDataService.findOrphans(identity(req));
        return res.status(200).json({ status: 'success', ...found });
      } catch (error) {
        return answer(res, error, 'Orphan check failed');
      }
    });
    router.post('/maintenance/orphans', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await userDataService.removeOrphans(identity(req));
        return res.status(200).json({ status: 'success', ...result });
      } catch (error) {
        if (error.status === 409) {
          return res.status(409).json({ status: 'error', message: error.message });
        }
        return answer(res, error, 'Orphan removal failed');
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
        const backup = await backupService.exportBackup(req);

        await backupService.logImportExport(
          req,
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

        await backupService.logImportExport(req, 'export', 0, 'failed', error.message);

        return res.status(500).json({
          status: 'error',
          message: 'Failed to export application data',
          error: error.message,
        });
      }
    });

    /**
     * GET /api/admin/backup/access
     * Who the caller is for backups (backup-token.sh checks a token with it): `{ principal, allowed }` for an app
     * token, `{ principal: null }` for a signed-in admin.
     */
    router.get('/backup/access', this.requireAdminOrRight('backup.export'), (req, res) =>
      res.status(200).json({
        status: 'success',
        principal: req.serviceAccount?.principal ?? null,
        allowed: req.serviceAccount?.allowed ?? null,
      })
    );

    /**
     * GET /api/admin/backup/download
     * Download the complete dataset (identity + app data) as a JSON file
     */
    router.get('/backup/download', this.requireAdminOrRight('backup.export'), async (req, res) => {
      try {
        const backup = await backupService.exportBackup(req);

        await backupService.logImportExport(
          req,
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

        await backupService.logImportExport(req, 'export', 0, 'failed', error.message);

        return res.status(500).json({
          status: 'error',
          message: 'Failed to download backup',
          error: error.message,
        });
      }
    });

    /**
     * GET /api/admin/backup/download-media
     * Download the media half of the two-file backup: a ZIP of all media,
     * linked to the backup JSON by media id (media/<media_id>.<ext>).
     */
    router.get(
      '/backup/download-media',
      this.requireAdminOrRight('backup.export'),
      async (req, res) => {
        try {
          const archive = await backupService.exportMediaArchive();
          const stamp = new Date().toISOString().slice(0, 10);
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="flashcards-backup-media-${stamp}.zip"`
          );
          return res.status(200).send(archive);
        } catch (error) {
          console.error('Backup media download error:', error.message);
          return res.status(500).json({
            status: 'error',
            message: 'Failed to download media archive',
            error: error.message,
          });
        }
      }
    );

    /**
     * POST /api/admin/backup/import
     * Import a backup with upsert semantics: existing records are updated
     * to the imported values, new records are inserted, nothing is deleted.
     */
    router.post(
      '/backup/import',
      this.requireAdminOrRight('backup.import'),
      express.json({ limit: '50mb' }),
      async (req, res) => {
        try {
          const { backup, mediaArchive } = req.body;

          if (!backup || typeof backup !== 'object') {
            return res.status(400).json({ status: 'error', message: 'Invalid backup: missing' });
          }

          const results = await backupService.importBackup(req, backup, mediaArchive || null);

          const totalImported = Object.values(results.imported).reduce((a, b) => a + b, 0);

          await backupService.logImportExport(req, 'import', totalImported, 'success');

          return res.status(200).json({
            status: 'success',
            message: 'Application data imported successfully',
            results,
          });
        } catch (error) {
          console.error('Import error:', error.message);

          await backupService.logImportExport(req, 'import', 0, 'failed', error.message);

          // 400 bad file, 403 users need a platform admin, 422 a bad row (that step rolled back)
          const answer = IdentityGateway.errorAnswer(error);
          if (answer) return res.status(answer.status).json(answer.body);
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

        // Verify the target user exists (404 from the gateway otherwise)
        let user;
        try {
          user = await identity(req).getUser(req, userId);
        } catch (error) {
          return answer(res, error, 'Failed to reset user stats');
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
