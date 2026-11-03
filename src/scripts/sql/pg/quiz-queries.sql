-- Query: select_quiz_cards_template
SELECT f.flashcard_id, f.question, f.answer, f.difficulty_score, f.class, f.category, f.lesson
FROM flashcards f
WHERE (f.created_by = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = f.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (f.is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $1
  )))
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
SELECT DISTINCT f.class FROM flashcards f
WHERE f.class IS NOT NULL AND (f.created_by = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = f.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (f.is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $1
  )))
ORDER BY f.class ASC;

-- Query: select_distinct_lessons
SELECT DISTINCT f.lesson FROM flashcards f
WHERE f.lesson IS NOT NULL AND (f.created_by = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = f.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (f.is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $1
  )))
ORDER BY f.lesson ASC;

-- Query: select_distinct_lessons_for_class
SELECT DISTINCT f.lesson FROM flashcards f
WHERE f.lesson IS NOT NULL AND f.class = $1 AND (f.created_by = $2 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = f.flashcard_id
      AND fs.recipient_id = $2
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (f.is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $2
  )))
ORDER BY f.lesson ASC;

-- Query: select_distinct_categories
SELECT DISTINCT f.category FROM flashcards f
WHERE f.category IS NOT NULL AND (f.created_by = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = f.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (f.is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $1
  )))
ORDER BY f.category ASC;
