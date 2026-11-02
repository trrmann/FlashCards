/**
 * Practice & Leitner System Logic
 * Handles flashcard practice using the Leitner spaced repetition system
 * Enhanced with multiple repetitions per session for improved memorization
 * Supports filtering by class/category/lesson with wildcard support
 */

import { flashCardsDb } from '../db/flashCardsDb.mjs';

class PracticeService {
  static queries = flashCardsDb.constructor.loadNamedSqlStatements(
    'pg/practice-queries.sql',
    flashCardsDb.constructor.sqlRoot
  );

  constructor(database = flashCardsDb) {
    this.database = database;
  }

  /**
   * Convert filter pattern to SQL LIKE pattern with wildcard support
   * "Bio*" becomes "Bio%" for SQL LIKE
   * @param {string} filterValue - Filter value from user
   * @returns {string} SQL LIKE pattern or null if empty
   */
  getFilterPattern(filterValue) {
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
  getCardRepetitionsNeeded(boxNumber) {
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
  async getSessionAttemptCount(userId, flashcardId, sessionStartTime) {
    const result = await this.database.query(this.constructor.queries.count_session_attempts, [
      userId,
      flashcardId,
      sessionStartTime,
    ]);
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
  async trackSessionAttempt(
    userId,
    flashcardId,
    sessionStartTime,
    attemptNumber,
    wasCorrect,
    responseTimeMs = null
  ) {
    const result = await this.database.query(this.constructor.queries.insert_session_attempt, [
      flashcardId,
      userId,
      sessionStartTime,
      attemptNumber,
      wasCorrect,
      responseTimeMs,
    ]);
    return result.rows[0];
  }

  /**
   * Initialize Leitner progress for all user's flashcards
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of cards initialized
   */
  async initializeAllCardsForUser(userId) {
    const result = await this.database.query(
      this.constructor.queries.insert_leitner_progress_for_all_cards,
      [userId]
    );

    return result.rows.length;
  }

  /**
   * Get the day of week (0-6, where Friday is 5)
   * @param {Date} date - Date to check
   * @returns {number} Day of week
   */
  getDayOfWeek(date) {
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
  async getDueCardsForToday(userId, filters = {}) {
    const now = new Date();
    const dayOfWeek = this.getDayOfWeek(now);

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

    const classPattern = this.getFilterPattern(filters.class);
    if (classPattern) {
      filterConditions.push(`f.class ILIKE $${paramIndex}`);
      queryParams.push(classPattern);
      paramIndex += 1;
    }

    const lessonPattern = this.getFilterPattern(filters.lesson);
    if (lessonPattern) {
      filterConditions.push(`f.lesson ILIKE $${paramIndex}`);
      queryParams.push(lessonPattern);
      paramIndex += 1;
    }

    const categoryPattern = this.getFilterPattern(filters.category);
    if (categoryPattern) {
      filterConditions.push(`f.category ILIKE $${paramIndex}`);
      queryParams.push(categoryPattern);
    }

    const filterClause = filterConditions.length > 0 ? 'AND ' + filterConditions.join(' AND ') : '';

    const result = await this.database.query(
      this.constructor.queries.select_due_cards_template
        .replace('{{box_condition}}', boxCondition)
        .replace('{{filter_clause}}', filterClause),
      queryParams
    );

    console.log(`[DEBUG] getDueCardsForToday - Result count: ${result.rows.length}`);

    return result.rows;
  }

  /**
   * Get next card for catch-up practice (any card user owns, not just due today)
   * Prioritizes cards not yet mastered (boxes 1 & 2)
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} Flashcard or null if none available
   */
  async getNextCatchUpCard(userId) {
    // Get any card from boxes 1 or 2 (not mastered)
    const result = await this.database.query(this.constructor.queries.select_catch_up_card, [
      userId,
    ]);

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
   * @returns {Promise<array|object>} Array of shuffled options OR {insufficientOptions: true, diagnostic: {...}}
   */
  async generateMultipleChoiceOptions(userId, correctCard, optionCount = 4) {
    console.log(
      `[DEBUG] generateMultipleChoiceOptions - Card: ${correctCard.question.substring(0, 40)}..., Class: ${correctCard.class}, Category: ${correctCard.category}`
    );

    // Get the none_of_above_count for this card
    const progressResult = await this.database.query(
      this.constructor.queries.select_leitner_counters,
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
      // Use COALESCE to handle NULL values: NULL = NULL should match
      const wrongAnswersResult = await this.database.query(
        this.constructor.queries.select_wrong_answers,
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

      console.log(
        `[DEBUG] generateMultipleChoiceOptions - Found ${wrongAnswersResult.rows.length} wrong answers (Standard mode)`
      );
    } else {
      // "None of the above" mode: show wrong answers only, with "None of the above" as correct option
      // Wrong answers must match class AND category (but can be different lesson)
      // Use COALESCE to handle NULL values: NULL = NULL should match
      const wrongAnswersResult = await this.database.query(
        this.constructor.queries.select_wrong_answers,
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

      console.log(
        `[DEBUG] generateMultipleChoiceOptions - Found ${wrongAnswersResult.rows.length} wrong answers (None of above mode)`
      );
    }

    // Check if we have at least 2 options (1 correct + 1 wrong)
    console.log(
      `[DEBUG] generateMultipleChoiceOptions - Total options: ${options.length}, Returning: ${options.length >= 2 ? 'options' : 'diagnostic (insufficient)'}`
    );
    if (options.length < 2) {
      // Return diagnostic information about what's missing
      const wrongAnswerCount = options.length - 1; // Subtract the correct answer
      const neededCount = optionCount - 1 - wrongAnswerCount; // How many more wrong answers needed

      return {
        insufficientOptions: true,
        diagnostic: {
          currentCard: {
            question: correctCard.question.substring(0, 60),
            class: correctCard.class || '(No Class)',
            category: correctCard.category || '(No Category)',
            lesson: correctCard.lesson || '(No Lesson)',
          },
          availableWrongAnswers: wrongAnswerCount,
          neededWrongAnswers: neededCount,
          totalOptionsNeeded: optionCount,
          message: `Add at least ${neededCount} more flashcard${neededCount !== 1 ? 's' : ''} with Class: "${correctCard.class || 'empty'}" and Category: "${correctCard.category || 'empty'}" to create proper multiple choice options.`,
        },
      };
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
  async recordPracticeAttempt(
    userId,
    flashcardId,
    isCorrect,
    responseTimeMs = null,
    filterContext = null
  ) {
    // Get the flashcard to access its class, lesson, category
    const cardResult = await this.database.query(
      this.constructor.queries.select_card_classification,
      [flashcardId]
    );

    let cardClass = null;
    let cardLesson = null;
    let cardCategory = null;

    if (cardResult.rows.length > 0) {
      const card = cardResult.rows[0];
      // Use filter context if provided (non-empty), otherwise use card's actual values
      // This ensures we always capture the card's data even if filter context is null/empty
      cardClass =
        filterContext?.class && filterContext.class !== '' ? filterContext.class : card.class;
      cardLesson =
        filterContext?.lesson && filterContext.lesson !== '' ? filterContext.lesson : card.lesson;
      cardCategory =
        filterContext?.category && filterContext.category !== ''
          ? filterContext.category
          : card.category;
    }

    // Record in history with filter context
    await this.database.query(this.constructor.queries.insert_practice_history_from_progress, [
      flashcardId,
      userId,
      isCorrect,
      responseTimeMs,
      cardClass,
      cardLesson,
      cardCategory,
    ]);

    // Get current progress
    const currentResult = await this.database.query(
      this.constructor.queries.select_leitner_progress,
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
    const nextReview = this.calculateNextReviewDate(newBox);
    const updateResult = await this.database.query(
      this.constructor.queries.update_leitner_after_attempt,
      [newBox, nextReview, newTimesCorrect, newTimesIncorrect, flashcardId, userId]
    );

    // Update difficulty score in background (non-blocking)
    // This allows difficulty to adapt automatically as users practice
    this.updateDifficultyScore(flashcardId, userId).catch((error) => {
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
   * @param {object} filterContext - Active filter context {class, lesson, category}
   * @returns {Promise<object>} {progress, needsMoreAttempts, attemptNumber, totalNeeded, sessionData}
   */
  async recordPracticeAttemptWithSession(
    userId,
    flashcardId,
    isCorrect,
    responseTimeMs = null,
    sessionStartTime = new Date(),
    filterContext = null
  ) {
    // Get current box before any updates
    const currentResult = await this.database.query(this.constructor.queries.select_current_box, [
      flashcardId,
      userId,
    ]);

    if (currentResult.rows.length === 0) {
      return null;
    }

    const currentBox = currentResult.rows[0].current_box;
    const totalAttemptsNeeded = this.getCardRepetitionsNeeded(currentBox);
    const currentAttemptCount = await this.getSessionAttemptCount(
      userId,
      flashcardId,
      sessionStartTime
    );
    const currentAttemptNumber = currentAttemptCount + 1;

    console.log(
      `[recordPracticeAttemptWithSession] Card: ${flashcardId}, Attempt: ${currentAttemptNumber}/${totalAttemptsNeeded}, IsCorrect: ${isCorrect}`
    );

    // Track this session attempt
    try {
      await this.trackSessionAttempt(
        userId,
        flashcardId,
        sessionStartTime,
        currentAttemptNumber,
        isCorrect,
        responseTimeMs
      );
      console.log(`[trackSessionAttempt] Success - recorded attempt ${currentAttemptNumber}`);
    } catch (error) {
      console.error(`[trackSessionAttempt] Error:`, error.message);
      throw error;
    }

    // Get the flashcard to access its class, lesson, category
    const cardResult = await this.database.query(
      this.constructor.queries.select_card_classification,
      [flashcardId]
    );

    let cardClass = null;
    let cardLesson = null;
    let cardCategory = null;

    if (cardResult.rows.length > 0) {
      const card = cardResult.rows[0];
      // Use filter context if provided (non-empty), otherwise use card's actual values
      // This ensures we always capture the card's data even if filter context is null/empty
      cardClass =
        filterContext?.class && filterContext.class !== '' ? filterContext.class : card.class;
      cardLesson =
        filterContext?.lesson && filterContext.lesson !== '' ? filterContext.lesson : card.lesson;
      cardCategory =
        filterContext?.category && filterContext.category !== ''
          ? filterContext.category
          : card.category;
    }

    // Record in practice history with filter context
    try {
      const historyResult = await this.database.query(
        this.constructor.queries.insert_practice_history,
        [
          flashcardId,
          userId,
          currentBox,
          isCorrect,
          responseTimeMs,
          cardClass,
          cardLesson,
          cardCategory,
        ]
      );
      console.log(
        `[practice_history] Success - recorded with id: ${historyResult.rows[0]?.id}, filter: class=${cardClass}, lesson=${cardLesson}, category=${cardCategory}`
      );
    } catch (error) {
      console.error(`[practice_history] Error:`, error.message);
      throw error;
    }

    // Check if all repetitions complete
    const needsMoreAttempts = currentAttemptNumber < totalAttemptsNeeded;
    console.log(`[recordPracticeAttemptWithSession] NeedsMoreAttempts: ${needsMoreAttempts}`);

    // Update attempt counts EVERY time (not just when complete)
    // This ensures times_correct and times_incorrect are tracked per attempt
    const progressResult = await this.database.query(
      this.constructor.queries.select_leitner_progress,
      [flashcardId, userId]
    );

    if (progressResult.rows.length > 0) {
      const current = progressResult.rows[0];
      let newTimesCorrect = current.times_correct;
      let newTimesIncorrect = current.times_incorrect;
      let newBox = current.current_box;

      if (isCorrect) {
        newTimesCorrect += 1;
      } else {
        newTimesIncorrect += 1;
      }

      // When session is complete, apply box progression logic
      if (!needsMoreAttempts) {
        // All attempts done - now determine box progression based on overall session performance
        // Count correct vs incorrect in this entire session
        const sessionStatsResult = await this.database.query(
          this.constructor.queries.select_session_stats,
          [flashcardId, userId, sessionStartTime]
        );

        const sessionStats = sessionStatsResult.rows[0] || {};
        const sessionCorrect = parseInt(sessionStats.session_correct) || 0;
        const sessionIncorrect = parseInt(sessionStats.session_incorrect) || 0;

        console.log(
          `[recordPracticeAttemptWithSession] Session complete: correct=${sessionCorrect}, incorrect=${sessionIncorrect}`
        );

        // Box progression: ALL attempts must be correct to promote, ANY incorrect means demote
        if (sessionIncorrect === 0 && sessionCorrect > 0) {
          // All correct - promote to next box (unless already at Box 3)
          if (newBox < 3) {
            newBox += 1;
            console.log(
              `[recordPracticeAttemptWithSession] Promoting card from Box ${newBox - 1} to Box ${newBox}`
            );
          }
        } else if (sessionIncorrect > 0) {
          // Any incorrect - demote back to Box 1
          console.log(
            `[recordPracticeAttemptWithSession] Demoting card to Box 1 (had ${sessionIncorrect} incorrect)`
          );
          newBox = 1;
        }
      }

      // Update times_correct, times_incorrect, and potentially current_box
      const nextReview = !needsMoreAttempts ? this.calculateNextReviewDate(newBox) : null;

      if (!needsMoreAttempts) {
        // Session complete - update all fields
        await this.database.query(this.constructor.queries.update_leitner_session_complete, [
          newTimesCorrect,
          newTimesIncorrect,
          newBox,
          nextReview,
          flashcardId,
          userId,
        ]);
        console.log(
          `[recordPracticeAttemptWithSession] Session complete update: correct=${newTimesCorrect}, incorrect=${newTimesIncorrect}, box=${newBox}`
        );
      } else {
        // Session in progress - update only attempt counts
        await this.database.query(this.constructor.queries.update_leitner_mid_session, [
          newTimesCorrect,
          newTimesIncorrect,
          flashcardId,
          userId,
        ]);
        console.log(
          `[recordPracticeAttemptWithSession] Mid-session update: correct=${newTimesCorrect}, incorrect=${newTimesIncorrect}`
        );
      }
    }

    // Return session data
    return {
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
  calculateNextReviewDate(boxNumber) {
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
  /**
   * Get progress statistics for user
   * @param {string} userId - User ID
   * @param {object} filters - Optional filters {class, lesson, category} to limit stats to specific cards
   * @returns {Promise<object>} Box counts and accuracy stats
   */
  async getProgressStats(userId, filters = {}) {
    // Build filter conditions (same as getDueCardsForToday)
    const filterConditions = [];
    const queryParams = [userId];
    let paramIndex = 2;

    const classPattern = this.getFilterPattern(filters.class);
    if (classPattern) {
      filterConditions.push(`f.class ILIKE $${paramIndex}`);
      queryParams.push(classPattern);
      paramIndex += 1;
    }

    const lessonPattern = this.getFilterPattern(filters.lesson);
    if (lessonPattern) {
      filterConditions.push(`f.lesson ILIKE $${paramIndex}`);
      queryParams.push(lessonPattern);
      paramIndex += 1;
    }

    const categoryPattern = this.getFilterPattern(filters.category);
    if (categoryPattern) {
      filterConditions.push(`f.category ILIKE $${paramIndex}`);
      queryParams.push(categoryPattern);
    }

    const filterClause = filterConditions.length > 0 ? 'AND ' + filterConditions.join(' AND ') : '';

    console.log(
      `[DEBUG] getProgressStats - Filters: class=${filters.class}, lesson=${filters.lesson}, category=${filters.category}`,
      `Filter SQL: ${filterClause}`
    );

    // Count cards in each box with filters applied
    const boxCountsResult = await this.database.query(
      this.constructor.queries.select_box_counts_template.replace(
        '{{filter_clause}}',
        filterClause
      ),
      queryParams
    );

    const boxCounts = { box1: 0, box2: 0, box3: 0 };
    boxCountsResult.rows.forEach((row) => {
      if (row.current_box === 1) boxCounts.box1 = parseInt(row.count);
      if (row.current_box === 2) boxCounts.box2 = parseInt(row.count);
      if (row.current_box === 3) boxCounts.box3 = parseInt(row.count);
    });

    console.log(
      `[DEBUG] getProgressStats - Box counts: box1=${boxCounts.box1}, box2=${boxCounts.box2}, box3=${boxCounts.box3}`
    );

    // Get overall correct/incorrect counts WITH FILTERS APPLIED
    // IMPORTANT: Filter by CARD properties (f.class, f.lesson, f.category), NOT by
    // practice_history filter fields (ph.class, ph.lesson, ph.category) which represent
    // what filters were active when the attempt was made, not the card's actual properties
    const attemptsResult = await this.database.query(
      this.constructor.queries.select_attempt_totals_template.replace(
        '{{filter_clause}}',
        filterClause
      ),
      queryParams
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
  async getPracticeStreak(userId) {
    // Get recent practice attempts ordered by date
    const result = await this.database.query(
      this.constructor.queries.select_recent_practice_results,
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
  async getReviewSchedule(userId) {
    const now = new Date();
    const dayOfWeek = this.getDayOfWeek(now);

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
    const stats = await this.getProgressStats(userId);

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
  async getTodaysSummary(userId, filters = {}) {
    const dueCards = await this.getDueCardsForToday(userId, filters);

    // Build filter conditions for practice history (same as getDueCardsForToday)
    const filterConditions = [];
    const queryParams = [userId];
    let paramIndex = 2;

    const classPattern = this.getFilterPattern(filters.class);
    if (classPattern) {
      filterConditions.push(`f.class ILIKE $${paramIndex}`);
      queryParams.push(classPattern);
      paramIndex += 1;
    }

    const lessonPattern = this.getFilterPattern(filters.lesson);
    if (lessonPattern) {
      filterConditions.push(`f.lesson ILIKE $${paramIndex}`);
      queryParams.push(lessonPattern);
      paramIndex += 1;
    }

    const categoryPattern = this.getFilterPattern(filters.category);
    if (categoryPattern) {
      filterConditions.push(`f.category ILIKE $${paramIndex}`);
      queryParams.push(categoryPattern);
    }

    const filterClause = filterConditions.length > 0 ? 'AND ' + filterConditions.join(' AND ') : '';

    // Get today's practice attempts (with filters applied)
    const todayResult = await this.database.query(
      this.constructor.queries.select_todays_summary_template.replace(
        '{{filter_clause}}',
        filterClause
      ),
      queryParams
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
  async resetUserLeitnerStats(userId) {
    // Reset all Leitner progress for this user's cards
    const result = await this.database.query(this.constructor.queries.reset_user_leitner_progress, [
      userId,
    ]);

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
  calculateDifficultyFromSuccessRate(successRate) {
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
  async updateDifficultyScore(flashcardId, _userId = null) {
    try {
      // Get flashcard info
      const cardResult = await this.database.query(this.constructor.queries.select_card_privacy, [
        flashcardId,
      ]);

      if (cardResult.rows.length === 0) {
        return { error: 'Flashcard not found' };
      }

      const { is_private, created_by } = cardResult.rows[0];

      // Get current difficulty
      const currentResult = await this.database.query(
        this.constructor.queries.select_card_difficulty_score,
        [flashcardId]
      );
      const oldScore = currentResult.rows[0].difficulty_score;

      let successRate = 0;
      let sampleSize = 0;
      let calculationBasis = '';

      if (is_private) {
        // Private card: use only the owner's data
        const ownerStats = await this.database.query(
          this.constructor.queries.select_owner_practice_stats,
          [flashcardId, created_by]
        );

        sampleSize = parseInt(ownerStats.rows[0].total) || 0;
        const correctCount = parseInt(ownerStats.rows[0].correct) || 0;
        successRate = sampleSize > 0 ? correctCount / sampleSize : 0.5; // Default to medium if no data
        calculationBasis = `Owner only (${sampleSize} attempts)`;
      } else {
        // Shared card: use all users' data
        const sharedStats = await this.database.query(
          this.constructor.queries.select_all_practice_stats,
          [flashcardId]
        );

        sampleSize = parseInt(sharedStats.rows[0].total) || 0;
        const correctCount = parseInt(sharedStats.rows[0].correct) || 0;
        successRate = sampleSize > 0 ? correctCount / sampleSize : 0.5; // Default to medium if no data
        calculationBasis = `All users (${sampleSize} attempts)`;
      }

      // Calculate new difficulty
      const newScore = this.calculateDifficultyFromSuccessRate(successRate);

      // Update the difficulty score
      await this.database.query(this.constructor.queries.update_card_difficulty, [
        newScore,
        is_private ? 'individual' : 'shared',
        flashcardId,
      ]);

      // Record in difficulty history
      if (newScore !== oldScore) {
        await this.database.query(this.constructor.queries.insert_difficulty_history, [
          flashcardId,
          oldScore,
          newScore,
          calculationBasis,
          sampleSize,
          (successRate * 100).toFixed(2),
        ]);
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
  async batchUpdateDifficultyScores(userId, lessonFilter = null) {
    try {
      // Get all flashcards (public and user's private ones)
      const lessonFilterClause = lessonFilter ? 'AND lesson = $2' : '';
      const params = [userId];

      if (lessonFilter) {
        params.push(lessonFilter);
      }

      const cardsResult = await this.database.query(
        this.constructor.queries.select_cards_for_difficulty_update_template.replace(
          '{{lesson_filter}}',
          lessonFilterClause
        ),
        params
      );
      const updates = [];

      for (const row of cardsResult.rows) {
        const result = await this.updateDifficultyScore(row.flashcard_id, userId);
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
  async getDifficultyStats(userId) {
    try {
      const result = await this.database.query(this.constructor.queries.select_difficulty_stats, [
        userId,
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Error getting difficulty stats:', error);
      return { error: error.message };
    }
  }

  /**
   * Increment the "None of the above" presentation counter for a card
   * @param {string} flashcardId - Flashcard ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async incrementNoneOfAboveCount(flashcardId, userId) {
    await this.database.query(this.constructor.queries.increment_none_of_above_count, [
      flashcardId,
      userId,
    ]);
  }

  /**
   * Get a card's answer along with its current Leitner box for a user
   * @param {string} flashcardId - Flashcard ID
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} { answer, current_box } or null
   */
  async getCardAnswerWithBox(flashcardId, userId) {
    const result = await this.database.query(this.constructor.queries.select_card_answer_with_box, [
      flashcardId,
      userId,
    ]);
    return result.rows[0] || null;
  }
}

export const practiceService = new PracticeService();

export { PracticeService };
export default practiceService;
