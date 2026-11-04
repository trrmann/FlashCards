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

-- ---------------------------------------------------------------------------
-- IAM phase 2: applications, application access, app-scoped roles and rights,
-- organizations, and groups (IAM_MULTI_APP_DESIGN.md). All idempotent.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS applications (
  app_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO applications (app_key, name)
VALUES ('flashcards', 'FlashCards')
ON CONFLICT (app_key) DO NOTHING;

-- Which users may use which application.
CREATE TABLE IF NOT EXISTS application_users (
  app_id UUID NOT NULL REFERENCES applications(app_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_application_users_user_id ON application_users(user_id);

-- Roles and rights are scoped to an application; app_id NULL = platform-wide.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES applications(app_id) ON DELETE CASCADE;
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_role_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS roles_app_role_name_key ON roles (app_id, role_name) NULLS NOT DISTINCT;

ALTER TABLE rights ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES applications(app_id) ON DELETE CASCADE;
ALTER TABLE rights DROP CONSTRAINT IF EXISTS rights_right_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS rights_app_right_key_key ON rights (app_id, right_key) NULLS NOT DISTINCT;

-- The original global 'admin' and 'user' roles become FlashCards roles.
UPDATE roles
SET app_id = (SELECT app_id FROM applications WHERE app_key = 'flashcards')
WHERE app_id IS NULL AND role_name IN ('admin', 'user');

INSERT INTO roles (app_id, role_name, description)
SELECT app_id, 'admin', 'FlashCards administrator' FROM applications WHERE app_key = 'flashcards'
ON CONFLICT (app_id, role_name) DO NOTHING;

INSERT INTO roles (app_id, role_name, description)
SELECT app_id, 'user', 'FlashCards user' FROM applications WHERE app_key = 'flashcards'
ON CONFLICT (app_id, role_name) DO NOTHING;

INSERT INTO roles (app_id, role_name, description)
VALUES (NULL, 'platform_admin', 'Platform administrator: all applications, users, and organizations')
ON CONFLICT (app_id, role_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS organizations (
  org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  org_role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (org_role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);

-- Groups belong to an organization; only that organization's members can join.
CREATE TABLE IF NOT EXISTS groups (
  group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Roles held by a group apply to every member of the group.
CREATE TABLE IF NOT EXISTS group_roles (
  group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, role_id)
);

-- Every role a user holds, directly or through a group, with its application.
CREATE OR REPLACE VIEW effective_user_roles AS
SELECT ur.user_id, r.role_id, r.role_name, a.app_key, 'direct'::text AS source, NULL::uuid AS group_id
FROM user_roles ur
JOIN roles r ON r.role_id = ur.role_id
LEFT JOIN applications a ON a.app_id = r.app_id
UNION ALL
SELECT gm.user_id, r.role_id, r.role_name, a.app_key, 'group'::text AS source, gm.group_id
FROM group_members gm
JOIN group_roles gr ON gr.group_id = gm.group_id
JOIN roles r ON r.role_id = gr.role_id
LEFT JOIN applications a ON a.app_id = r.app_id;

-- One-time: when nobody holds platform_admin yet (first start after this change),
-- every FlashCards admin also becomes a platform admin.
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, pa.role_id
FROM user_roles ur
JOIN roles r ON r.role_id = ur.role_id AND r.role_name = 'admin'
JOIN applications a ON a.app_id = r.app_id AND a.app_key = 'flashcards'
CROSS JOIN roles pa
WHERE pa.role_name = 'platform_admin' AND pa.app_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.role_id = pa.role_id)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- One-time: when FlashCards has no enrolled users yet, enroll every existing user.
INSERT INTO application_users (app_id, user_id)
SELECT a.app_id, u.user_id
FROM users u
CROSS JOIN applications a
WHERE a.app_key = 'flashcards'
  AND NOT EXISTS (SELECT 1 FROM application_users au WHERE au.app_id = a.app_id)
ON CONFLICT (app_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- IAM phase 3: tokens issued by the IAM service (opaque; only SHA-256 hashes
-- are stored). Transient like sessions: not included in backups.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS access_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) UNIQUE NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('access', 'refresh')),
  family_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES applications(app_id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_family_id ON access_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at);
