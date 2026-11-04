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
