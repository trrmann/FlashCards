/**
 * Practice & Leitner System Logic
 * Handles flashcard practice using the Leitner spaced repetition system
 */

import { query } from '../db/connection.mjs';

/**
 * Initialize Leitner progress for a flashcard
 * @param {string} userId - User ID
 * @param {number} flashcardId - Flashcard ID
 * @returns {Promise<object>} Leitner progress record
 */
export async function initializeLeitnerForFlashcard(userId, flashcardId) {
  // Check if already initialized
  const existingResult = await query(
    `SELECT * FROM flashcard_leitner_progress 
     WHERE user_id = $1 AND flashcard_id = $2`,
    [userId, flashcardId]
  );

  if (existingResult.rows.length > 0) {
    return existingResult.rows[0];
  }

  // Initialize new progress record (starts in Box 1)
  const result = await query(
    `INSERT INTO flashcard_leitner_progress 
     (flashcard_id, user_id, current_box, last_reviewed, next_review, times_correct, times_incorrect)
     VALUES ($1, $2, 1, NULL, NOW(), 0, 0)
     RETURNING *`,
    [flashcardId, userId]
  );

  return result.rows[0];
}

/**
 * Initialize Leitner progress for all user's flashcards
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of cards initialized
 */
export async function initializeAllCardsForUser(userId) {
  const result = await query(
    `INSERT INTO flashcard_leitner_progress (flashcard_id, user_id, current_box, last_reviewed, next_review, times_correct, times_incorrect)
     SELECT flashcard_id, $1, 1, NULL, NOW(), 0, 0
     FROM flashcards
     WHERE created_by = $1
     AND flashcard_id NOT IN (
       SELECT flashcard_id FROM flashcard_leitner_progress WHERE user_id = $1
     )
     RETURNING id`,
    [userId]
  );

  return result.rows.length;
}

/**
 * Get the day of week (0-6, where Friday is 5)
 * @param {Date} date - Date to check
 * @returns {number} Day of week
 */
function getDayOfWeek(date) {
  return date.getDay();
}

/**
 * Get cards due for practice today
 * Includes:
 * - Box 1: Always available (daily)
 * - Box 2: Every other day
 * - Box 3: Friday only (weekly)
 *
 * @param {string} userId - User ID
 * @returns {Promise<array>} Array of flashcards due today
 */
export async function getDueCardsForToday(userId) {
  const now = new Date();
  const dayOfWeek = getDayOfWeek(now);

  // Box 1 is always available
  // Box 2 is available on even days (0, 2, 4, 6) - Mon, Wed, Fri, Sun
  // Box 3 is available on Friday (5)
  const isEvenDay = dayOfWeek % 2 === 0;
  const isFriday = dayOfWeek === 5;

  let boxCondition = 'p.current_box = 1';
  if (isEvenDay) {
    boxCondition += ' OR p.current_box = 2';
  }
  if (isFriday) {
    boxCondition += ' OR p.current_box = 3';
  }

  const result = await query(
    `SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
     FROM flashcards f
     JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
     WHERE f.created_by = $1
     AND (${boxCondition})
     AND (p.next_review IS NULL OR p.next_review <= NOW())
     ORDER BY p.current_box ASC, p.last_reviewed ASC NULLS FIRST`,
    [userId]
  );

  return result.rows;
}

/**
 * Get all cards in a specific Leitner box for a user
 * @param {string} userId - User ID
 * @param {number} boxNumber - Box number (1, 2, or 3)
 * @returns {Promise<array>} Array of flashcards in the box
 */
export async function getCardsInBox(userId, boxNumber) {
  const result = await query(
    `SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
     FROM flashcards f
     JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
     WHERE f.created_by = $1 AND p.current_box = $2
     ORDER BY p.last_reviewed ASC NULLS FIRST`,
    [userId, boxNumber]
  );

  return result.rows;
}

/**
 * Get a random card due for practice from today's available cards
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} Flashcard or null if none available
 */
export async function getNextPracticeCard(userId) {
  const dueCards = await getDueCardsForToday(userId);

  if (dueCards.length === 0) {
    return null;
  }

  // Return random card from due cards
  const randomIndex = Math.floor(Math.random() * dueCards.length);
  return dueCards[randomIndex];
}

/**
 * Generate multiple choice options for a flashcard
 * Periodically includes "None of the above" option for critical thinking
 * Ratio: ~80-90% shows correct answer, ~10-20% shows "None of the above"
 * @param {string} userId - User ID
 * @param {object} correctCard - The correct card object
 * @param {number} optionCount - Number of options (default 4)
 * @returns {Promise<array>} Array of shuffled options with {text, isCorrect}
 */
export async function generateMultipleChoiceOptions(userId, correctCard, optionCount = 4) {
  // Get the none_of_above_count for this card
  const progressResult = await query(
    `SELECT none_of_above_count, times_correct, times_incorrect 
     FROM flashcard_leitner_progress 
     WHERE flashcard_id = $1 AND user_id = $2`,
    [correctCard.flashcard_id, userId]
  );

  let noneOfAboveCount = 0;
  let totalAttempts = 0;
  if (progressResult.rows.length > 0) {
    noneOfAboveCount = progressResult.rows[0].none_of_above_count || 0;
    totalAttempts =
      (progressResult.rows[0].times_correct || 0) + (progressResult.rows[0].times_incorrect || 0);
  }

  // Calculate ratio: aim for ~15% "None of the above" presentations
  // Formula: if (totalAttempts * 0.15) > noneOfAboveCount, show correct answer
  const shouldShowCorrectAnswer = totalAttempts === 0 || noneOfAboveCount / totalAttempts < 0.15;

  const options = [];

  if (shouldShowCorrectAnswer) {
    // Standard mode: show correct answer with wrong answers as distractors
    const wrongAnswersResult = await query(
      `SELECT answer 
       FROM (
         SELECT DISTINCT answer 
         FROM flashcards 
         WHERE created_by = $1 
         AND flashcard_id != $2 
         AND answer IS NOT NULL
         AND answer != $3
       ) AS distinct_answers
       ORDER BY RANDOM() 
       LIMIT $4`,
      [userId, correctCard.flashcard_id, correctCard.answer, optionCount - 1]
    );

    options.push({ text: correctCard.answer, isCorrect: true });
    wrongAnswersResult.rows.forEach((row) => {
      options.push({ text: row.answer, isCorrect: false });
    });
  } else {
    // "None of the above" mode: show wrong answers only, with "None of the above" as correct option
    const wrongAnswersResult = await query(
      `SELECT answer 
       FROM (
         SELECT DISTINCT answer 
         FROM flashcards 
         WHERE created_by = $1 
         AND flashcard_id != $2 
         AND answer IS NOT NULL
         AND answer != $3
       ) AS distinct_answers
       ORDER BY RANDOM() 
       LIMIT $4`,
      [userId, correctCard.flashcard_id, correctCard.answer, optionCount - 1]
    );

    wrongAnswersResult.rows.forEach((row) => {
      options.push({ text: row.answer, isCorrect: false });
    });

    options.push({ text: 'None of the above', isCorrect: true, isNoneOfAbove: true });
  }

  // Shuffle the options randomly
  return options.sort(() => Math.random() - 0.5);
}

/**
 * Record a practice attempt
 * @param {string} userId - User ID
 * @param {number} flashcardId - Flashcard ID
 * @param {boolean} isCorrect - Whether the answer was correct
 * @param {number} responseTimeMs - Time taken to answer in milliseconds
 * @returns {Promise<object>} Updated progress record
 */
export async function recordPracticeAttempt(userId, flashcardId, isCorrect, responseTimeMs = null) {
  // Record in history
  await query(
    `INSERT INTO practice_history (flashcard_id, user_id, leitner_box, correct, response_time_ms)
     SELECT $1, $2, p.current_box, $3, $4
     FROM flashcard_leitner_progress p
     WHERE p.flashcard_id = $1 AND p.user_id = $2`,
    [flashcardId, userId, isCorrect, responseTimeMs]
  );

  // Get current progress
  const currentResult = await query(
    `SELECT * FROM flashcard_leitner_progress 
     WHERE flashcard_id = $1 AND user_id = $2`,
    [flashcardId, userId]
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const current = currentResult.rows[0];
  let newBox = current.current_box;
  let newTimesCorrect = current.times_correct;
  let newTimesIncorrect = current.times_incorrect;

  if (isCorrect) {
    newTimesCorrect += 1;
    // Promote to next box if not already at Box 3
    if (newBox < 3) {
      newBox += 1;
    }
  } else {
    newTimesIncorrect += 1;
    // Demote back to Box 1
    newBox = 1;
  }

  // Update progress with new box and schedule next review
  const nextReview = calculateNextReviewDate(newBox);
  const updateResult = await query(
    `UPDATE flashcard_leitner_progress
     SET current_box = $1,
         last_reviewed = NOW(),
         next_review = $2,
         times_correct = $3,
         times_incorrect = $4,
         updated_at = NOW()
     WHERE flashcard_id = $5 AND user_id = $6
     RETURNING *`,
    [newBox, nextReview, newTimesCorrect, newTimesIncorrect, flashcardId, userId]
  );

  return updateResult.rows[0];
}

/**
 * Calculate next review date based on Leitner box
 * Box 1: Tomorrow (1 day)
 * Box 2: 3 days from now
 * Box 3: 7 days from now
 *
 * @param {number} boxNumber - Target box number
 * @returns {Date} Next review date
 */
function calculateNextReviewDate(boxNumber) {
  const now = new Date();
  let daysToAdd = 1;

  if (boxNumber === 2) {
    daysToAdd = 3;
  } else if (boxNumber === 3) {
    daysToAdd = 7;
  }

  const nextDate = new Date(now);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  nextDate.setHours(0, 0, 0, 0); // Set to start of day

  return nextDate;
}

/**
 * Get progress statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<object>} Statistics object
 */
export async function getProgressStats(userId) {
  // Count cards in each box
  const boxCountsResult = await query(
    `SELECT current_box, COUNT(*) as count
     FROM flashcard_leitner_progress
     WHERE user_id = $1
     GROUP BY current_box
     ORDER BY current_box`,
    [userId]
  );

  const boxCounts = { box1: 0, box2: 0, box3: 0 };
  boxCountsResult.rows.forEach((row) => {
    if (row.current_box === 1) boxCounts.box1 = parseInt(row.count);
    if (row.current_box === 2) boxCounts.box2 = parseInt(row.count);
    if (row.current_box === 3) boxCounts.box3 = parseInt(row.count);
  });

  // Get overall correct/incorrect counts
  const attemptsResult = await query(
    `SELECT 
       SUM(CASE WHEN correct THEN 1 ELSE 0 END) as total_correct,
       SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) as total_incorrect,
       COUNT(*) as total_attempts
     FROM practice_history
     WHERE user_id = $1`,
    [userId]
  );

  const attempts = attemptsResult.rows[0];
  const totalCorrect = parseInt(attempts.total_correct) || 0;
  const totalIncorrect = parseInt(attempts.total_incorrect) || 0;
  const accuracy =
    totalCorrect + totalIncorrect > 0
      ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100)
      : 0;

  return {
    box1: boxCounts.box1,
    box2: boxCounts.box2,
    box3: boxCounts.box3,
    total: boxCounts.box1 + boxCounts.box2 + boxCounts.box3,
    totalCorrect,
    totalIncorrect,
    totalAttempts: parseInt(attempts.total_attempts) || 0,
    accuracy,
  };
}

/**
 * Get current practice streak (consecutive correct answers)
 * @param {string} userId - User ID
 * @returns {Promise<number>} Current streak length
 */
export async function getPracticeStreak(userId) {
  // Get recent practice attempts ordered by date
  const result = await query(
    `SELECT correct, created_at
     FROM practice_history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );

  // Count consecutive correct answers from most recent
  let streak = 0;
  for (const row of result.rows) {
    if (row.correct) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get review schedule - when each box is next due
 * @param {string} userId - User ID
 * @returns {Promise<object>} Schedule information
 */
export async function getReviewSchedule(userId) {
  const now = new Date();
  const dayOfWeek = getDayOfWeek(now);

  // Determine when each box is due
  const box1Due = 'Today (Always)';
  let box2Due = 'Not today';

  if (dayOfWeek % 2 === 0 || dayOfWeek === 5) {
    box2Due = 'Today';
  }

  let box3Due;
  if (dayOfWeek === 5) {
    box3Due = 'Today';
  } else {
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    box3Due = `Friday (in ${daysUntilFriday} days)`;
  }

  // Get counts for each box
  const stats = await getProgressStats(userId);

  return {
    box1: {
      due: box1Due,
      count: stats.box1,
    },
    box2: {
      due: box2Due,
      count: stats.box2,
    },
    box3: {
      due: box3Due,
      count: stats.box3,
    },
  };
}

/**
 * Get today's practice summary (cards completed vs due)
 * @param {string} userId - User ID
 * @returns {Promise<object>} Today's summary
 */
export async function getTodaysSummary(userId) {
  const dueCards = await getDueCardsForToday(userId);

  // Get today's practice attempts
  const todayResult = await query(
    `SELECT COUNT(*) as attempts,
            SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct,
            SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) as incorrect
     FROM practice_history
     WHERE user_id = $1
     AND DATE(created_at) = CURRENT_DATE`,
    [userId]
  );

  const today = todayResult.rows[0];

  return {
    dueTodayCount: dueCards.length,
    practiceAttempts: parseInt(today.attempts) || 0,
    correctToday: parseInt(today.correct) || 0,
    incorrectToday: parseInt(today.incorrect) || 0,
  };
}
