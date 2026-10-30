/**
 * Practice Study Routes
 * Endpoints for Leitner system practice mode
 */

import express from 'express';
import { query } from '../db/connection.mjs';
import {
  initializeAllCardsForUser,
  getDueCardsForToday,
  getNextCatchUpCard,
  recordPracticeAttempt,
  recordPracticeAttemptWithSession,
  generateMultipleChoiceOptions,
  getProgressStats,
  getPracticeStreak,
  getReviewSchedule,
  getTodaysSummary,
  updateDifficultyScore,
  batchUpdateDifficultyScores,
  getDifficultyStats,
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
    console.log(`[PRACTICE PAGE LOAD] User ID: ${userId}, User: ${req.session.user?.username}`);

    // Initialize any new flashcards for this user
    try {
      await initializeAllCardsForUser(userId);
      console.log(`[PRACTICE] Initialized cards for user ${userId}`);
    } catch (error) {
      console.error('Error in initializeAllCardsForUser:', error.message);
      throw error;
    }

    // Get statistics and schedule
    let stats, schedule, summary, streak;
    try {
      stats = await getProgressStats(userId);
    } catch (error) {
      console.error('Error in getProgressStats:', error.message);
      throw error;
    }

    try {
      schedule = await getReviewSchedule(userId);
    } catch (error) {
      console.error('Error in getReviewSchedule:', error.message);
      throw error;
    }

    try {
      summary = await getTodaysSummary(userId);
    } catch (error) {
      console.error('Error in getTodaysSummary:', error.message);
      throw error;
    }

    try {
      streak = await getPracticeStreak(userId);
    } catch (error) {
      console.error('Error in getPracticeStreak:', error.message);
      throw error;
    }

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
    console.error('Error loading practice page:', error.message, error.stack);
    res.status(500).json({ status: 'error', error: 'Failed to load practice page' });
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
 * Get the next random card for practice from due cards with multiple choice options
 * Query params:
 *   ?catchUp=true to get any available card (not just due today)
 *   ?class=Bio101&category=Taxonomy to filter by class/category/lesson
 */
router.get('/next', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const catchUpMode = req.query.catchUp === 'true';

    // Extract filters from query params
    const filters = {
      class: req.query.class || null,
      lesson: req.query.lesson || null,
      category: req.query.category || null,
    };

    console.log(
      `[DEBUG] practice/next - User ID from session: ${userId}, Catch-up mode: ${catchUpMode}, Filters:`,
      filters
    );

    // Initialize any new flashcards
    await initializeAllCardsForUser(userId);

    // Get next card based on mode, passing filters
    let nextCard;
    if (catchUpMode) {
      nextCard = await getNextCatchUpCard(userId);
      console.log(
        `[DEBUG] practice/next (CATCH-UP) - Next card: ${nextCard ? nextCard.question.substring(0, 50) : 'null'}`
      );
    } else {
      // Pass filters to getDueCardsForToday
      const dueCards = await getDueCardsForToday(userId, filters);
      console.log(
        `[DEBUG] practice/next - Due cards found: ${dueCards.length}`,
        dueCards.length > 0 ? `First card: ${dueCards[0].question.substring(0, 50)}` : 'none'
      );
      if (dueCards.length > 0) {
        const randomIndex = Math.floor(Math.random() * dueCards.length);
        nextCard = dueCards[randomIndex];
      } else {
        nextCard = null;
      }
      console.log(
        `[DEBUG] practice/next - Next card: ${nextCard ? nextCard.question.substring(0, 50) : 'null'}`
      );
    }

    if (!nextCard) {
      return res.json({
        status: 'success',
        message: catchUpMode ? 'No more cards to practice' : 'No cards due for today',
        card: null,
        options: null,
        catchUpMode: catchUpMode,
      });
    }

    // Generate multiple choice options
    const options = await generateMultipleChoiceOptions(userId, nextCard, 4);

    // Check if not enough options available (need at least 2: 1 correct + 1 wrong)
    if (options === null) {
      return res.json({
        status: 'success',
        message:
          'Not enough entries in this category to practice. Add more flashcards to create multiple choice options.',
        card: null,
        options: null,
        insufficientEntries: true,
      });
    }

    // Check if "None of the above" is in the options
    const hasNoneOfAbove = options.some((opt) => opt.isNoneOfAbove === true);

    // If showing "None of the above", increment the counter
    if (hasNoneOfAbove) {
      await query(
        `UPDATE flashcard_leitner_progress 
         SET none_of_above_count = none_of_above_count + 1 
         WHERE flashcard_id = $1 AND user_id = $2`,
        [nextCard.flashcard_id, userId]
      );
    }

    res.json({
      status: 'success',
      card: {
        flashcard_id: nextCard.flashcard_id,
        question: nextCard.question,
        answer: nextCard.answer,
        current_box: nextCard.current_box,
        times_correct: nextCard.times_correct,
        times_incorrect: nextCard.times_incorrect,
      },
      options: options,
      showingNoneOfAbove: hasNoneOfAbove,
    });
  } catch (error) {
    console.error('Error fetching next practice card:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch card' });
  }
});

/**
 * POST /api/practice/answer
 * Submit an answer for a flashcard and move to appropriate box
 * Body: { flashcardId, selectedOptionIndex }
 */
router.post('/answer', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    console.log('[ANSWER] req.body:', JSON.stringify(req.body));
    const { flashcardId, selectedAnswer, isCorrect, sessionStartTime } = req.body;

    if (!flashcardId || selectedAnswer === undefined || isCorrect === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: flashcardId, selectedAnswer, isCorrect',
      });
    }

    // Get the card to get the correct answer for feedback
    const cardResult = await query(
      `
      SELECT f.answer, COALESCE(p.current_box, 1) as current_box 
      FROM flashcards f 
      LEFT JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id AND p.user_id = $2 
      WHERE f.flashcard_id = $1
    `,
      [flashcardId, userId]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Flashcard not found',
      });
    }

    const correctAnswer = cardResult.rows[0].answer;

    // Use session-aware tracking if sessionStartTime provided (enhanced mode)
    // Otherwise fall back to simple tracking (backward compatibility)
    let result;

    if (sessionStartTime) {
      const sessionDate = new Date(sessionStartTime);
      result = await recordPracticeAttemptWithSession(
        userId,
        flashcardId,
        isCorrect,
        null,
        sessionDate
      );
    } else {
      // Backward compatible: single attempt mode
      const progress = await recordPracticeAttempt(userId, flashcardId, isCorrect, null);
      result = {
        progress,
        needsMoreAttempts: false,
        attemptNumber: 1,
        totalNeeded: 1,
        sessionData: { isComplete: true },
      };
    }

    if (!result) {
      return res.status(404).json({
        status: 'error',
        error: 'Flashcard not found',
      });
    }

    res.json({
      status: 'success',
      isCorrect: isCorrect,
      message: isCorrect
        ? `✅ Correct! The answer is: ${correctAnswer}`
        : `❌ Incorrect. The answer is: ${correctAnswer}`,
      correctAnswer: correctAnswer,
      progress: result.progress,
      session: {
        needsMoreAttempts: result.needsMoreAttempts,
        attemptNumber: result.attemptNumber,
        totalNeeded: result.totalNeeded,
        feedback: result.sessionData.feedback,
      },
    });
  } catch (error) {
    console.error('Error recording practice attempt:', error.message);
    console.error('Stack:', error.stack);
    res
      .status(500)
      .json({ status: 'error', error: 'Failed to record answer', details: error.message });
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

/**
 * POST /api/practice/difficulty/update-single
 * Update difficulty score for a single flashcard based on performance
 */
router.post('/difficulty/update-single', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const { flashcardId } = req.body;

    if (!flashcardId) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required field: flashcardId',
      });
    }

    const result = await updateDifficultyScore(flashcardId, userId);

    if (result.error) {
      return res.status(404).json({ status: 'error', error: result.error });
    }

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    console.error('Error updating difficulty:', error);
    res.status(500).json({ status: 'error', error: 'Failed to update difficulty' });
  }
});

/**
 * POST /api/practice/difficulty/update-batch
 * Batch update difficulty scores for all flashcards (optionally filtered by lesson)
 */
router.post('/difficulty/update-batch', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const { lesson } = req.body;

    const results = await batchUpdateDifficultyScores(userId, lesson || null);

    const changed = results.filter((r) => r.changed).length;
    const errors = results.filter((r) => r.error).length;

    res.json({
      status: 'success',
      summary: {
        total: results.length,
        updated: changed,
        errors,
        lesson: lesson || 'all',
      },
      details: results.slice(0, 10), // Return first 10 updates in detail
    });
  } catch (error) {
    console.error('Error in batch update:', error);
    res.status(500).json({ status: 'error', error: 'Failed to batch update' });
  }
});

/**
 * GET /api/practice/difficulty/stats
 * Get difficulty distribution and statistics
 */
router.get('/difficulty/stats', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    const stats = await getDifficultyStats(userId);

    if (stats.error) {
      return res.status(500).json({ status: 'error', error: stats.error });
    }

    res.json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching difficulty stats:', error);
    res.status(500).json({ status: 'error', error: 'Failed to fetch statistics' });
  }
});

export default router;
