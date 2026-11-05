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

-- Query: grant_public_schema_usage
-- As in a standard database (initdb's public schema): every login may use it, none may create in it.
GRANT USAGE ON SCHEMA public TO PUBLIC;

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

-- Query: move_recreate_old_iam_data
-- What the identity schema held before phase 3c (dropped since iam-service v0.1.19).
DO $recreate_old_iam_data$
BEGIN
  ALTER TABLE iam.users
    ADD COLUMN IF NOT EXISTS last_page_visited VARCHAR(255) DEFAULT '/' NOT NULL,
    ADD COLUMN IF NOT EXISTS storage_max_bytes BIGINT NOT NULL DEFAULT 26214400;
  CREATE TABLE IF NOT EXISTS iam.session (sid VARCHAR NOT NULL PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL);
END
$recreate_old_iam_data$;

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

-- OwnLoginTest (phase 3d step 5): FlashCards running on its own database login.

-- Query: own_login_set_registry
UPDATE iam.applications SET db_role = $1, db_schema = 'flashcards' WHERE app_key = 'flashcards';

-- Query: own_login_drop_test_role
DO $drop_own_login$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fctest_flashcards_svc') THEN
    EXECUTE 'GRANT fctest_flashcards_svc TO ' || quote_ident(current_user) || ' WITH INHERIT TRUE, SET TRUE';
    DROP OWNED BY fctest_flashcards_svc;
    DROP ROLE fctest_flashcards_svc;
  END IF;
END
$drop_own_login$;

-- Query: own_login_read_iam_users
SELECT count(*) FROM iam.users;

-- Query: own_login_user_card_count
SELECT count(*)::int AS count FROM flashcards.flashcards WHERE user_id = $1;
