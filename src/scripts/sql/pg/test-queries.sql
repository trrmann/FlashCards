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
