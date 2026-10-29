/**
 * Admin Routes
 * Handles user management by system administrators
 */

import express from 'express';
import {
  getAllUsers,
  findUserById,
  disableUser,
  enableUser,
  deleteUser,
  isAdmin,
} from '../auth/user.mjs';

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

export default router;
