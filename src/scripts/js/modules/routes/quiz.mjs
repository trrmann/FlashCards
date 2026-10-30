import express from 'express';
import { query } from '../db/connection.mjs';

const router = express.Router();

/**
 * Helper function to select random questions with difficulty distribution
 * @param {array} flashcards - Array of flashcards with difficulty_score
 * @param {number} totalCount - Total number of flashcards
 * @returns {array} Selected flashcards
 */
function selectRandomQuestions(flashcards, totalCount) {
  // If 20 or fewer total questions, use all
  if (totalCount <= 20) {
    return flashcards;
  }

  // If more than 20 questions, select a reasonable minimum (e.g., 15-20)
  // Distribute by difficulty level
  const targetCount = Math.min(20, Math.ceil(totalCount * 0.75)); // 75% or 20, whichever is smaller

  // Sort by difficulty level to ensure distribution
  // Assume difficulty_score ranges from 1.0 to 5.0
  const byDifficulty = {
    easy: flashcards.filter((f) => f.difficulty_score <= 2.0),
    medium: flashcards.filter((f) => f.difficulty_score > 2.0 && f.difficulty_score <= 3.5),
    hard: flashcards.filter((f) => f.difficulty_score > 3.5),
  };

  // Calculate how many to take from each difficulty level
  // Distribute them proportionally, ensuring we get variety
  const selected = [];
  const perDifficulty = Math.floor(targetCount / 3);
  const remainder = targetCount % 3;

  // Shuffle function
  const shuffle = (arr) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Take from each difficulty level
  const easyShuffled = shuffle(byDifficulty.easy);
  const mediumShuffled = shuffle(byDifficulty.medium);
  const hardShuffled = shuffle(byDifficulty.hard);

  // Add proportional amounts
  selected.push(...easyShuffled.slice(0, perDifficulty));
  selected.push(...mediumShuffled.slice(0, perDifficulty));
  selected.push(...hardShuffled.slice(0, perDifficulty + remainder));

  // Final shuffle to randomize order
  return shuffle(selected);
}

/**
 * POST /api/quiz/start
 * Start a new quiz with random questions from user's flashcards
 * Query params: ?class=ClassName&lesson=LessonName&category=CategoryName (optional filters)
 */
router.post('/start', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    // Get filter parameters
    const filters = {};
    if (req.query.class) filters.class = req.query.class;
    if (req.query.lesson) filters.lesson = req.query.lesson;
    if (req.query.category) filters.category = req.query.category;

    // Fetch user's flashcards
    let flashcards;
    if (Object.keys(filters).length > 0) {
      // Build dynamic WHERE clause for filters
      let whereClause = 'WHERE created_by = $1 AND is_private = true';
      const params = [req.session.userId];
      let paramIndex = 2;

      if (filters.class) {
        whereClause += ` AND class = $${paramIndex}`;
        params.push(filters.class);
        paramIndex++;
      }
      if (filters.lesson) {
        whereClause += ` AND lesson = $${paramIndex}`;
        params.push(filters.lesson);
        paramIndex++;
      }
      if (filters.category) {
        whereClause += ` AND category = $${paramIndex}`;
        params.push(filters.category);
        paramIndex++;
      }

      const result = await query(
        `SELECT flashcard_id, question, answer, difficulty_score 
         FROM flashcards 
         ${whereClause}
         ORDER BY RANDOM()`,
        params
      );
      flashcards = result.rows;
    } else {
      const result = await query(
        `SELECT flashcard_id, question, answer, difficulty_score 
         FROM flashcards 
         WHERE created_by = $1 AND is_private = true
         ORDER BY RANDOM()`,
        [req.session.userId]
      );
      flashcards = result.rows;
    }

    if (flashcards.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No flashcards available for quiz',
      });
    }

    // Select random questions with difficulty distribution
    const selectedQuestions = selectRandomQuestions(flashcards, flashcards.length);

    // Create a new quiz record
    const quizResult = await query(
      `INSERT INTO quizzes (user_id, name, description) 
       VALUES ($1, $2, $3) 
       RETURNING quiz_id`,
      [
        req.session.userId,
        `Quiz - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        Object.keys(filters).length > 0 ? JSON.stringify(filters) : null,
      ]
    );

    const quizId = quizResult.rows[0].quiz_id;

    // Add selected questions to quiz_questions table
    for (let i = 0; i < selectedQuestions.length; i++) {
      await query(
        `INSERT INTO quiz_questions (quiz_id, card_id, order_index) 
         VALUES ($1, $2, $3)`,
        [quizId, selectedQuestions[i].flashcard_id, i + 1]
      );
    }

    return res.status(200).json({
      status: 'success',
      quiz_id: quizId,
      total_questions: selectedQuestions.length,
      questions: selectedQuestions.map((q) => ({
        card_id: q.flashcard_id,
        question: q.question,
        answer: q.answer,
        difficulty_score: q.difficulty_score,
      })),
    });
  } catch (error) {
    console.error('Start quiz error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to start quiz' });
  }
});

/**
 * POST /api/quiz/:quizId/submit
 * Submit quiz answers and calculate score
 * Body: { answers: [{ card_id: 'uuid', is_correct: boolean }, ...] }
 */
router.post('/:quizId/submit', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { quizId } = req.params;
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid answers format',
      });
    }

    // Verify quiz belongs to user
    const quizCheck = await query(
      'SELECT quiz_id FROM quizzes WHERE quiz_id = $1 AND user_id = $2',
      [quizId, req.session.userId]
    );

    if (quizCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Quiz not found',
      });
    }

    // Calculate score
    const correctAnswers = answers.filter((a) => a.is_correct).length;
    const totalQuestions = answers.length;
    const score = Math.round((correctAnswers / totalQuestions) * 100);

    // Store quiz result
    const resultInsert = await query(
      `INSERT INTO quiz_results (user_id, quiz_id, score, total_questions, correct_answers) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING result_id, score, correct_answers, total_questions`,
      [req.session.userId, quizId, score, totalQuestions, correctAnswers]
    );

    const result = resultInsert.rows[0];

    return res.status(200).json({
      status: 'success',
      result_id: result.result_id,
      score: result.score,
      correct_answers: result.correct_answers,
      total_questions: result.total_questions,
      percentage: `${result.score}%`,
    });
  } catch (error) {
    console.error('Submit quiz error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to submit quiz' });
  }
});

/**
 * GET /api/quiz/history
 * Get user's quiz history with best scores
 */
router.get('/history', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT 
        q.quiz_id,
        q.name,
        q.description,
        q.created_at,
        MAX(qr.score) as best_score,
        COUNT(DISTINCT qr.result_id) as attempt_count,
        qr.taken_at as last_taken
      FROM quizzes q
      LEFT JOIN quiz_results qr ON q.quiz_id = qr.quiz_id
      WHERE q.user_id = $1
      GROUP BY q.quiz_id, q.name, q.description, q.created_at, qr.taken_at
      ORDER BY q.created_at DESC`,
      [req.session.userId]
    );

    return res.status(200).json({
      status: 'success',
      quizzes: result.rows,
    });
  } catch (error) {
    console.error('Get quiz history error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch quiz history' });
  }
});

/**
 * GET /api/quiz/:quizId/results
 * Get detailed results for a specific quiz
 */
router.get('/:quizId/results', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { quizId } = req.params;

    // Verify quiz belongs to user
    const quizCheck = await query(
      'SELECT quiz_id FROM quizzes WHERE quiz_id = $1 AND user_id = $2',
      [quizId, req.session.userId]
    );

    if (quizCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Quiz not found',
      });
    }

    // Get all results for this quiz
    const results = await query(
      `SELECT result_id, score, correct_answers, total_questions, taken_at
       FROM quiz_results 
       WHERE quiz_id = $1
       ORDER BY taken_at DESC`,
      [quizId]
    );

    // Get best score
    const bestResult = results.rows[0];

    return res.status(200).json({
      status: 'success',
      best_score: bestResult?.score || 0,
      best_result_id: bestResult?.result_id,
      all_results: results.rows,
      attempt_count: results.rows.length,
    });
  } catch (error) {
    console.error('Get quiz results error:', error.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch quiz results' });
  }
});

/**
 * GET /api/quiz/metadata/classes
 * Get all distinct classes for quiz filtering
 */
router.get('/metadata/classes', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT DISTINCT class FROM flashcards 
       WHERE class IS NOT NULL AND created_by = $1
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
 * GET /api/quiz/metadata/lessons/:className
 * Get lessons filtered by class
 */
router.get('/metadata/lessons/:className', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const { className } = req.params;

    const result = await query(
      `SELECT DISTINCT lesson FROM flashcards 
       WHERE lesson IS NOT NULL AND class = $1 AND created_by = $2
       ORDER BY lesson ASC`,
      [encodeURIComponent(className), req.session.userId]
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
 * GET /api/quiz/metadata/categories
 * Get all distinct categories for quiz filtering
 */
router.get('/metadata/categories', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    }

    const result = await query(
      `SELECT DISTINCT category FROM flashcards 
       WHERE category IS NOT NULL AND created_by = $1
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

export default router;
