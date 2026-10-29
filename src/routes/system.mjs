/**
 * System/Setup Routes
 * Handles system-level operations like initial setup and health checks
 */

import express from 'express';
import { query } from '../db/connection.mjs';
import { createUser } from '../auth/user.mjs';
import { validatePassword, validateEmail, validateUsername } from '../auth/validator.mjs';

const router = express.Router();

/**
 * GET /api/system/setup-status
 * Check if the system needs initial setup (no users exist)
 */
router.get('/setup-status', async (req, res) => {
  try {
    const result = await query('SELECT COUNT(*) as user_count FROM users');
    const userCount = parseInt(result.rows[0].user_count);

    return res.status(200).json({
      status: 'success',
      needsSetup: userCount === 0,
      userCount,
      message: userCount === 0 ? 'System needs initial setup' : 'System is ready',
    });
  } catch (error) {
    console.error('Setup status check error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to check setup status',
    });
  }
});

/**
 * POST /api/system/initial-setup
 * Create the first user (only available when no users exist)
 * This user will be the system administrator
 */
router.post('/initial-setup', express.json(), async (req, res) => {
  try {
    // Check if any users already exist
    const userCheckResult = await query('SELECT COUNT(*) as user_count FROM users');
    const userCount = parseInt(userCheckResult.rows[0].user_count);

    if (userCount > 0) {
      return res.status(403).json({
        status: 'error',
        message: 'System is already initialized. Users already exist.',
        hint: 'Use /api/auth/register to create a new user account',
      });
    }

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

    // Create the first user
    const user = await createUser(username, email, password, fullName || null);

    // Set session
    req.session.userId = user.user_id;
    req.session.username = user.username;

    return res.status(201).json({
      status: 'success',
      message: 'Initial setup complete. First user created successfully.',
      hint: 'This is the first user in the system. Consider this the administrator account.',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Initial setup error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Initial setup failed. Please try again.',
      error: error.message,
    });
  }
});

/**
 * GET /api/system/database-status
 * Get database connection and table status
 */
router.get('/database-status', async (req, res) => {
  try {
    const tables = [
      'users',
      'flashcards',
      'leitner_boxes',
      'quizzes',
      'quiz_questions',
      'quiz_results',
      'import_export_logs',
    ];

    const tableStatus = {};
    let allTablesExist = true;

    for (const table of tables) {
      try {
        const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
        tableStatus[table] = {
          exists: true,
          rowCount: parseInt(result.rows[0].count),
        };
      } catch {
        tableStatus[table] = {
          exists: false,
          rowCount: 0,
        };
        allTablesExist = false;
      }
    }

    return res.status(200).json({
      status: 'success',
      database: process.env.DB_PG_DATABASE,
      allTablesExist,
      tables: tableStatus,
    });
  } catch (error) {
    console.error('Database status error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to check database status',
    });
  }
});

export default router;
