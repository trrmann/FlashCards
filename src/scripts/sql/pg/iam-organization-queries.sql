-- Organizations, members, groups, and group roles (IAM schema).
-- Used by OrganizationService; every query stays inside the iam domain.

-- Query: list_all_organizations
SELECT o.org_id, o.name, o.slug, o.status, o.created_at, om.org_role AS my_role,
       (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.org_id) AS member_count,
       (SELECT COUNT(*) FROM groups g WHERE g.org_id = o.org_id) AS group_count
FROM organizations o
LEFT JOIN organization_members om ON om.org_id = o.org_id AND om.user_id = $1
ORDER BY o.name;

-- Query: list_member_organizations
SELECT o.org_id, o.name, o.slug, o.status, o.created_at, om.org_role AS my_role,
       (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.org_id) AS member_count,
       (SELECT COUNT(*) FROM groups g WHERE g.org_id = o.org_id) AS group_count
FROM organizations o
JOIN organization_members om ON om.org_id = o.org_id AND om.user_id = $1
ORDER BY o.name;

-- Query: get_organization
SELECT org_id, name, slug, status, created_by, created_at, updated_at
FROM organizations
WHERE org_id = $1;

-- Query: insert_organization
INSERT INTO organizations (name, slug, created_by)
VALUES ($1, $2, $3)
RETURNING org_id, name, slug, status, created_by, created_at, updated_at;

-- Query: update_organization
UPDATE organizations
SET name = COALESCE($2, name),
    status = COALESCE($3, status),
    updated_at = NOW()
WHERE org_id = $1
RETURNING org_id, name, slug, status, created_by, created_at, updated_at;

-- Query: delete_organization
DELETE FROM organizations WHERE org_id = $1;

-- Query: get_org_role
SELECT org_role FROM organization_members WHERE org_id = $1 AND user_id = $2;

-- Query: insert_org_member
INSERT INTO organization_members (org_id, user_id, org_role)
VALUES ($1, $2, $3)
ON CONFLICT (org_id, user_id) DO NOTHING
RETURNING org_id, user_id, org_role, joined_at;

-- Query: update_org_member_role
UPDATE organization_members
SET org_role = $3
WHERE org_id = $1 AND user_id = $2
RETURNING org_id, user_id, org_role, joined_at;

-- Query: delete_org_member
DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2;

-- Query: count_org_owners
SELECT COUNT(*) AS owners FROM organization_members WHERE org_id = $1 AND org_role = 'owner';

-- Query: list_org_members
SELECT om.user_id, om.org_role, om.joined_at, u.username, u.full_name
FROM organization_members om
JOIN users u ON u.user_id = om.user_id
WHERE om.org_id = $1
ORDER BY CASE om.org_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username;

-- Query: delete_member_from_org_groups
DELETE FROM group_members gm
USING groups g
WHERE g.group_id = gm.group_id AND g.org_id = $1 AND gm.user_id = $2;

-- Query: list_org_groups
SELECT g.group_id, g.org_id, g.name, g.description, g.created_at, g.updated_at,
       (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.group_id) AS member_count
FROM groups g
WHERE g.org_id = $1
ORDER BY g.name;

-- Query: get_group
SELECT group_id, org_id, name, description, created_at, updated_at
FROM groups
WHERE group_id = $1;

-- Query: insert_group
INSERT INTO groups (org_id, name, description)
VALUES ($1, $2, $3)
RETURNING group_id, org_id, name, description, created_at, updated_at;

-- Query: update_group
UPDATE groups
SET name = COALESCE($2, name),
    description = COALESCE($3, description),
    updated_at = NOW()
WHERE group_id = $1
RETURNING group_id, org_id, name, description, created_at, updated_at;

-- Query: delete_group
DELETE FROM groups WHERE group_id = $1;

-- Query: list_group_members
SELECT gm.user_id, gm.added_at, u.username, u.full_name
FROM group_members gm
JOIN users u ON u.user_id = gm.user_id
WHERE gm.group_id = $1
ORDER BY u.username;

-- Query: insert_group_member
INSERT INTO group_members (group_id, user_id)
VALUES ($1, $2)
ON CONFLICT (group_id, user_id) DO NOTHING
RETURNING group_id, user_id, added_at;

-- Query: delete_group_member
DELETE FROM group_members WHERE group_id = $1 AND user_id = $2;

-- Query: list_group_roles
SELECT r.role_id, r.role_name, a.app_key, gr.created_at
FROM group_roles gr
JOIN roles r ON r.role_id = gr.role_id
LEFT JOIN applications a ON a.app_id = r.app_id
WHERE gr.group_id = $1
ORDER BY a.app_key NULLS FIRST, r.role_name;

-- Query: insert_group_role
INSERT INTO group_roles (group_id, role_id)
VALUES ($1, $2)
ON CONFLICT (group_id, role_id) DO NOTHING
RETURNING group_id, role_id, created_at;

-- Query: get_group_role
SELECT r.role_id, r.role_name, a.app_key
FROM group_roles gr
JOIN roles r ON r.role_id = gr.role_id
LEFT JOIN applications a ON a.app_id = r.app_id
WHERE gr.group_id = $1 AND gr.role_id = $2;

-- Query: delete_group_role
DELETE FROM group_roles WHERE group_id = $1 AND role_id = $2;
