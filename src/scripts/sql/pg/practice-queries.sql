-- Query: count_session_attempts
SELECT COUNT(*) AS attempt_count
FROM session_card_attempts
WHERE user_id = $1
  AND flashcard_id = $2
  AND session_start_time = $3;

-- Query: insert_session_attempt
INSERT INTO session_card_attempts
  (flashcard_id, user_id, session_start_time, attempt_number, was_correct, response_time_ms)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- Query: select_leitner_progress
SELECT * FROM flashcard_leitner_progress
WHERE flashcard_id = $1 AND user_id = $2;

-- Query: insert_leitner_progress
INSERT INTO flashcard_leitner_progress
  (flashcard_id, user_id, current_box, last_reviewed, next_review, times_correct, times_incorrect)
VALUES ($1, $2, 1, NULL, NOW(), 0, 0)
RETURNING *;

-- Query: insert_leitner_progress_for_all_cards
INSERT INTO flashcard_leitner_progress
  (flashcard_id, user_id, current_box, last_reviewed, next_review, times_correct, times_incorrect)
SELECT flashcard_id, $1, 1, NULL, NOW(), 0, 0
FROM flashcards
WHERE created_by = $1
  AND flashcard_id NOT IN (
    SELECT flashcard_id FROM flashcard_leitner_progress WHERE user_id = $1
  )
RETURNING id;

-- Query: select_due_cards_template
SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
FROM flashcards f
JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
WHERE f.created_by = $1
  AND ({{box_condition}})
  AND (p.next_review IS NULL OR p.next_review <= NOW())
  {{filter_clause}}
ORDER BY p.current_box ASC, p.last_reviewed ASC NULLS FIRST;

-- Query: select_cards_in_box
SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
FROM flashcards f
JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
WHERE f.created_by = $1 AND p.current_box = $2
ORDER BY p.last_reviewed ASC NULLS FIRST;

-- Query: select_catch_up_card
SELECT f.*, p.current_box, p.times_correct, p.times_incorrect, p.last_reviewed, p.next_review
FROM flashcards f
JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id
WHERE f.created_by = $1
  AND (p.current_box = 1 OR p.current_box = 2)
ORDER BY RANDOM()
LIMIT 1;

-- Query: select_leitner_counters
SELECT none_of_above_count, times_correct, times_incorrect
FROM flashcard_leitner_progress
WHERE flashcard_id = $1 AND user_id = $2;

-- Query: select_wrong_answers
SELECT answer
FROM (
  SELECT DISTINCT answer
  FROM flashcards
  WHERE created_by = $1
    AND flashcard_id != $2
    AND answer IS NOT NULL
    AND answer != $3
    AND COALESCE(class, '') = COALESCE($4, '')
    AND COALESCE(category, '') = COALESCE($5, '')
) AS distinct_answers
ORDER BY RANDOM()
LIMIT $6;

-- Query: select_card_classification
SELECT class, lesson, category FROM flashcards WHERE flashcard_id = $1;

-- Query: insert_practice_history_from_progress
INSERT INTO practice_history
  (flashcard_id, user_id, leitner_box, correct, response_time_ms, class, lesson, category)
SELECT $1, $2, p.current_box, $3, $4, $5, $6, $7
FROM flashcard_leitner_progress p
WHERE p.flashcard_id = $1 AND p.user_id = $2;

-- Query: insert_practice_history
INSERT INTO practice_history
  (flashcard_id, user_id, leitner_box, correct, response_time_ms, class, lesson, category)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id;

-- Query: update_leitner_after_attempt
UPDATE flashcard_leitner_progress
SET current_box = $1,
    last_reviewed = NOW(),
    next_review = $2,
    times_correct = $3,
    times_incorrect = $4,
    updated_at = NOW()
WHERE flashcard_id = $5 AND user_id = $6
RETURNING *;

-- Query: select_current_box
SELECT current_box FROM flashcard_leitner_progress
WHERE flashcard_id = $1 AND user_id = $2;

-- Query: select_session_stats
SELECT
  SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) AS session_correct,
  SUM(CASE WHEN NOT was_correct THEN 1 ELSE 0 END) AS session_incorrect,
  COUNT(*) AS total_attempts
FROM session_card_attempts
WHERE flashcard_id = $1 AND user_id = $2 AND session_start_time = $3;

-- Query: update_leitner_session_complete
UPDATE flashcard_leitner_progress
SET times_correct = $1,
    times_incorrect = $2,
    current_box = $3,
    last_reviewed = NOW(),
    next_review = $4,
    updated_at = NOW()
WHERE flashcard_id = $5 AND user_id = $6;

-- Query: update_leitner_mid_session
UPDATE flashcard_leitner_progress
SET times_correct = $1,
    times_incorrect = $2,
    updated_at = NOW()
WHERE flashcard_id = $3 AND user_id = $4;

-- Query: select_box_counts_template
SELECT p.current_box, COUNT(*) AS count
FROM flashcard_leitner_progress p
JOIN flashcards f ON p.flashcard_id = f.flashcard_id
WHERE p.user_id = $1
  {{filter_clause}}
GROUP BY p.current_box
ORDER BY p.current_box;

-- Query: select_attempt_totals_template
SELECT
  SUM(CASE WHEN ph.correct THEN 1 ELSE 0 END) AS total_correct,
  SUM(CASE WHEN NOT ph.correct THEN 1 ELSE 0 END) AS total_incorrect,
  COUNT(*) AS total_attempts
FROM practice_history ph
JOIN flashcards f ON ph.flashcard_id = f.flashcard_id
WHERE ph.user_id = $1
  {{filter_clause}};

-- Query: select_recent_practice_results
SELECT correct, created_at
FROM practice_history
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- Query: select_todays_summary_template
SELECT COUNT(*) AS attempts,
       SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN NOT correct THEN 1 ELSE 0 END) AS incorrect
FROM practice_history ph
LEFT JOIN flashcards f ON ph.flashcard_id = f.flashcard_id
WHERE ph.user_id = $1
  AND DATE(ph.created_at) = CURRENT_DATE
  {{filter_clause}};

-- Query: reset_user_leitner_progress
UPDATE flashcard_leitner_progress
SET current_box = 1,
    last_reviewed = NULL,
    next_review = NOW(),
    times_correct = 0,
    times_incorrect = 0,
    none_of_above_count = 0
WHERE user_id = $1
RETURNING flashcard_id;

-- Query: select_card_privacy
SELECT is_private, created_by FROM flashcards WHERE flashcard_id = $1;

-- Query: select_card_difficulty_score
SELECT difficulty_score FROM flashcards WHERE flashcard_id = $1;

-- Query: select_owner_practice_stats
SELECT COUNT(*) AS total, SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS correct
FROM practice_history
WHERE flashcard_id = $1 AND user_id = $2;

-- Query: select_all_practice_stats
SELECT COUNT(*) AS total, SUM(CASE WHEN correct THEN 1 ELSE 0 END) AS correct
FROM practice_history
WHERE flashcard_id = $1;

-- Query: update_card_difficulty
UPDATE flashcards
SET difficulty_score = $1,
    last_difficulty_update = NOW(),
    difficulty_calc_base = $2
WHERE flashcard_id = $3;

-- Query: insert_difficulty_history
INSERT INTO difficulty_history
  (flashcard_id, old_score, new_score, calculation_basis, sample_size, success_rate)
VALUES ($1, $2, $3, $4, $5, $6);

-- Query: select_cards_for_difficulty_update_template
SELECT DISTINCT flashcard_id
FROM flashcards
WHERE (is_private = false OR created_by = $1)
  {{lesson_filter}};

-- Query: select_difficulty_stats
SELECT
  COUNT(*) AS total_cards,
  ROUND(AVG(difficulty_score), 2) AS avg_difficulty,
  MIN(difficulty_score) AS easiest,
  MAX(difficulty_score) AS hardest,
  COUNT(CASE WHEN difficulty_score >= 1.0 AND difficulty_score < 2.0 THEN 1 END) AS very_easy,
  COUNT(CASE WHEN difficulty_score >= 2.0 AND difficulty_score < 3.0 THEN 1 END) AS easy,
  COUNT(CASE WHEN difficulty_score >= 3.0 AND difficulty_score < 4.0 THEN 1 END) AS medium,
  COUNT(CASE WHEN difficulty_score >= 4.0 AND difficulty_score < 5.0 THEN 1 END) AS hard,
  COUNT(CASE WHEN difficulty_score >= 5.0 THEN 1 END) AS very_hard
FROM flashcards
WHERE is_private = false OR created_by = $1;

-- Query: increment_none_of_above_count
UPDATE flashcard_leitner_progress
SET none_of_above_count = none_of_above_count + 1
WHERE flashcard_id = $1 AND user_id = $2;

-- Query: select_card_answer_with_box
SELECT f.answer, COALESCE(p.current_box, 1) AS current_box
FROM flashcards f
LEFT JOIN flashcard_leitner_progress p ON f.flashcard_id = p.flashcard_id AND p.user_id = $2
WHERE f.flashcard_id = $1;
