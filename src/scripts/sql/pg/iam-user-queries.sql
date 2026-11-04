-- Query: create_user
INSERT INTO users (username, email, password_hash, full_name, is_public)
VALUES ($1, $2, $3, $4, $5)
RETURNING user_id, username, email, full_name, is_public, created_at;

-- Query: find_user_by_username
SELECT * FROM users WHERE username = $1;

-- Query: find_user_by_email
SELECT * FROM users WHERE email = $1;

-- Query: find_user_by_id
-- $2 = application key (admin means that app's admin or a platform admin)
SELECT u.user_id, u.username, u.email, u.full_name, u.status, u.is_public, u.created_at, u.updated_at,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id
           AND ((e.role_name = 'admin' AND e.app_key = $2) OR (e.role_name = 'platform_admin' AND e.app_key IS NULL))
       ) AS is_admin,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id AND e.role_name = 'platform_admin' AND e.app_key IS NULL
       ) AS is_platform_admin
FROM users u
WHERE u.user_id = $1;

-- Query: update_user_profile_template
UPDATE users SET {{columns}} WHERE user_id = {{user_id}}
RETURNING user_id, username, email, full_name, status, created_at, updated_at;

-- Query: get_all_users
-- $1 = application key; app_access is the user's status in that application (null = not enrolled)
SELECT u.user_id, u.username, u.email, u.full_name, u.status, u.is_public, u.created_at,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id
           AND ((e.role_name = 'admin' AND e.app_key = $1) OR (e.role_name = 'platform_admin' AND e.app_key IS NULL))
       ) AS is_admin,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id AND e.role_name = 'platform_admin' AND e.app_key IS NULL
       ) AS is_platform_admin,
       (SELECT au.status FROM application_users au JOIN applications a ON a.app_id = au.app_id
        WHERE au.user_id = u.user_id AND a.app_key = $1) AS app_access
FROM users u
ORDER BY u.created_at;

-- Query: disable_user
UPDATE users SET status = $1 WHERE user_id = $2
RETURNING user_id, username, email, full_name, status, created_at;

-- Query: enable_user
UPDATE users SET status = $1 WHERE user_id = $2
RETURNING user_id, username, email, full_name, status, created_at;

-- Query: delete_user
DELETE FROM users WHERE user_id = $1;

-- Query: get_is_admin
-- $1 = user, $2 = application key. Direct or group roles; platform admins count everywhere.
SELECT EXISTS (
  SELECT 1 FROM effective_user_roles e
  WHERE e.user_id = $1
    AND ((e.role_name = 'admin' AND e.app_key = $2) OR (e.role_name = 'platform_admin' AND e.app_key IS NULL))
) AS is_admin;

-- Query: update_last_page_visited
UPDATE users
SET last_page_visited = $1, last_visited_at = NOW()
WHERE user_id = $2
RETURNING last_page_visited;

-- Query: get_last_page_visited
SELECT last_page_visited FROM users WHERE user_id = $1;

-- Query: count_users
SELECT COUNT(*) AS count FROM users;

-- Query: assign_role
-- $3 = application key, or NULL for a platform-wide role
INSERT INTO user_roles (user_id, role_id)
SELECT $1, r.role_id
FROM roles r
LEFT JOIN applications a ON a.app_id = r.app_id
WHERE r.role_name = $2 AND a.app_key IS NOT DISTINCT FROM $3::text
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Query: revoke_role
-- $3 = application key, or NULL for a platform-wide role
DELETE FROM user_roles
WHERE user_id = $1
  AND role_id IN (
    SELECT r.role_id FROM roles r LEFT JOIN applications a ON a.app_id = r.app_id
    WHERE r.role_name = $2 AND a.app_key IS NOT DISTINCT FROM $3::text
  );

-- Query: get_user_roles
SELECT DISTINCT role_name, app_key
FROM effective_user_roles
WHERE user_id = $1
ORDER BY app_key NULLS FIRST, role_name;

-- Query: get_role_rights
-- $2 = application key: rights of that app's roles plus platform-wide roles
SELECT DISTINCT ri.right_key
FROM effective_user_roles e
JOIN role_rights rr ON rr.role_id = e.role_id
JOIN rights ri ON ri.right_id = rr.right_id
WHERE e.user_id = $1 AND (e.app_key = $2 OR e.app_key IS NULL)
ORDER BY ri.right_key;

-- Query: update_user_password
UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2
RETURNING user_id, username, email;

-- Query: get_user_display
SELECT u.full_name,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id
           AND ((e.role_name = 'admin' AND e.app_key = $2) OR (e.role_name = 'platform_admin' AND e.app_key IS NULL))
       ) AS is_admin,
       EXISTS (
         SELECT 1 FROM effective_user_roles e
         WHERE e.user_id = u.user_id AND e.role_name = 'platform_admin' AND e.app_key IS NULL
       ) AS is_platform_admin
FROM users u
WHERE u.user_id = $1;

-- Query: find_user_by_username_insensitive
SELECT * FROM users WHERE LOWER(username) = LOWER($1);

-- Query: get_public_users
SELECT username, full_name
FROM users
WHERE is_public = true AND status = 'active'
ORDER BY username;

-- Query: update_user_visibility
UPDATE users SET is_public = $1, updated_at = NOW() WHERE user_id = $2
RETURNING is_public;

-- Query: get_storage_limit
SELECT storage_max_bytes FROM users WHERE user_id = $1;

-- Query: update_storage_limit
UPDATE users SET storage_max_bytes = $1, updated_at = NOW() WHERE user_id = $2
RETURNING storage_max_bytes;

-- Query: get_user_summaries
SELECT user_id, username, full_name
FROM users
WHERE user_id = ANY($1::uuid[]);

-- Query: grant_user_right
INSERT INTO user_rights (user_id, right_key, granted)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, right_key) DO UPDATE SET granted = $3, updated_at = NOW();

-- Query: revoke_user_right
DELETE FROM user_rights WHERE user_id = $1 AND right_key = $2;

-- Query: get_user_rights
SELECT right_key, granted FROM user_rights WHERE user_id = $1 ORDER BY right_key;

-- Query: enroll_user_in_app
INSERT INTO application_users (app_id, user_id)
SELECT app_id, $2 FROM applications WHERE app_key = $1
ON CONFLICT (app_id, user_id) DO NOTHING;

-- Query: enroll_all_users_in_app
INSERT INTO application_users (app_id, user_id)
SELECT a.app_id, u.user_id
FROM users u
CROSS JOIN applications a
WHERE a.app_key = $1
ON CONFLICT (app_id, user_id) DO NOTHING;

-- Query: has_app_access
SELECT EXISTS (
  SELECT 1
  FROM application_users au
  JOIN applications a ON a.app_id = au.app_id
  WHERE a.app_key = $1 AND au.user_id = $2 AND au.status = 'active' AND a.status = 'active'
) AS has_access;

-- Query: set_app_access
UPDATE application_users au
SET status = $3
FROM applications a
WHERE a.app_id = au.app_id AND a.app_key = $1 AND au.user_id = $2
RETURNING au.user_id, au.status;

-- Query: get_is_platform_admin
SELECT EXISTS (
  SELECT 1 FROM effective_user_roles
  WHERE user_id = $1 AND role_name = 'platform_admin' AND app_key IS NULL
) AS is_platform_admin;

-- Query: list_applications
SELECT a.app_id, a.app_key, a.name, a.status, a.created_at,
       (SELECT COUNT(*) FROM application_users au WHERE au.app_id = a.app_id AND au.status = 'active') AS active_users
FROM applications a
ORDER BY a.app_key;

-- Query: find_role
SELECT r.role_id, r.role_name, a.app_key
FROM roles r
LEFT JOIN applications a ON a.app_id = r.app_id
WHERE r.role_name = $2 AND a.app_key IS NOT DISTINCT FROM $1::text;
