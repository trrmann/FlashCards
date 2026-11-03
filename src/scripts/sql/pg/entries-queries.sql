-- Query: insert_flashcard
INSERT INTO flashcards (user_id, question, answer, created_by, lesson, category, class, is_private,
                        question_type, question_image, answer_image, question_audio)
VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11)
RETURNING flashcard_id, question, answer, lesson, category, class, is_private, question_type,
          question_image, answer_image, question_audio, created_at;

-- Query: select_user_flashcards
SELECT flashcard_id, question, answer, lesson, category, class, is_private, question_type,
       question_image, answer_image, question_audio, created_at
FROM flashcards
WHERE created_by = $1
ORDER BY created_at DESC;

-- Query: select_flashcard_by_question
SELECT flashcard_id, question, answer, lesson, category, class, is_private, question_type,
       question_image, answer_image, question_audio, created_at
FROM flashcards
WHERE created_by = $1 AND question = $2
LIMIT 1;

-- Query: select_user_flashcards_filtered_template
SELECT flashcard_id, question, answer, lesson, category, class, is_private, question_type,
       question_image, answer_image, question_audio, created_at
FROM flashcards
WHERE created_by = $1
  {{filter_clause}}
ORDER BY created_at DESC;

-- Query: select_flashcard_with_access
SELECT f.flashcard_id, f.question, f.answer, f.lesson, f.category, f.class, f.is_private, f.created_by, f.created_at,
       u.username, u.full_name
FROM flashcards f
LEFT JOIN users u ON f.created_by = u.user_id
WHERE f.flashcard_id = $1
  AND (f.created_by = $2 OR EXISTS (
    SELECT 1 FROM flashcard_shares
    WHERE flashcard_id = $1
      AND recipient_id = $2
      AND status != 'revoked'
      AND recipient_status = 'accepted'
  ));

-- Query: select_flashcard_owner
SELECT created_by FROM flashcards WHERE flashcard_id = $1;

-- Query: update_flashcard_template
UPDATE flashcards SET {{columns}} WHERE flashcard_id = {{flashcard_id}}
RETURNING flashcard_id, question, answer, lesson, category, class, is_private, created_at;

-- Query: delete_flashcard
DELETE FROM flashcards WHERE flashcard_id = $1 AND created_by = $2;

-- Query: upsert_flashcard_share
INSERT INTO flashcard_shares (owner_id, recipient_id, flashcard_id, status, recipient_status)
VALUES ($1, $2, $3, 'active', 'pending')
ON CONFLICT (owner_id, recipient_id, flashcard_id)
DO UPDATE SET status = 'active', recipient_status = COALESCE(flashcard_shares.recipient_status, 'pending')
RETURNING share_id, owner_id, recipient_id, flashcard_id, status, recipient_status, shared_at;

-- Query: revoke_flashcard_share
DELETE FROM flashcard_shares
WHERE flashcard_id = $1 AND owner_id = $2 AND recipient_id = $3;

-- Query: accept_flashcard_share
UPDATE flashcard_shares
SET recipient_status = 'accepted', accepted_at = NOW()
WHERE share_id = $1 AND recipient_id = $2
RETURNING share_id, owner_id, recipient_id, flashcard_id, status, recipient_status;

-- Query: reject_flashcard_share
DELETE FROM flashcard_shares
WHERE share_id = $1 AND recipient_id = $2
RETURNING share_id, owner_id, recipient_id, flashcard_id;

-- Query: select_pending_shares
SELECT fs.share_id, fs.owner_id, fs.flashcard_id, fs.recipient_status, fs.shared_at,
       u.username, u.full_name,
       f.question, f.answer, f.lesson
FROM flashcard_shares fs
JOIN users u ON fs.owner_id = u.user_id
JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
WHERE fs.recipient_id = $1
  AND fs.status != 'revoked'
  AND fs.recipient_status = 'pending'
ORDER BY fs.shared_at DESC;

-- Query: select_accepted_shares
SELECT fs.share_id, fs.owner_id, fs.flashcard_id, fs.recipient_status, fs.accepted_at,
       u.username, u.full_name,
       f.question, f.answer, f.class, f.lesson, f.category, f.created_at
FROM flashcard_shares fs
JOIN users u ON fs.owner_id = u.user_id
JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
WHERE fs.recipient_id = $1
  AND fs.status != 'revoked'
  AND fs.recipient_status = 'accepted'
ORDER BY fs.accepted_at DESC;

-- Query: select_owned_shares
SELECT fs.share_id, fs.recipient_id, fs.flashcard_id, fs.status, fs.recipient_status, fs.shared_at,
       u.username, u.full_name,
       f.question, f.answer
FROM flashcard_shares fs
JOIN users u ON fs.recipient_id = u.user_id
JOIN flashcards f ON fs.flashcard_id = f.flashcard_id
WHERE fs.owner_id = $1
ORDER BY fs.shared_at DESC;

-- Query: select_distinct_classes
SELECT DISTINCT class FROM flashcards
WHERE class IS NOT NULL AND (created_by = $1 OR user_id = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = flashcards.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = flashcards.flashcard_id AND pr.user_id = $1
  )))
ORDER BY class ASC;

-- Query: select_distinct_lessons
SELECT DISTINCT lesson FROM flashcards
WHERE lesson IS NOT NULL AND (created_by = $1 OR user_id = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = flashcards.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = flashcards.flashcard_id AND pr.user_id = $1
  )))
ORDER BY lesson ASC;

-- Query: select_distinct_categories
SELECT DISTINCT category FROM flashcards
WHERE category IS NOT NULL AND (created_by = $1 OR user_id = $1 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = flashcards.flashcard_id
      AND fs.recipient_id = $1
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = flashcards.flashcard_id AND pr.user_id = $1
  )))
ORDER BY category ASC;

-- Query: select_distinct_lessons_for_class
SELECT DISTINCT lesson FROM flashcards
WHERE lesson IS NOT NULL
  AND class = $1
  AND (created_by = $2 OR user_id = $2 OR EXISTS (
    SELECT 1 FROM flashcard_shares fs
    WHERE fs.flashcard_id = flashcards.flashcard_id
      AND fs.recipient_id = $2
      AND fs.status != 'revoked'
      AND fs.recipient_status = 'accepted'
  ) OR (is_private = false AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = flashcards.flashcard_id AND pr.user_id = $2
  )))
ORDER BY lesson ASC;

-- Query: select_public_cards_for_user
SELECT f.flashcard_id, f.question, f.answer, f.lesson, f.category, f.class, f.created_at,
       u.username, u.full_name
FROM flashcards f
LEFT JOIN users u ON f.created_by = u.user_id
WHERE f.is_private = false
  AND f.created_by != $1
  AND NOT EXISTS (
    SELECT 1 FROM public_card_removals pr
    WHERE pr.flashcard_id = f.flashcard_id AND pr.user_id = $1
  )
ORDER BY f.created_at DESC;

-- Query: insert_public_card_removal
INSERT INTO public_card_removals (user_id, flashcard_id)
VALUES ($1, $2)
ON CONFLICT (user_id, flashcard_id) DO NOTHING;

-- Query: delete_public_card_removal
DELETE FROM public_card_removals WHERE user_id = $1 AND flashcard_id = $2;

-- Query: select_removed_public_cards
SELECT f.flashcard_id, f.question, f.answer, f.lesson, f.category, f.class,
       u.username, u.full_name
FROM public_card_removals pr
JOIN flashcards f ON pr.flashcard_id = f.flashcard_id
LEFT JOIN users u ON f.created_by = u.user_id
WHERE pr.user_id = $1 AND f.is_private = false
ORDER BY pr.created_at DESC;

-- Query: update_flashcards_visibility_batch
UPDATE flashcards
SET is_private = $1, updated_at = NOW()
WHERE created_by = $2 AND flashcard_id = ANY($3::uuid[])
RETURNING flashcard_id;

-- Query: insert_public_card_removals_batch
INSERT INTO public_card_removals (user_id, flashcard_id)
SELECT $1, unnest($2::uuid[])
ON CONFLICT (user_id, flashcard_id) DO NOTHING;

-- Query: delete_public_card_removals_batch
DELETE FROM public_card_removals
WHERE user_id = $1 AND flashcard_id = ANY($2::uuid[]);

-- Query: select_flashcard_options
SELECT option_id, flashcard_id, option_text, is_correct, sort_order
FROM flashcard_options
WHERE flashcard_id = $1
ORDER BY sort_order, created_at;

-- Query: insert_flashcard_option
INSERT INTO flashcard_options (flashcard_id, option_text, is_correct, sort_order)
VALUES ($1, $2, $3, $4);

-- Query: delete_flashcard_options
DELETE FROM flashcard_options WHERE flashcard_id = $1;

-- Query: select_options_for_cards
SELECT option_id, flashcard_id, option_text, is_correct, sort_order
FROM flashcard_options
WHERE flashcard_id = ANY($1::uuid[])
ORDER BY flashcard_id, sort_order, created_at;
