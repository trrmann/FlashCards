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
UNION ALL SELECT 'tables left in public', count(*)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

-- Leftover public tables: row count of each (counts only) and whether it has a moved twin.
SELECT c.relname AS public_table,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::int AS row_count,
       COALESCE(to_regclass('iam.' || c.relname), to_regclass('flashcards.' || c.relname)) IS NOT NULL AS has_moved_twin
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

-- Foreign keys from outside public that point INTO public tables (must be none before dropping them).
SELECT cn.nspname || '.' || cl.relname AS referencing_table, con.conname, 'public.' || rt.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace cn ON cn.oid = cl.relnamespace
JOIN pg_class rt ON rt.oid = con.confrelid JOIN pg_namespace rn ON rn.oid = rt.relnamespace
WHERE con.contype = 'f' AND rn.nspname = 'public' AND cn.nspname <> 'public';
