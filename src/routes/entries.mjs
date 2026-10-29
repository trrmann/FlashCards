/**
 * Entries Routes
 * Handles flashcard CRUD and sharing
 */

import express from 'express';
import {
  createFlashcard,
  getUserFlashcards,
  getFlashcard,
  updateFlashcard,
  deleteFlashcard,
  shareFlashcard,
  revokeShare,
  acceptShare,
  rejectShare,
  getPendingShares,
  getAcceptedShares,
  getOwnedShares,
} from '../auth/entries.mjs';
import { query } from '../db/connection.mjs';

const router = express.Router();

/**
 * POST /api/entries
 * Create a new flashcard entry
 */
router.post('/', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { question, answer, lesson } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        status: 'error',
        message: 'Question and answer are required',
      });
    }

    const flashcard = await createFlashcard(req.session.userId, question, answer, lesson || null);

    return res.status(201).json({
      status: 'success',
      message: 'Entry created successfully',
      flashcard,
    });
  } catch (error) {
    console.error('Create entry error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to create entry' });
  }
});

/**
 * GET /api/entries
 * Get all entries for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const flashcards = await getUserFlashcards(req.session.userId);

    return res.status(200).json({
      status: 'success',
      count: flashcards.length,
      flashcards,
    });
  } catch (error) {
    console.error('Get entries error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch entries' });
  }
});

/**
 * GET /api/entries/:flashcardId
 * Get a specific flashcard
 */
router.get('/:flashcardId', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const flashcard = await getFlashcard(req.params.flashcardId, req.session.userId);

    if (!flashcard) {
      return res.status(404).json({ status: 'error', message: 'Flashcard not found' });
    }

    return res.status(200).json({
      status: 'success',
      flashcard,
    });
  } catch (error) {
    console.error('Get flashcard error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch flashcard' });
  }
});

/**
 * PUT /api/entries/:flashcardId
 * Update a flashcard entry
 */
router.put('/:flashcardId', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const updated = await updateFlashcard(req.params.flashcardId, req.session.userId, req.body);

    if (!updated) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized or flashcard not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Entry updated successfully',
      flashcard: updated,
    });
  } catch (error) {
    console.error('Update entry error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to update entry' });
  }
});

/**
 * DELETE /api/entries/:flashcardId
 * Delete a flashcard entry
 */
router.delete('/:flashcardId', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const deleted = await deleteFlashcard(req.params.flashcardId, req.session.userId);

    if (!deleted) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized or flashcard not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Entry deleted successfully',
    });
  } catch (error) {
    console.error('Delete entry error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to delete entry' });
  }
});

/**
 * POST /api/entries/:flashcardId/share
 * Share a flashcard with another user
 */
router.post('/:flashcardId/share', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { recipientUsername } = req.body;

    if (!recipientUsername) {
      return res.status(400).json({
        status: 'error',
        message: 'recipientUsername is required',
      });
    }

    // Get recipient ID from username
    const recipientResult = await query('SELECT user_id FROM users WHERE username = $1', [
      recipientUsername,
    ]);

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Recipient user not found',
      });
    }

    const recipientId = recipientResult.rows[0].user_id;

    const share = await shareFlashcard(req.params.flashcardId, req.session.userId, recipientId);

    return res.status(201).json({
      status: 'success',
      message: 'Flashcard shared successfully',
      share,
    });
  } catch (error) {
    console.error('Share error:', error.message);
    return res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/entries/:flashcardId/revoke
 * Revoke a flashcard share
 */
router.post('/:flashcardId/revoke', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({
        status: 'error',
        message: 'recipientId is required',
      });
    }

    const revoked = await revokeShare(req.params.flashcardId, req.session.userId, recipientId);

    if (!revoked) {
      return res.status(404).json({
        status: 'error',
        message: 'Share not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Share revoked successfully',
    });
  } catch (error) {
    console.error('Revoke error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to revoke share' });
  }
});

/**
 * POST /api/entries/shares/:shareId/accept
 * Accept a shared flashcard
 */
router.post('/shares/:shareId/accept', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const share = await acceptShare(req.params.shareId, req.session.userId);

    if (!share) {
      return res.status(404).json({
        status: 'error',
        message: 'Share not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Share accepted successfully',
      share,
    });
  } catch (error) {
    console.error('Accept share error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to accept share' });
  }
});

/**
 * POST /api/entries/shares/:shareId/reject
 * Reject a shared flashcard
 * Note: Rejection is not reported back to the owner
 */
router.post('/shares/:shareId/reject', express.json(), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const share = await rejectShare(req.params.shareId, req.session.userId);

    if (!share) {
      return res.status(404).json({
        status: 'error',
        message: 'Share not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Share rejected (not reported to owner)',
      share,
    });
  } catch (error) {
    console.error('Reject share error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to reject share' });
  }
});

/**
 * GET /api/entries/shares/pending
 * Get pending shares for the authenticated user
 */
router.get('/shares/pending', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const shares = await getPendingShares(req.session.userId);

    return res.status(200).json({
      status: 'success',
      count: shares.length,
      shares,
    });
  } catch (error) {
    console.error('Get pending shares error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch pending shares' });
  }
});

/**
 * GET /api/entries/shares/accepted
 * Get accepted shares for the authenticated user
 */
router.get('/shares/accepted', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const shares = await getAcceptedShares(req.session.userId);

    return res.status(200).json({
      status: 'success',
      count: shares.length,
      shares,
    });
  } catch (error) {
    console.error('Get accepted shares error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch accepted shares' });
  }
});

/**
 * GET /api/entries/shared-by-me
 * Get all shares owned by the authenticated user
 */
router.get('/shared-by-me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const shares = await getOwnedShares(req.session.userId);

    return res.status(200).json({
      status: 'success',
      count: shares.length,
      shares,
    });
  } catch (error) {
    console.error('Get owned shares error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch owned shares' });
  }
});

export default router;
