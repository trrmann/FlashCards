-- FlashCards' per-user settings (flashcards.user_settings). A user without a row has the
-- defaults: '/' and 26214400 bytes (25 MiB), the same as the column defaults.

-- Query: get_last_page_visited
SELECT COALESCE((SELECT last_page_visited FROM user_settings WHERE user_id = $1), '/') AS last_page_visited;

-- Query: upsert_last_page_visited
INSERT INTO user_settings (user_id, last_page_visited) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET last_page_visited = EXCLUDED.last_page_visited, updated_at = NOW()
RETURNING last_page_visited;

-- Query: get_storage_limit
SELECT COALESCE((SELECT storage_max_bytes FROM user_settings WHERE user_id = $1), 26214400) AS storage_max_bytes;

-- Query: upsert_storage_limit
INSERT INTO user_settings (user_id, storage_max_bytes) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET storage_max_bytes = EXCLUDED.storage_max_bytes, updated_at = NOW()
RETURNING storage_max_bytes;
