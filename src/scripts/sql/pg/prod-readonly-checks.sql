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

-- Credentials (for a password rotation): who this session is, who owns the app schemas and tables,
-- and whether this login can act as that owner (needed by the schema bootstrap) and use the tables.
SELECT session_user AS login, current_user AS acting_as,
       n.nspname AS schema,
       pg_get_userbyid(n.nspowner) AS schema_owner,
       pg_has_role(current_user, n.nspowner, 'USAGE') AS login_acts_as_owner,
       has_schema_privilege(n.nspname, 'USAGE') AS can_use_schema
FROM pg_namespace n WHERE n.nspname IN ('iam', 'flashcards') ORDER BY 2;

SELECT n.nspname AS schema, pg_get_userbyid(c.relowner) AS table_owner, count(*) AS tables,
       bool_and(has_table_privilege(c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS login_can_read_write_all
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('iam', 'flashcards')
GROUP BY 1, 2 ORDER BY 1, 2;

-- Open connections per login (no query text): the old login should reach 0 before it is deleted.
SELECT usename AS login, count(*) AS connections
FROM pg_stat_activity WHERE datname = current_database() AND usename IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- Per-app logins (build-order step 3): can this login create roles, and the connection limit.
SELECT r.rolname AS acting_as, r.rolcreaterole AS can_create_roles, r.rolsuper AS superuser,
       r.rolconnlimit AS role_connection_limit
FROM pg_roles r WHERE r.rolname = current_user;

SELECT current_setting('max_connections')::int AS max_connections,
       current_setting('superuser_reserved_connections')::int AS reserved_for_superuser,
       (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend') AS client_connections_now,
       current_setting('server_version') AS server_version;

-- Login roles in the database (names and flags only): Render-managed and any created with SQL.
SELECT rolname AS login_role, rolcanlogin AS can_login, rolconnlimit AS connection_limit
FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' AND rolname <> 'postgres' ORDER BY 1;

-- The public schema as in a standard database: every login may use it (for the extensions' functions).
SELECT has_schema_privilege('public', 'public', 'USAGE') AS public_schema_usable_by_all,
       has_schema_privilege('public', 'public', 'CREATE') AS public_schema_creatable_by_all;
