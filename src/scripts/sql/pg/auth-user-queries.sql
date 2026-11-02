-- Query: create_user
INSERT INTO users (username, email, password_hash, full_name)
VALUES ($1, $2, $3, $4)
RETURNING user_id, username, email, full_name, created_at;

-- Query: find_user_by_username
SELECT * FROM users WHERE username = $1;

-- Query: find_user_by_email
SELECT * FROM users WHERE email = $1;

-- Query: find_user_by_id
SELECT user_id, username, email, full_name, is_admin, status, created_at, updated_at FROM users WHERE user_id = $1;

-- Query: update_user_profile_template
UPDATE users SET {{columns}} WHERE user_id = {{user_id}}
RETURNING user_id, username, email, full_name, is_admin, status, created_at, updated_at;

-- Query: get_all_users
SELECT user_id, username, email, full_name, is_admin, status, created_at FROM users ORDER BY created_at;

-- Query: disable_user
UPDATE users SET status = $1 WHERE user_id = $2 RETURNING user_id, username, email, full_name, is_admin, status, created_at;

-- Query: enable_user
UPDATE users SET status = $1 WHERE user_id = $2 RETURNING user_id, username, email, full_name, is_admin, status, created_at;

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

-- Query: delete_user
DELETE FROM users WHERE user_id = $1;

-- Query: get_is_admin
SELECT is_admin FROM users WHERE user_id = $1;

-- Query: update_last_page_visited
UPDATE users
SET last_page_visited = $1, last_visited_at = NOW()
WHERE user_id = $2
RETURNING last_page_visited;

-- Query: get_last_page_visited
SELECT last_page_visited FROM users WHERE user_id = $1;
