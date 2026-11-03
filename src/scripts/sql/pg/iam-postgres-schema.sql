-- Identity and access management (IAM) domain: its own PostgreSQL schema.
-- The IAM adapter connects with search_path = iam, public (CODING_STANDARDS 0.8).
CREATE SCHEMA IF NOT EXISTS iam;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;

-- One-time move of this domain's tables out of the shared public schema
-- (IAM phase 1). Moves only tables still in public and not yet in iam;
-- data, indexes, constraints, and foreign keys move with each table.
DO $move_iam_tables$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'roles', 'rights', 'role_rights', 'user_roles', 'user_rights', 'session'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('iam.' || t) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA iam', t);
    END IF;
  END LOOP;
END
$move_iam_tables$;

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  last_page_visited VARCHAR(255) DEFAULT '/' NOT NULL,
  last_visited_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_max_bytes BIGINT NOT NULL DEFAULT 26214400;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Per-user right overrides (moved from the app schema in IAM phase 1).
CREATE TABLE IF NOT EXISTS user_rights (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  right_key VARCHAR(100) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, right_key)
);

CREATE TABLE IF NOT EXISTS roles (
  role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rights (
  right_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  right_key VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_rights (
  role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  right_id UUID NOT NULL REFERENCES rights(right_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (role_id, right_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

INSERT INTO roles (role_name, description)
VALUES
  ('admin', 'System administrator with full management access'),
  ('user', 'Standard application user')
ON CONFLICT (role_name) DO NOTHING;
