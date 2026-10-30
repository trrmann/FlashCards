/**
 * Entries Routes
 * Handles flashcard CRUD and sharing
 */

import express from 'express';
import {
  createFlashcard,
  getUserFlashcards,
  getUserFlashcardsFiltered,
  getFlashcard,
  getFlashcardByQuestion,
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
import { query } from '../scripts/js/modules/db/connection.mjs';

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

    const { question, answer, lesson, category, class: flashClass } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        status: 'error',
        message: 'Question and answer are required',
      });
    }

    const flashcard = await createFlashcard(
      req.session.userId,
      question,
      answer,
      lesson || null,
      category || null,
      flashClass || null
    );

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
 * Get all entries for the authenticated user (with optional filters)
 * Query params: ?class=Biology101&lesson=Lesson5&category=Taxonomy
 */
router.get('/', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    // Extract filter parameters from query string
    const filters = {};
    if (req.query.class) filters.class = req.query.class;
    if (req.query.lesson) filters.lesson = req.query.lesson;
    if (req.query.category) filters.category = req.query.category;

    // Use filtered query if filters provided, otherwise get all
    let flashcards;
    if (Object.keys(filters).length > 0) {
      flashcards = await getUserFlashcardsFiltered(req.session.userId, filters);
    } else {
      flashcards = await getUserFlashcards(req.session.userId);
    }

    return res.status(200).json({
      status: 'success',
      count: flashcards.length,
      filters: Object.keys(filters).length > 0 ? filters : null,
      entries: flashcards,
    });
  } catch (error) {
    console.error('Get entries error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch entries' });
  }
});

/**
 * GET /api/entries/export
 * Export user's entries as JSON
 * Query params: ?class=Biology101&lesson=Lesson5&category=Taxonomy (optional for filtered export)
 */
router.get('/export', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    // Extract filter parameters
    const filters = {};
    if (req.query.class) filters.class = req.query.class;
    if (req.query.lesson) filters.lesson = req.query.lesson;
    if (req.query.category) filters.category = req.query.category;

    // Get entries
    let flashcards;
    if (Object.keys(filters).length > 0) {
      flashcards = await getUserFlashcardsFiltered(req.session.userId, filters);
    } else {
      flashcards = await getUserFlashcards(req.session.userId);
    }

    // Create export object
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: req.session.username || req.session.userId,
      filters: Object.keys(filters).length > 0 ? filters : null,
      count: flashcards.length,
      entries: flashcards.map((card) => ({
        question: card.question,
        answer: card.answer,
        lesson: card.lesson,
        category: card.category,
        class: card.class,
        is_private: card.is_private,
      })),
    };

    // Send as downloadable JSON file
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="flashcards-export-${Date.now()}.json"`
    );
    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Export entries error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to export entries' });
  }
});

/**
 * POST /api/entries/import
 * Import entries from JSON file
 * Body: { entries: [...] }
 */
router.post('/import', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid import format. Expected array of entries.',
      });
    }

    if (entries.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No entries to import.',
      });
    }

    // Validate entries
    const validEntries = entries.filter((entry) => {
      return (
        entry.question &&
        entry.answer &&
        typeof entry.question === 'string' &&
        typeof entry.answer === 'string'
      );
    });

    if (validEntries.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid entries found. Each entry must have question and answer fields.',
      });
    }

    // Import entries (create new or update existing based on question)
    const importedCards = [];
    const updatedCards = [];
    const errors = [];

    for (const entry of validEntries) {
      try {
        // Check if flashcard with same question already exists
        const existingCard = await getFlashcardByQuestion(req.session.userId, entry.question);

        if (existingCard) {
          // Update existing flashcard
          const updated = await updateFlashcard(existingCard.flashcard_id, req.session.userId, {
            answer: entry.answer,
            lesson: entry.lesson || null,
            category: entry.category || null,
            class: entry.class || null,
          });
          updatedCards.push(updated);
        } else {
          // Create new flashcard
          const card = await createFlashcard(
            req.session.userId,
            entry.question,
            entry.answer,
            entry.lesson || null,
            entry.category || null,
            entry.class || null
          );
          importedCards.push(card);
        }
      } catch (error) {
        errors.push({
          question: entry.question.substring(0, 50),
          error: error.message,
        });
      }
    }

    return res.status(201).json({
      status: 'success',
      message: `Imported ${importedCards.length + updatedCards.length} entries (${importedCards.length} new, ${updatedCards.length} updated)`,
      count: importedCards.length + updatedCards.length,
      created: importedCards.length,
      updated: updatedCards.length,
      errors: errors.length > 0 ? errors : null,
      imported: importedCards,
      updatedEntries: updatedCards,
    });
  } catch (error) {
    console.error('Import entries error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to import entries' });
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

/**
 * GET /api/entries/metadata/classes
 * Get all unique class values for the authenticated user
 */
router.get('/metadata/classes', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT DISTINCT class FROM flashcards 
       WHERE class IS NOT NULL AND (created_by = $1 OR user_id = $1)
       ORDER BY class ASC`,
      [req.session.userId]
    );

    return res.status(200).json({
      status: 'success',
      classes: result.rows.map((row) => row.class),
    });
  } catch (error) {
    console.error('Get classes error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch classes' });
  }
});

/**
 * GET /api/entries/metadata/lessons
 * Get all unique lesson values for the authenticated user
 */
router.get('/metadata/lessons', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT DISTINCT lesson FROM flashcards 
       WHERE lesson IS NOT NULL AND (created_by = $1 OR user_id = $1)
       ORDER BY lesson ASC`,
      [req.session.userId]
    );

    return res.status(200).json({
      status: 'success',
      lessons: result.rows.map((row) => row.lesson),
    });
  } catch (error) {
    console.error('Get lessons error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch lessons' });
  }
});

/**
 * GET /api/entries/metadata/categories
 * Get all unique category values for the authenticated user
 */
router.get('/metadata/categories', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT DISTINCT category FROM flashcards 
       WHERE category IS NOT NULL AND (created_by = $1 OR user_id = $1)
       ORDER BY category ASC`,
      [req.session.userId]
    );

    return res.status(200).json({
      status: 'success',
      categories: result.rows.map((row) => row.category),
    });
  } catch (error) {
    console.error('Get categories error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/entries/metadata/lessons/:class
 * Get all unique lesson values for a specific class
 */
router.get('/metadata/lessons/:className', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { className } = req.params;

    const result = await query(
      `SELECT DISTINCT lesson FROM flashcards 
       WHERE lesson IS NOT NULL 
       AND class = $1 
       AND (created_by = $2 OR user_id = $2)
       ORDER BY lesson ASC`,
      [className, req.session.userId]
    );

    return res.status(200).json({
      status: 'success',
      lessons: result.rows.map((row) => row.lesson),
    });
  } catch (error) {
    console.error('Get lessons for class error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch lessons for class' });
  }
});

export default router;
