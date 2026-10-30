/**
 * Practice Study Routes
 * Endpoints for Leitner system practice mode
 */

import express from 'express';
import { query } from '../db/connection.mjs';
import {
  initializeAllCardsForUser,
  getDueCardsForToday,
  getNextPracticeCard,
  recordPracticeAttempt,
  generateMultipleChoiceOptions,
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
 */
router.get('/next', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', error: 'Unauthorized' });
    }

    const userId = req.session.userId;
    console.log(`[DEBUG] practice/next - User ID from session: ${userId}`);

    // Initialize any new flashcards
    await initializeAllCardsForUser(userId);

    const nextCard = await getNextPracticeCard(userId);
    console.log(`[DEBUG] practice/next - Next card: ${nextCard ? nextCard.question.substring(0, 50) : 'null'}`);

    if (!nextCard) {
      return res.json({
        status: 'success',
        message: 'No cards due for today',
        card: null,
        options: null,
      });
    }

    // Generate multiple choice options
    const options = await generateMultipleChoiceOptions(userId, nextCard, 4);

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
    const { flashcardId, selectedOptionIndex } = req.body;

    if (!flashcardId || selectedOptionIndex === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields: flashcardId, selectedOptionIndex',
      });
    }

    // Get the card to validate the answer
    const { query: dbQuery } = await import('../db/connection.mjs');
    const cardResult = await dbQuery('SELECT answer FROM flashcards WHERE flashcard_id = $1', [
      flashcardId,
    ]);

    if (cardResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: 'Flashcard not found',
      });
    }

    const correctAnswer = cardResult.rows[0].answer;

    // Get the card object for generating options
    const cardFullResult = await dbQuery('SELECT * FROM flashcards WHERE flashcard_id = $1', [
      flashcardId,
    ]);

    // Generate options again to validate (must be consistent)
    const options = await generateMultipleChoiceOptions(userId, cardFullResult.rows[0], 4);

    // Check if selected option is correct
    const selectedOption = options[selectedOptionIndex];
    if (!selectedOption) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid option index',
      });
    }

    const isCorrect = selectedOption.isCorrect;

    // Record the attempt with auto-determined correctness
    const updatedProgress = await recordPracticeAttempt(userId, flashcardId, isCorrect, null);

    if (!updatedProgress) {
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
