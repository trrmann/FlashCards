-- Query: list_public_tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Query: select_table_columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = $1
ORDER BY ordinal_position;

-- Query: connection_probe
SELECT NOW();

-- Query: health_check
SELECT 1 AS status;
