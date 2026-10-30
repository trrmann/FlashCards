/**
 * Practice Study Routes
 * Endpoints for Leitner system practice mode
 */

import express from 'express';
import {
  initializeAllCardsForUser,
  getDueCardsForToday,
  getNextPracticeCard,
  recordPracticeAttempt,
  getProgressStats,
  getPracticeStreak,
  getReviewSchedule,
  getTodaysSummary,
} from '../auth/practice.mjs';

const router = express.Router();

/**
 * GET /practice
 * Display the practice study page
 */
router.get('/', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    const userId = req.session.userId;

    // Initialize any new flashcards for this user
    await initializeAllCardsForUser(userId);

    // Get statistics and schedule
    const stats = await getProgressStats(userId);
    const schedule = await getReviewSchedule(userId);
    const summary = await getTodaysSummary(userId);
    const streak = await getPracticeStreak(userId);

    res.render('practice', {
      title: 'Practice Study - Leitner System',
      stats,
      schedule,
      summary,
      streak,
      user: req.session.user,
      isLoggedIn: true,
    });
  } catch (error) {
    console.error('Error loading practice page:', error);
    res.status(500).render('error', { error: 'Failed to load practice page' });
  }
});

/**
 * GET /api/practice/daily
 * Get all cards due for today's practice
 */
router.get('/daily', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const dueCards = await getDueCardsForToday(userId);

    res.json({
      status: 'success',
      count: dueCards.length,
      cards: dueCards,
    });
  } catch (error) {
    console.error('Error fetching daily cards:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch cards' });
  }
});

/**
 * GET /api/practice/next
 * Get the next random card for practice from due cards
 */
router.get('/next', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;

    // Initialize any new flashcards
    await initializeAllCardsForUser(userId);

    const nextCard = await getNextPracticeCard(userId);

    if (!nextCard) {
      return res.json({
        status: 'success',
        message: 'No cards due for today',
        card: null,
      });
    }

    res.json({
      status: 'success',
      card: nextCard,
    });
  } catch (error) {
    console.error('Error fetching next practice card:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch card' });
  }
});

/**
 * POST /api/practice/answer
 * Submit an answer for a flashcard and move to appropriate box
 * Body: { flashcardId, isCorrect, responseTimeMs }
 */
router.post('/answer', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const { flashcardId, isCorrect, responseTimeMs } = req.body;

    if (!flashcardId || isCorrect === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: flashcardId, isCorrect',
      });
    }

    // Record the attempt
    const updatedProgress = await recordPracticeAttempt(
      userId,
      flashcardId,
      isCorrect,
      responseTimeMs || null
    );

    if (!updatedProgress) {
      return res.status(404).json({
        status: 'error',
        error: 'Flashcard not found',
      });
    }

    res.json({
      status: 'success',
      message: isCorrect ? 'Correct! Promoted to next box.' : 'Incorrect. Back to Box 1.',
      progress: updatedProgress,
    });
  } catch (error) {
    console.error('Error recording practice attempt:', error);
    res.status(500).json({ status: 'error', error: 'Failed to record answer' });
  }
});

/**
 * GET /api/practice/stats
 * Get practice statistics and progress
 */
router.get('/stats', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const stats = await getProgressStats(userId);
    const streak = await getPracticeStreak(userId);

    res.json({
      status: 'success',
      stats,
      streak,
    });
  } catch (error) {
    console.error('Error fetching practice stats:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/practice/schedule
 * Get the review schedule (when each box is due)
 */
router.get('/schedule', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const schedule = await getReviewSchedule(userId);

    res.json({
      status: 'success',
      schedule,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch schedule' });
  }
});

/**
 * GET /api/practice/summary
 * Get today's practice summary
 */
router.get('/summary', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const summary = await getTodaysSummary(userId);

    res.json({
      status: 'success',
      summary,
    });
  } catch (error) {
    console.error('Error fetching practice summary:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch summary' });
  }
});

export default router;
