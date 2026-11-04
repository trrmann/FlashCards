-- A user's FlashCards data (phase 3d): removed when the IAM reports the user deleted, in this
-- order (what the old foreign keys' ON DELETE CASCADE did). Deleting a card removes its options,
-- shares, progress and history through FlashCards' own foreign keys.

-- Query: delete_user_shares
DELETE FROM flashcard_shares WHERE owner_id = $1 OR recipient_id = $1;

-- Query: delete_user_public_card_removals
DELETE FROM public_card_removals WHERE user_id = $1;

-- Query: delete_user_leitner_progress
DELETE FROM flashcard_leitner_progress WHERE user_id = $1;

-- Query: delete_user_practice_history
DELETE FROM practice_history WHERE user_id = $1;

-- Query: delete_user_session_card_attempts
DELETE FROM session_card_attempts WHERE user_id = $1;

-- Query: delete_user_leitner_boxes
DELETE FROM leitner_boxes WHERE user_id = $1;

-- Query: delete_user_quiz_results
DELETE FROM quiz_results WHERE user_id = $1;

-- Query: delete_user_quizzes
DELETE FROM quizzes WHERE user_id = $1;

-- Query: delete_user_flashcards
DELETE FROM flashcards WHERE user_id = $1 OR created_by = $1;

-- Query: delete_user_lessons
DELETE FROM lessons WHERE user_id = $1;

-- Query: delete_user_media
DELETE FROM media WHERE user_id = $1;

-- Query: delete_user_import_export_logs
DELETE FROM import_export_logs WHERE user_id = $1;

-- Query: delete_user_settings
DELETE FROM user_settings WHERE user_id = $1;

-- Query: user_ids_with_data
-- Every user id FlashCards holds data for (for the orphan check).
SELECT user_id FROM lessons
UNION SELECT user_id FROM flashcards
UNION SELECT created_by FROM flashcards WHERE created_by IS NOT NULL
UNION SELECT user_id FROM media
UNION SELECT user_id FROM public_card_removals
UNION SELECT owner_id FROM flashcard_shares
UNION SELECT recipient_id FROM flashcard_shares
UNION SELECT user_id FROM leitner_boxes
UNION SELECT user_id FROM flashcard_leitner_progress
UNION SELECT user_id FROM practice_history
UNION SELECT user_id FROM session_card_attempts
UNION SELECT user_id FROM quizzes
UNION SELECT user_id FROM quiz_results
UNION SELECT user_id FROM import_export_logs
UNION SELECT user_id FROM user_settings;
