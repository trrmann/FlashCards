/**
 * Practice & Leitner System Logic
 * Handles flashcard practice using the Leitner spaced repetition system
 * Enhanced with multiple repetitions per session for improved memorization
 * Supports filtering by class/category/lesson with wildcard support
 */

import { query } from '../db/connection.mjs';

/**
 * Convert filter pattern to SQL LIKE pattern with wildcard support
 * "Bio*" becomes "Bio%" for SQL LIKE
 * @param {string} filterValue - Filter value from user
 * @returns {string} SQL LIKE pattern or null if empty
 */
function getFilterPattern(filterValue) {
  if (!filterValue || filterValue.trim() === '') return null;

  const trimmed = filterValue.trim();
  // If ends with *, use it as wildcard pattern; otherwise exact match
  if (trimmed.endsWith('*')) {
    return trimmed.substring(0, trimmed.length - 1) + '%';
  }
  return trimmed;
}

/**
 * Get optimal number of repetitions for a card based on Leitner box
 * Research shows multiple exposures dramatically improve retention:
 * - Box 1 (struggling): 3 repetitions recommended
 * - Box 2 (medium): 2 repetitions recommended
 * - Box 3 (mastered): 1 repetition minimum
 * @param {number} boxNumber - Current Leitner box (1, 2, or 3)
 * @returns {number} Number of times card should be shown in session
 */
export function getCardRepetitionsNeeded(boxNumber) {
  // Research-based optimal repetitions per box
  if (boxNumber === 1) return 3; // Struggling cards need most reinforcement
  if (boxNumber === 2) return 2; // Medium difficulty needs moderate reinforcement
  return 1; // Mastered cards need minimal reinforcement
}

/**
 * Get current session attempt count for a card
 * @param {string} userId - User ID
 * @param {string} flashcardId - Flashcard ID
 * @param {Date} sessionStartTime - When the practice session started
 * @returns {Promise<number>} Number of attempts in current session
 */
export async function getSessionAttemptCount(userId, flashcardId, sessionStartTime) {
  const result = await query(
    `SELECT COUNT(*) as attempt_count 
     FROM session_card_attempts
     WHERE user_id = $1 
     AND flashcard_id = $2 
     AND session_start_time = $3`,
    [userId, flashcardId, sessionStartTime]
  );
  return parseInt(result.rows[0].attempt_count) || 0;
}

/**
 * Record an attempt within a practice session
 * @param {string} userId - User ID
 * @param {string} flashcardId - Flashcard ID
 * @param {Date} sessionStartTime - When the session started
 * @param {number} attemptNumber - Which attempt this is (1, 2, 3)
 * @param {boolean} wasCorrect - Whether answer was correct
 * @param {number} responseTimeMs - Time taken to answer
 * @returns {Promise<object>} Session attempt record
 */
export async function trackSessionAttempt(
  userId,
  flashcardId,
  sessionStartTime,
  attemptNumber,
  wasCorrect,
  responseTimeMs = null
) {
  const result = await query(
    `INSERT INTO session_card_attempts 
     (flashcard_id, user_id, session_start_time, attempt_number, was_correct, response_time_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [flashcardId, userId, sessionStartTime, attemptNumber, wasCorrect, responseTimeMs]
  );
  return result.rows[0];
}

/**
 * Check if card needs more attempts in current session
 * @param {string} userId - User ID
 * @param {string} flashcardId - Flashcard ID
 * @param {number} boxNumber - Current box number
 * @param {Date} sessionStartTime - Session start time
 * @returns {Promise<object>} {needsMoreAttempts, attemptNumber, totalNeeded}
 */
export async function checkNeedsMoreAttempts(userId, flashcardId, boxNumber, sessionStartTime) {
  const attemptCount = await getSessionAttemptCount(userId, flashcardId, sessionStartTime);
  const totalNeeded = getCardRepetitionsNeeded(boxNumber);
  const needsMoreAttempts = attemptCount < totalNeeded;

  return {
    needsMoreAttempts,
    attemptNumber: attemptCount + 1,
    totalNeeded,
    currentAttempt: attemptCount,
  };
}

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
 * @param {object} filters - Optional filters {class, lesson, category} - supports wildcards
 * @returns {Promise<array>} Array of flashcards due today
 */
export async function getDueCardsForToday(userId, filters = {}) {
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

  // Build filter conditions
  const filterConditions = [];
  const queryParams = [userId];
  let paramIndex = 2;

  const classPattern = getFilterPattern(filters.class);
  if (classPattern) {
    filterConditions.push(`f.class ILIKE $${paramIndex}`);
    queryParams.push(classPattern);
    paramIndex += 1;
  }

  const lessonPattern = getFilterPattern(filters.lesson);
  if (lessonPattern) {
    filterConditions.push(`f.lesson ILIKE $${paramIndex}`);
    queryParams.push(lessonPattern);
    paramIndex += 1;
  }

  const categoryPattern = getFilterPattern(filters.category);
  if (categoryPattern) {
    filterConditions.push(`f.category ILIKE $${paramIndex}`);
    queryParams.push(categoryPattern);
  }

  const filterClause = filterConditions.length > 0 ? 'AND ' + filterConditions.join(' AND ') : '';

  const result = await query(
    `SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
     FROM flashcards f
     JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
     WHERE f.created_by = $1
     AND (${boxCondition})
     AND (p.next_review IS NULL OR p.next_review <= NOW())
     ${filterClause}
     ORDER BY p.current_box ASC, p.last_reviewed ASC NULLS FIRST`,
    queryParams
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
 * Get next card for catch-up practice (any card user owns, not just due today)
 * Prioritizes cards not yet mastered (boxes 1 & 2)
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} Flashcard or null if none available
 */
export async function getNextCatchUpCard(userId) {
  // Get any card from boxes 1 or 2 (not mastered)
  const result = await query(
    `SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
     FROM flashcards f
     JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
     WHERE f.created_by = $1
     AND (p.current_box = 1 OR p.current_box = 2)
     ORDER BY RANDOM()
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Generate multiple choice options for a flashcard
 * Periodically includes "None of the above" option for critical thinking
 * Ratio: ~80-90% shows correct answer, ~10-20% shows "None of the above"
 * Wrong answers match the same class AND category as the practice card (allows different lessons)
 * @param {string} userId - User ID
 * @param {object} correctCard - The correct card object (must include class and category)
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
    // Wrong answers must match class AND category (but can be different lesson)
    const wrongAnswersResult = await query(
      `SELECT answer 
       FROM (
         SELECT DISTINCT answer 
         FROM flashcards 
         WHERE created_by = $1 
         AND flashcard_id != $2 
         AND answer IS NOT NULL
         AND answer != $3
         AND class = $4
         AND category = $5
       ) AS distinct_answers
       ORDER BY RANDOM() 
       LIMIT $6`,
      [
        userId,
        correctCard.flashcard_id,
        correctCard.answer,
        correctCard.class,
        correctCard.category,
        optionCount - 1,
      ]
    );

    options.push({ text: correctCard.answer, isCorrect: true });
    wrongAnswersResult.rows.forEach((row) => {
      options.push({ text: row.answer, isCorrect: false });
    });
  } else {
    // "None of the above" mode: show wrong answers only, with "None of the above" as correct option
    // Wrong answers must match class AND category (but can be different lesson)
    const wrongAnswersResult = await query(
      `SELECT answer 
       FROM (
         SELECT DISTINCT answer 
         FROM flashcards 
         WHERE created_by = $1 
         AND flashcard_id != $2 
         AND answer IS NOT NULL
         AND answer != $3
         AND class = $4
         AND category = $5
       ) AS distinct_answers
       ORDER BY RANDOM() 
       LIMIT $6`,
      [
        userId,
        correctCard.flashcard_id,
        correctCard.answer,
        correctCard.class,
        correctCard.category,
        optionCount - 1,
      ]
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

  // Update difficulty score in background (non-blocking)
  // This allows difficulty to adapt automatically as users practice
  updateDifficultyScore(flashcardId, userId).catch((error) => {
    console.error('Warning: Failed to update difficulty score:', error.message);
    // Non-critical, don't fail the entire operation
  });

  return updateResult.rows[0];
}

/**
 * Record practice attempt with session-aware repetition tracking
 * Determines if card needs more attempts within current session
 * @param {string} userId - User ID
 * @param {string} flashcardId - Flashcard ID
 * @param {boolean} isCorrect - Whether answer was correct
 * @param {number} responseTimeMs - Time taken to answer
 * @param {Date} sessionStartTime - When practice session started
 * @returns {Promise<object>} {progress, needsMoreAttempts, attemptNumber, totalNeeded, sessionData}
 */
export async function recordPracticeAttemptWithSession(
  userId,
  flashcardId,
  isCorrect,
  responseTimeMs = null,
  sessionStartTime = new Date()
) {
  // Get current box before any updates
  const currentResult = await query(
    `SELECT current_box FROM flashcard_leitner_progress 
     WHERE flashcard_id = $1 AND user_id = $2`,
    [flashcardId, userId]
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const currentBox = currentResult.rows[0].current_box;
  const totalAttemptsNeeded = getCardRepetitionsNeeded(currentBox);
  const currentAttemptCount = await getSessionAttemptCount(userId, flashcardId, sessionStartTime);
  const currentAttemptNumber = currentAttemptCount + 1;

  // Track this session attempt
  await trackSessionAttempt(
    userId,
    flashcardId,
    sessionStartTime,
    currentAttemptNumber,
    isCorrect,
    responseTimeMs
  );

  // Record in practice history
  await query(
    `INSERT INTO practice_history (flashcard_id, user_id, leitner_box, correct, response_time_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [flashcardId, userId, currentBox, isCorrect, responseTimeMs]
  );

  // Check if all repetitions complete
  const needsMoreAttempts = currentAttemptNumber < totalAttemptsNeeded;

  // Only move card if all repetitions are done
  let progress = null;
  if (!needsMoreAttempts) {
    progress = await recordPracticeAttempt(userId, flashcardId, isCorrect, responseTimeMs);
  }

  return {
    progress,
    needsMoreAttempts,
    attemptNumber: currentAttemptNumber,
    totalNeeded: totalAttemptsNeeded,
    sessionData: {
      sessionStartTime,
      isComplete: !needsMoreAttempts,
      feedback: needsMoreAttempts
        ? `Attempt ${currentAttemptNumber}/${totalAttemptsNeeded}. Keep going!`
        : `All ${totalAttemptsNeeded} attempts complete!`,
    },
  };
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

/**
 * Reset all Leitner progress for a user (admin function)
 * Resets all cards back to Box 1 with zero stats
 * @param {string} userId - User ID whose stats to reset
 * @returns {Promise<object>} Result with number of cards reset
 */
export async function resetUserLeitnerStats(userId) {
  // Reset all Leitner progress for this user's cards
  const result = await query(
    `UPDATE flashcard_leitner_progress
     SET current_box = 1,
         last_reviewed = NULL,
         next_review = NOW(),
         times_correct = 0,
         times_incorrect = 0,
         none_of_above_count = 0
     WHERE user_id = $1
     RETURNING flashcard_id`,
    [userId]
  );

  return {
    cardsReset: result.rows.length,
    message: `Reset Leitner progress for ${result.rows.length} flashcard(s)`,
  };
}

/**
 * Calculate difficulty score based on success rate
 * Difficulty scale: 1.0 (very easy) to 5.0 (very hard)
 * Formula: 5.0 - (success_rate * 4.0)
 * Examples:
 *   100% success rate = 1.0 (very easy)
 *   75% success rate = 2.0 (easy)
 *   50% success rate = 3.0 (medium)
 *   25% success rate = 4.0 (hard)
 *   0% success rate = 5.0 (very hard)
 *
 * @param {number} successRate - Decimal between 0 and 1 (0-100%)
 * @returns {number} Difficulty score 1.0-5.0
 */
function calculateDifficultyFromSuccessRate(successRate) {
  // Clamp success rate to 0-1
  const rate = Math.max(0, Math.min(1, successRate));
  // Convert to difficulty: 1.0 = very easy (100% success), 5.0 = very hard (0% success)
  return parseFloat((5.0 - rate * 4.0).toFixed(2));
}

/**
 * Update difficulty score for a flashcard based on performance data
 * For shared cards: uses all users' performance
 * For private cards: uses only that user's performance
 *
 * @param {string} flashcardId - Flashcard ID
 * @param {string} _userId - User ID (for private cards) - currently unused but kept for API compatibility
 * @returns {Promise<object>} Update result with old/new scores
 */
export async function updateDifficultyScore(flashcardId, _userId = null) {
  try {
    // Get flashcard info
    const cardResult = await query(
      `SELECT is_private, created_by FROM flashcards WHERE flashcard_id = $1`,
      [flashcardId]
    );

    if (cardResult.rows.length === 0) {
      return { error: 'Flashcard not found' };
    }

    const { is_private, created_by } = cardResult.rows[0];

    // Get current difficulty
    const currentResult = await query(
      `SELECT difficulty_score FROM flashcards WHERE flashcard_id = $1`,
      [flashcardId]
    );
    const oldScore = currentResult.rows[0].difficulty_score;

    let successRate = 0;
    let sampleSize = 0;
    let calculationBasis = '';

    if (is_private) {
      // Private card: use only the owner's data
      const ownerStats = await query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct
         FROM practice_history
         WHERE flashcard_id = $1 AND user_id = $2`,
        [flashcardId, created_by]
      );

      sampleSize = parseInt(ownerStats.rows[0].total) || 0;
      const correctCount = parseInt(ownerStats.rows[0].correct) || 0;
      successRate = sampleSize > 0 ? correctCount / sampleSize : 0.5; // Default to medium if no data
      calculationBasis = `Owner only (${sampleSize} attempts)`;
    } else {
      // Shared card: use all users' data
      const sharedStats = await query(
        `SELECT COUNT(*) as total, SUM(CASE WHEN correct THEN 1 ELSE 0 END) as correct
         FROM practice_history
         WHERE flashcard_id = $1`,
        [flashcardId]
      );

      sampleSize = parseInt(sharedStats.rows[0].total) || 0;
      const correctCount = parseInt(sharedStats.rows[0].correct) || 0;
      successRate = sampleSize > 0 ? correctCount / sampleSize : 0.5; // Default to medium if no data
      calculationBasis = `All users (${sampleSize} attempts)`;
    }

    // Calculate new difficulty
    const newScore = calculateDifficultyFromSuccessRate(successRate);

    // Update the difficulty score
    await query(
      `UPDATE flashcards 
       SET difficulty_score = $1,
           last_difficulty_update = NOW(),
           difficulty_calc_base = $2
       WHERE flashcard_id = $3`,
      [newScore, is_private ? 'individual' : 'shared', flashcardId]
    );

    // Record in difficulty history
    if (newScore !== oldScore) {
      await query(
        `INSERT INTO difficulty_history 
         (flashcard_id, old_score, new_score, calculation_basis, sample_size, success_rate)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          flashcardId,
          oldScore,
          newScore,
          calculationBasis,
          sampleSize,
          (successRate * 100).toFixed(2),
        ]
      );
    }

    return {
      flashcardId,
      oldScore,
      newScore,
      successRate: (successRate * 100).toFixed(2),
      sampleSize,
      calculationBasis,
      changed: newScore !== oldScore,
    };
  } catch (error) {
    console.error('Error updating difficulty score:', error);
    return { error: error.message };
  }
}

/**
 * Batch update difficulty scores for all flashcards in a class/lesson
 * Useful to run periodically to keep difficulties current
 *
 * @param {string} userId - User ID (for filtering private cards)
 * @param {string} lessonFilter - Optional: filter by lesson name
 * @returns {Promise<array>} Array of update results
 */
export async function batchUpdateDifficultyScores(userId, lessonFilter = null) {
  try {
    // Get all flashcards (public and user's private ones)
    let query_text = `
      SELECT DISTINCT flashcard_id 
      FROM flashcards 
      WHERE is_private = false OR created_by = $1
    `;
    const params = [userId];

    if (lessonFilter) {
      query_text += ` AND lesson = $2`;
      params.push(lessonFilter);
    }

    const cardsResult = await query(query_text, params);
    const updates = [];

    for (const row of cardsResult.rows) {
      const result = await updateDifficultyScore(row.flashcard_id, userId);
      if (result.changed || result.error) {
        updates.push(result);
      }
    }

    return updates;
  } catch (error) {
    console.error('Error in batch update:', error);
    return [{ error: error.message }];
  }
}

/**
 * Get difficulty statistics for all cards
 * Returns distribution of difficulty scores
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} Difficulty statistics
 */
export async function getDifficultyStats(userId) {
  try {
    const result = await query(
      `SELECT 
        COUNT(*) as total_cards,
        ROUND(AVG(difficulty_score), 2) as avg_difficulty,
        MIN(difficulty_score) as easiest,
        MAX(difficulty_score) as hardest,
        COUNT(CASE WHEN difficulty_score >= 1.0 AND difficulty_score < 2.0 THEN 1 END) as very_easy,
        COUNT(CASE WHEN difficulty_score >= 2.0 AND difficulty_score < 3.0 THEN 1 END) as easy,
        COUNT(CASE WHEN difficulty_score >= 3.0 AND difficulty_score < 4.0 THEN 1 END) as medium,
        COUNT(CASE WHEN difficulty_score >= 4.0 AND difficulty_score < 5.0 THEN 1 END) as hard,
        COUNT(CASE WHEN difficulty_score >= 5.0 THEN 1 END) as very_hard
       FROM flashcards
       WHERE is_private = false OR created_by = $1`,
      [userId]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error getting difficulty stats:', error);
    return { error: error.message };
  }
}
