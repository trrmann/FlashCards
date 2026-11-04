-- Read-only production checks for prod-readonly-check.sh: row COUNTS only, never row contents.
-- Shows where the data is after the IAM phase 1 schema move (public -> iam / flashcards).
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('public', 'iam', 'flashcards')
ORDER BY 1, 2;

SELECT 'iam.users' AS source, count(*) FROM iam.users
UNION ALL SELECT 'iam.session', count(*) FROM iam.session
UNION ALL SELECT 'flashcards.flashcards', count(*) FROM flashcards.flashcards
UNION ALL SELECT 'flashcards.media', count(*) FROM flashcards.media
UNION ALL SELECT 'flashcards.quizzes', count(*) FROM flashcards.quizzes
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'public.flashcards', count(*) FROM public.flashcards;
