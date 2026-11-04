-- Test-only queries. Used exclusively by tests that run against the local scratch
-- database (local-db.sh); the test runners refuse to execute against any other host.

-- Query: drop_iam_schema
DROP SCHEMA IF EXISTS iam CASCADE;

-- Query: drop_flashcards_schema
DROP SCHEMA IF EXISTS flashcards CASCADE;

-- Query: drop_public_schema
DROP SCHEMA IF EXISTS public CASCADE;

-- Query: create_public_schema
CREATE SCHEMA public;

-- Query: count_users
-- StartupTest: proves a read-only server wrote nothing.
SELECT COUNT(*)::int AS count FROM iam.users;

-- SchemaCleanupTest: leftover copies in public, as an old server would have created them.

-- Query: leftover_create_lessons
CREATE TABLE public.lessons (LIKE flashcards.lessons INCLUDING ALL);

-- Query: leftover_create_flashcards
CREATE TABLE public.flashcards (flashcard_id UUID PRIMARY KEY, lesson_id UUID REFERENCES public.lessons(lesson_id));

-- Query: leftover_create_quizzes_with_data
CREATE TABLE public.quizzes (quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid());

-- Query: leftover_insert_quiz
INSERT INTO public.quizzes DEFAULT VALUES;

-- Query: leftover_create_media
CREATE TABLE public.media (media_id UUID PRIMARY KEY);

-- Query: outside_reference_create
CREATE TABLE flashcards.cleanup_outside_ref (media_id UUID REFERENCES public.media(media_id));

-- Query: outside_reference_drop
DROP TABLE IF EXISTS flashcards.cleanup_outside_ref;

-- Query: leftover_drop_remaining
DROP TABLE IF EXISTS public.quizzes, public.media CASCADE;

-- Query: public_table_exists
SELECT to_regclass('public.' || $1) IS NOT NULL AS exists;

-- SchemaCleanupTest, phase 3c moves: a database from before user_settings and flashcards.session.

-- Query: move_set_iam_user_settings
UPDATE iam.users SET storage_max_bytes = $2, last_page_visited = $3 WHERE user_id = $1;

-- Query: move_insert_iam_session
INSERT INTO iam.session (sid, sess, expire) VALUES ($1, '{}'::json, NOW() + $2::interval);

-- Query: move_drop_moved_tables
DROP TABLE IF EXISTS flashcards.user_settings, flashcards.session;

-- Query: move_read_user_settings
SELECT last_page_visited, storage_max_bytes::int AS storage_max_bytes
FROM flashcards.user_settings WHERE user_id = $1;

-- Query: move_session_ids
SELECT sid FROM flashcards.session ORDER BY sid;

-- Query: move_delete_sessions
DELETE FROM flashcards.session;

-- UserDeletionTest (phase 3d): no foreign keys to iam.users; orphaned rows.

-- Query: count_foreign_keys_to_iam_users
SELECT count(*)::int AS count
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE con.contype = 'f' AND n.nspname = 'flashcards'
  AND con.confrelid = 'iam.users'::regclass;

-- Query: insert_orphan_lesson
INSERT INTO flashcards.lessons (user_id, name) VALUES ($1, 'orphaned lesson');

-- Query: add_legacy_user_foreign_keys
-- SchemaCleanupTest: foreign keys to iam.users as databases from before phase 3d have them.
ALTER TABLE flashcards.lessons ADD CONSTRAINT lessons_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES iam.users(user_id) ON DELETE CASCADE;

-- Query: add_legacy_share_foreign_key
ALTER TABLE flashcards.flashcard_shares ADD CONSTRAINT flashcard_shares_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES iam.users(user_id) ON DELETE CASCADE;
