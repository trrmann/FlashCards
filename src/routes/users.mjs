/**
 * User Profile Routes
 * Handles user profile retrieval and updates
 */

import express from 'express';
import { findUserById, updateUserProfile } from '../scripts/js/modules/auth/user.mjs';
import {
  validateEmail,
  validatePassword,
  hashPassword,
} from '../scripts/js/modules/auth/validator.mjs';
import { query } from '../scripts/js/modules/db/connection.mjs';

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
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.session.userId);

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
      if (!validateEmail(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid email address',
        });
      }
      updates.email = email;
    }

    // Update user
    const updatedUser = await updateUserProfile(req.session.userId, updates);

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
    const validation = validatePassword(password);
    if (!validation.valid) {
      return res.status(400).json({
        status: 'error',
        message: 'Password does not meet requirements',
        errors: validation.errors,
      });
    }

    // Hash new password
    const passwordHash = await hashPassword(password);

    // Update password in database
    const result = await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, username, email',
      [passwordHash, req.session.userId]
    );

    if (result.rows.length === 0) {
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

export default router;
