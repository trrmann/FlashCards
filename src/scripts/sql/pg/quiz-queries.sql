-- Query: select_quiz_cards_template
SELECT flashcard_id, question, answer, difficulty_score
FROM flashcards
WHERE created_by = $1 AND is_private = true
  {{filter_clause}}
ORDER BY RANDOM();

-- Query: insert_quiz
INSERT INTO quizzes (user_id, name, description)
VALUES ($1, $2, $3)
RETURNING quiz_id;

-- Query: insert_quiz_question
INSERT INTO quiz_questions (quiz_id, card_id, order_index)
VALUES ($1, $2, $3);

-- Query: select_quiz_owned
SELECT quiz_id FROM quizzes WHERE quiz_id = $1 AND user_id = $2;

-- Query: insert_quiz_result
INSERT INTO quiz_results (user_id, quiz_id, score, total_questions, correct_answers)
VALUES ($1, $2, $3, $4, $5)
RETURNING result_id, score, correct_answers, total_questions;

-- Query: select_quizzes_with_results
SELECT
  q.quiz_id,
  q.name,
  q.description,
  q.created_at,
  MAX(qr.score) AS best_score,
  COUNT(DISTINCT qr.result_id) AS attempt_count,
  qr.taken_at AS last_taken
FROM quizzes q
LEFT JOIN quiz_results qr ON q.quiz_id = qr.quiz_id
WHERE q.user_id = $1
GROUP BY q.quiz_id, q.name, q.description, q.created_at, qr.taken_at
ORDER BY q.created_at DESC;

-- Query: select_quiz_results
SELECT result_id, score, correct_answers, total_questions, taken_at
FROM quiz_results
WHERE quiz_id = $1
ORDER BY taken_at DESC;

-- Query: select_distinct_classes
SELECT DISTINCT class FROM flashcards
WHERE class IS NOT NULL AND created_by = $1
ORDER BY class ASC;

-- Query: select_distinct_lessons_for_class
SELECT DISTINCT lesson FROM flashcards
WHERE lesson IS NOT NULL AND class = $1 AND created_by = $2
ORDER BY lesson ASC;

-- Query: select_distinct_categories
SELECT DISTINCT category FROM flashcards
WHERE category IS NOT NULL AND created_by = $1
ORDER BY category ASC;
