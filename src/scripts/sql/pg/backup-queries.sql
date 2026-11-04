-- Backup log. The table export and import themselves use platform-db's TableBackup.

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
