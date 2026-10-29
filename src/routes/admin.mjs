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

export default router;
