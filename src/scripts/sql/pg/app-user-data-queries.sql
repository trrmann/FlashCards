-- Query: delete_import_export_logs
DELETE FROM import_export_logs WHERE user_id = $1;

-- Query: delete_quiz_results
DELETE FROM quiz_results WHERE user_id = $1;

-- Query: delete_quiz_questions
DELETE FROM quiz_questions WHERE quiz_id IN (SELECT quiz_id FROM quizzes WHERE user_id = $1);

-- Query: delete_quizzes
DELETE FROM quizzes WHERE user_id = $1;

-- Query: delete_leitner_boxes
DELETE FROM leitner_boxes WHERE user_id = $1;

-- Query: delete_flashcards
DELETE FROM flashcards WHERE user_id = $1;

-- Query: delete_user_rights
DELETE FROM user_rights WHERE user_id = $1;

-- Query: grant_user_right
INSERT INTO user_rights (user_id, right_key, granted)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, right_key) DO UPDATE SET granted = $3, updated_at = NOW();

-- Query: revoke_user_right
DELETE FROM user_rights WHERE user_id = $1 AND right_key = $2;

-- Query: get_user_rights
SELECT right_key, granted FROM user_rights WHERE user_id = $1 ORDER BY right_key;
