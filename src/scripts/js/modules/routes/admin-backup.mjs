/**
 * Admin Backup and Export Routes
 * Admin-only endpoints for full application data export/import
 */

import express from 'express';
import {
  exportApplicationData,
  importApplicationData,
  rebuildSchema,
  logImportExport,
  getImportExportHistory,
} from '../auth/backup.mjs';
import { isAdmin } from '../auth/user.mjs';

const router = express.Router();

/**
 * Middleware: Verify admin status
 */
const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }

  const adminStatus = await isAdmin(req.session.userId);
  if (!adminStatus) {
    return res.status(403).json({ status: 'error', message: 'Admin access required' });
  }

  next();
};

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
