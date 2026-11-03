# Initial Setup & System Endpoints

## Overview

The system includes special endpoints to handle the initial setup scenario when no users exist yet, plus monitoring endpoints for database health.

## Setup Status Detection

### GET `/api/system/setup-status`

Check if the system needs initial setup (no users exist).

**Response (200 OK):**

```json
{
  "status": "success",
  "needsSetup": false,
  "userCount": 1,
  "message": "System is ready"
}
```

**When needsSetup is true:**

```json
{
  "status": "success",
  "needsSetup": true,
  "userCount": 0,
  "message": "System needs initial setup"
}
```

### Use Cases

- Frontend can check on load to redirect to setup wizard if needed
- CI/CD pipelines can verify system readiness
- Health monitoring can alert if users table is accidentally cleared

## Initial Setup Endpoint

### POST `/api/system/initial-setup`

Create the first user in the system (only available when no users exist).

**Requirements:**

- System must have zero users (check with `/api/system/setup-status` first)
- User will be created as the system administrator
- Same validation as regular registration applies

**Request Body:**

```json
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "SecurePass123!",
  "passwordConfirm": "SecurePass123!",
  "fullName": "Administrator"
}
```

**Response (201 Created - When users=0):**

```json
{
  "status": "success",
  "message": "Initial setup complete. First user created successfully.",
  "hint": "This is the first user in the system. Consider this the administrator account.",
  "user": {
    "user_id": "356bd5e6-4f4a-4e09-91ea-09641795ae60",
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "created_at": "2026-10-29T21:38:27.929Z"
  }
}
```

**Error Response (403 Forbidden - When users>0):**

```json
{
  "status": "error",
  "message": "System is already initialized. Users already exist.",
  "hint": "Use /api/auth/register to create a new user account"
}
```

**Error Response (400 Bad Request - Validation Errors):**

```json
{
  "status": "error",
  "message": "Password does not meet requirements",
  "errors": ["Password must contain at least one special character (!@#$%^&*)"]
}
```

## Database Status Monitoring

### GET `/api/system/database-status`

Get status of all required database tables.

**Response (200 OK):**

```json
{
  "status": "success",
  "database": "<db-name>",
  "allTablesExist": true,
  "tables": {
    "users": {
      "exists": true,
      "rowCount": 1
    },
    "flashcards": {
      "exists": true,
      "rowCount": 0
    },
    "leitner_boxes": {
      "exists": true,
      "rowCount": 0
    },
    "quizzes": {
      "exists": true,
      "rowCount": 0
    },
    "quiz_questions": {
      "exists": true,
      "rowCount": 0
    },
    "quiz_results": {
      "exists": true,
      "rowCount": 0
    },
    "import_export_logs": {
      "exists": true,
      "rowCount": 0
    }
  }
}
```

### Use Cases

- Verify database initialization was successful
- Monitor table row counts for data growth
- Check if specific tables are missing (initialization failed)
- Detect accidental schema deletion

## Initial User Scenarios

### Scenario 1: Fresh Installation

```bash
# 1. Check setup status
curl http://localhost:5000/api/system/setup-status
# Returns: needsSetup: true, userCount: 0

# 2. Create first user via initial setup
curl -X POST http://localhost:5000/api/system/initial-setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "SecurePass123!",
    "passwordConfirm": "SecurePass123!",
    "fullName": "Administrator"
  }'
# Returns: User created successfully, session established

# 3. Future users use regular registration
curl -X POST http://localhost:5000/api/auth/register ...
```

### Scenario 2: Database Already Initialized

```bash
# 1. Check setup status
curl http://localhost:5000/api/system/setup-status
# Returns: needsSetup: false, userCount: 1

# 2. Any attempt to use initial-setup fails
curl -X POST http://localhost:5000/api/system/initial-setup ...
# Returns: 403 Forbidden - System already initialized

# 3. Use regular registration instead
curl -X POST http://localhost:5000/api/auth/register ...
```

### Scenario 3: Verify Database Health

```bash
curl http://localhost:5000/api/system/database-status
# Returns detailed table status
# Can be used in CI/CD health checks
```

## Session Behavior

When initial setup succeeds:

- ✅ User is automatically logged in (session created)
- ✅ User can immediately access `/api/users/profile` and other protected endpoints
- ✅ Same 24-hour session expiration as regular login applies

## Validation

Initial setup uses identical validation to regular registration:

- Username: 3-50 chars, alphanumeric + underscore/hyphen
- Email: Valid format
- Password: 8+ chars, uppercase, lowercase, number, special char
- Confirmation: Passwords must match

## Edge Cases Handled

| Case                    | Behavior                                               |
| ----------------------- | ------------------------------------------------------ |
| Users exist             | Returns 403, suggests using /api/auth/register         |
| Zero users exist        | Allows creation, becomes administrator                 |
| Database missing tables | Database status shows allTablesExist: false            |
| Invalid password        | Returns validation errors with requirements            |
| Duplicate username      | Returns 400 error (should be impossible if first user) |

## Frontend Integration Example

```javascript
// Check if setup needed on app load
async function checkSetupStatus() {
  const response = await fetch('/api/system/setup-status');
  const data = await response.json();

  if (data.needsSetup) {
    // Show setup wizard
    window.location.href = '/setup';
  } else {
    // Show login
    window.location.href = '/login';
  }
}

// On setup page, create first user
async function completeSetup(formData) {
  const response = await fetch('/api/system/initial-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  if (response.ok) {
    // User created and logged in
    window.location.href = '/dashboard';
  }
}
```

## Testing

### Manual Testing

```bash
# 1. Check current setup status
curl http://localhost:5000/api/system/setup-status

# 2. Check database health
curl http://localhost:5000/api/system/database-status

# 3. Try initial setup (will fail if users exist)
curl -X POST http://localhost:5000/api/system/initial-setup \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "AdminPass123!",
    "passwordConfirm": "AdminPass123!",
    "fullName": "System Admin"
  }'
```

## Security Considerations

✅ **Initial Setup Locked**

- Only available when zero users exist
- Prevents unauthorized creation of admin accounts
- Returns clear 403 error if already initialized

✅ **Same Validation**

- Uses identical password validation as regular auth
- Prevents weak credentials
- Email format verified

✅ **Session Security**

- User created via initial-setup gets same secure session
- HttpOnly cookies
- 24-hour expiration

## How the UI uses this

The `/login` page renders a **First User Setup** form when there are no users (`GET /login` checks
`userAuthService.countUsers()` on the server). That form posts to `POST /api/auth/register`, not to
`/api/system/initial-setup`. Registration also grants the `admin` role when it creates the first user,
so both paths end in the same state. `initial-setup` is mainly useful for scripted setup (curl/CI).

## Restoring a backup into a new database

Render free-tier databases expire (see `DB_PG_EXPIRE`). To move to a new database:

1. Before expiry, download **both** backup files (Profile → Backup & Restore: JSON + media ZIP).
2. Point the environment at the new database and start the server (the schemas bootstrap automatically).
3. Create the first account at `/login`, ideally with the same username as your old admin account.
4. Profile → Backup & Restore → import the JSON and the ZIP together.

Backup users are matched to existing accounts by username (then email), so your new admin account
is merged with its backed-up identity. Its cards, shares, and progress import under the new id.
The account's row (including the password hash) is then updated from the backup, so log in with the
**old** password afterwards.

## Implementation

- `src/scripts/js/modules/routes/systemRouter.mjs`: `setup-status`, `initial-setup`, `database-status`, `db-expiration-warning`
- `src/scripts/js/modules/server.mjs`: mounts the router at `/api/system`; `GET /login` passes `needsSetup` to the view
- Roles: the `admin` and `user` roles are seeded by `iam-postgres-schema.sql`. More admins can be added from the
  Profile page (Make Admin) or with `POST /api/admin/users/:userId/promote`.
