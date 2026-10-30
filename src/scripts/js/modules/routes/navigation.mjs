/**
 * Navigation Routes
 * Handles page tracking and navigation history
 */

import express from 'express';
import { updateLastPageVisited, getLastPageVisited } from '../auth/user.mjs';

const router = express.Router();

/**
 * POST /api/navigation/track
 * Track the current page visit for the authenticated user
 * Excluded pages: /login, /logout, /register
 */
router.post('/track', express.json(), async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session.userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
      });
    }

    const { page } = req.body;

    // Validate page parameter
    if (!page || typeof page !== 'string' || page.length > 255) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid page parameter. Must be a string, max 255 characters.',
      });
    }

    // Normalize page path (remove query params, hash, etc.)
    const normalizedPage = page.split('?')[0].split('#')[0];

    // Don't track certain pages (auth pages, logout, etc.)
    const excludedPages = ['/login', '/logout', '/register'];
    if (excludedPages.includes(normalizedPage)) {
      return res.status(200).json({
        status: 'success',
        message: 'Page tracking skipped (excluded page)',
        page: normalizedPage,
      });
    }

    // Update last page visited
    await updateLastPageVisited(req.session.userId, normalizedPage);

    return res.status(200).json({
      status: 'success',
      message: 'Page visit tracked',
      page: normalizedPage,
    });
  } catch (error) {
    console.error('Navigation tracking error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to track page visit',
    });
  }
});

/**
 * GET /api/navigation/last-page
 * Get the user's last visited page
 */
router.get('/last-page', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session.userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authenticated',
        lastPage: '/',
      });
    }

    const lastPage = await getLastPageVisited(req.session.userId);

    return res.status(200).json({
      status: 'success',
      lastPage,
    });
  } catch (error) {
    console.error('Get last page error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get last page',
      lastPage: '/',
    });
  }
});

export default router;
