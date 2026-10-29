/**
 * Admin Routes
 * Handles user management by system administrators
 */

import express from 'express';
import {
  createUser,
  getAllUsers,
  findUserById,
  disableUser,
  enableUser,
  deleteUser,
  isAdmin,
  isUsernameAvailable,
  isEmailAvailable,
} from '../auth/user.mjs';
import { validatePassword, validateEmail, validateUsername } from '../auth/validator.mjs';
import {
  exportApplicationData,
  importApplicationData,
  rebuildSchema,
  logImportExport,
  getImportExportHistory,
} from '../auth/backup.mjs';

const router = express.Router();

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      status: 'error',
      message: 'Not authenticated',
    });
  }
  next();
}

/**
 * Middleware to check if user is admin
 */
async function requireAdmin(req, res, next) {
  const adminStatus = await isAdmin(req.session.userId);
  if (!adminStatus) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin privileges required.',
    });
  }
  next();
}

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();

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
    const { username, email, password, fullName } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: username, email, password',
      });
    }

    const errors = [];

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      errors.push(...usernameValidation.errors);
    }

    // Validate email
    if (!validateEmail(email)) {
      errors.push('Invalid email address');
    }

    // Validate password
    const passwordValidation = validatePassword(password);
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
    const usernameAvailable = await isUsernameAvailable(username);
    if (!usernameAvailable) {
      return res.status(400).json({
        status: 'error',
        message: 'Username is already taken',
      });
    }

    // Check if email is available
    const emailAvailable = await isEmailAvailable(email);
    if (!emailAvailable) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is already registered',
      });
    }

    // Create user
    const user = await createUser(username, email, password, fullName || null);

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
    const user = await findUserById(userId);

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

    const user = await disableUser(userId);

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
    const user = await enableUser(userId);

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

    await deleteUser(userId);

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
    const backup = await exportApplicationData();

    await logImportExport(
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

    await logImportExport(req.session.userId, 'export', 0, 'failed', error.message);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to export application data',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/backup/import
 * Import application data from backup
 * WARNING: This will clear all existing data and replace it
 * Options: rebuild (boolean) - rebuild schema from scratch first
 */
router.post('/backup/import', requireAdmin, express.json(), async (req, res) => {
  try {
    const { backup, rebuild } = req.body;

    if (!backup || !backup.data) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid backup format. Must include backup.data',
      });
    }

    const results = await importApplicationData(backup, rebuild === true);

    const totalImported = Object.values(results.imported).reduce((a, b) => a + b, 0);

    await logImportExport(req.session.userId, 'import', totalImported, 'success');

    return res.status(200).json({
      status: 'success',
      message: 'Application data imported successfully',
      results,
    });
  } catch (error) {
    console.error('Import error:', error.message);

    await logImportExport(req.session.userId, 'import', 0, 'failed', error.message);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to import application data',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/backup/rebuild-schema
 * Rebuild database schema from scratch
 * Creates all tables if they don't exist
 */
router.post('/backup/rebuild-schema', requireAdmin, async (req, res) => {
  try {
    const results = await rebuildSchema();

    return res.status(200).json({
      status: 'success',
      message: 'Database schema rebuilt successfully',
      results,
    });
  } catch (error) {
    console.error('Schema rebuild error:', error.message);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to rebuild schema',
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/backup/history
 * Get import/export history
 * Query params: limit (default 100)
 */
router.get('/backup/history', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100'), 1000);

    const history = await getImportExportHistory(null, limit);

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

export default router;
