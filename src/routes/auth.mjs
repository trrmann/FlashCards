/**
 * Authentication Routes
 * Handles user registration, login, logout, and profile operations
 */

import express from 'express';
import {
  createUser,
  authenticateUser,
  findUserById,
  isUsernameAvailable,
  isEmailAvailable,
} from '../auth/user.mjs';
import { validatePassword, validateEmail, validateUsername } from '../auth/validator.mjs';
import { query } from '../db/connection.mjs';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 * First user is automatically made admin
 */
router.post('/register', express.json(), async (req, res) => {
  try {
    const { username, email, password, passwordConfirm, fullName } = req.body;

    // Validate required fields
    if (!username || !email || !password || !passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: username, email, password, passwordConfirm',
      });
    }

    // Validate passwords match
    if (password !== passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match',
      });
    }

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid username',
        errors: usernameValidation.errors,
      });
    }

    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email address',
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        status: 'error',
        message: 'Password does not meet requirements',
        errors: passwordValidation.errors,
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

    // Check if this is the first user
    const userCountResult = await query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(userCountResult.rows[0].count, 10);
    const isFirstUser = userCount === 0;

    // Create user
    const user = await createUser(username, email, password, fullName || null);

    // If first user, set as admin
    if (isFirstUser) {
      await query('UPDATE users SET is_admin = true WHERE user_id = $1', [user.user_id]);
      user.is_admin = true;
    }

    // Set session
    req.session.userId = user.user_id;
    req.session.username = user.username;

    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully' + (isFirstUser ? ' as system admin' : ''),
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        is_admin: user.is_admin || false,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Registration failed. Please try again.',
      error: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate a user and create a session
 */
router.post('/login', express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: username, password',
      });
    }

    // Authenticate user
    const user = await authenticateUser(username, password);

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username or password',
      });
    }

    // Set session
    req.session.userId = user.user_id;
    req.session.username = user.username;

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Login failed. Please try again.',
      error: error.message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Destroy user session
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err.message);
      return res.status(500).json({
        status: 'error',
        message: 'Logout failed',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  });
});

/**
 * GET /api/auth/current
 * Get current logged-in user
 */
router.get('/current', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
    }

    const user = await findUserById(req.session.userId);

    if (!user) {
      req.session.destroy();
      return res.status(401).json({
        status: 'error',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      user,
    });
  } catch (error) {
    console.error('Get current user error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get current user',
    });
  }
});

export default router;
