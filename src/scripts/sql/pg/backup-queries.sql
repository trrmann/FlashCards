-- Query: select_all_rows_template
SELECT * FROM {{table}};

-- Query: insert_import_export_log
INSERT INTO import_export_logs (user_id, action, cards_processed, status, error_message)
VALUES ($1, $2, $3, $4, $5);

-- Query: select_import_export_history
SELECT * FROM import_export_logs
ORDER BY created_at DESC
LIMIT $1;

-- Query: select_import_export_history_for_user
SELECT * FROM import_export_logs
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2;

-- Query: upsert_rows_template
-- {{update_columns}} is a plain identifier list; the new values come from EXCLUDED in SQL.
INSERT INTO {{table}} ({{columns}}) VALUES ({{placeholders}})
ON CONFLICT ({{conflict_columns}}) DO UPDATE
SET ({{update_columns}}) = (SELECT {{update_columns}} FROM (SELECT EXCLUDED.*) AS excluded_row);

-- Query: upsert_rows_ignore_template
INSERT INTO {{table}} ({{columns}}) VALUES ({{placeholders}})
ON CONFLICT ({{conflict_columns}}) DO NOTHING;

-- Query: reset_serial_sequence_template
SELECT setval(
  pg_get_serial_sequence('{{table}}', '{{column}}'),
  COALESCE((SELECT MAX({{column}}) FROM {{table}}), 1)
);
