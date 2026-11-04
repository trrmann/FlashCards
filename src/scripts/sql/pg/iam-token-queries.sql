-- Token storage for the IAM service (TokenService). Only token hashes are stored.

-- Query: insert_token
INSERT INTO access_tokens (token_hash, kind, family_id, user_id, app_id, expires_at)
SELECT $1, $2, $3, $4, a.app_id, $6
FROM applications a
WHERE a.app_key = $5
RETURNING token_id, expires_at;

-- Query: find_token
SELECT t.token_id, t.kind, t.family_id, t.user_id, t.expires_at, t.used_at, t.revoked_at, a.app_key
FROM access_tokens t
JOIN applications a ON a.app_id = t.app_id
WHERE t.token_hash = $1;

-- Query: mark_refresh_used
-- Single use: only the first caller gets a row back.
UPDATE access_tokens
SET used_at = NOW()
WHERE token_id = $1 AND used_at IS NULL AND revoked_at IS NULL
RETURNING token_id;

-- Query: revoke_family
UPDATE access_tokens
SET revoked_at = NOW()
WHERE family_id = $1 AND revoked_at IS NULL;

-- Query: delete_expired_tokens
DELETE FROM access_tokens
WHERE expires_at < NOW() - INTERVAL '1 day';
