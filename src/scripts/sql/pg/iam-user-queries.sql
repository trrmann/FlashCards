-- Query: create_user
INSERT INTO users (username, email, password_hash, full_name)
VALUES ($1, $2, $3, $4)
RETURNING user_id, username, email, full_name, created_at;

-- Query: find_user_by_username
SELECT * FROM users WHERE username = $1;

-- Query: find_user_by_email
SELECT * FROM users WHERE email = $1;

-- Query: find_user_by_id
SELECT u.user_id, u.username, u.email, u.full_name, u.status, u.created_at, u.updated_at,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = u.user_id AND r.role_name = 'admin'
       ) AS is_admin
FROM users u
WHERE u.user_id = $1;

-- Query: update_user_profile_template
UPDATE users SET {{columns}} WHERE user_id = {{user_id}}
RETURNING user_id, username, email, full_name, status, created_at, updated_at;

-- Query: get_all_users
SELECT u.user_id, u.username, u.email, u.full_name, u.status, u.created_at,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = u.user_id AND r.role_name = 'admin'
       ) AS is_admin
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
SELECT EXISTS (
  SELECT 1 FROM user_roles ur
  JOIN roles r ON ur.role_id = r.role_id
  WHERE ur.user_id = $1 AND r.role_name = 'admin'
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
INSERT INTO user_roles (user_id, role_id)
SELECT $1, role_id FROM roles WHERE role_name = $2
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Query: revoke_role
DELETE FROM user_roles
WHERE user_id = $1
AND role_id IN (SELECT role_id FROM roles WHERE role_name = $2);

-- Query: get_user_roles
SELECT r.role_name
FROM user_roles ur
JOIN roles r ON ur.role_id = r.role_id
WHERE ur.user_id = $1
ORDER BY r.role_name;

-- Query: get_role_rights
SELECT ri.right_key
FROM user_roles ur
JOIN role_rights rr ON ur.role_id = rr.role_id
JOIN rights ri ON rr.right_id = ri.right_id
WHERE ur.user_id = $1
ORDER BY ri.right_key;

-- Query: update_user_password
UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2
RETURNING user_id, username, email;

-- Query: get_user_display
SELECT u.full_name,
       EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = u.user_id AND r.role_name = 'admin'
       ) AS is_admin
FROM users u
WHERE u.user_id = $1;
