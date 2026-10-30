# Render Environment Variables Configuration

## Summary

This document explains which environment variables from your `.env` file need to be configured in Render.

**Total Variables Used:** 9
**Required for Production:** 7 (Database + Runtime)
**Recommended:** 8 (includes SESSION_SECRET)

---

## Required Variables for Render Production

### 1. Node Runtime Configuration

#### `NODE_ENV`

- **Value:** `production`
- **Purpose:** Tell application to run in production mode
- **Impact:** Enables secure cookies, disables debug logging
- **Required:** ✅ YES

#### `PORT`

- **Value:** `3000` (or whatever Render assigns)
- **Purpose:** Port server listens on
- **Note:** Render typically ignores this and uses their own port
- **Required:** ✅ YES (but Render may override)

---

### 2. Database Connection Variables

#### `DB_PG_INTERNAL_HOSTNAME`

- **Current Value:** `dpg-dbhnuks9v7es73beg8mg-a`
- **Purpose:** Internal hostname for Render PostgreSQL (faster, inside Render network)
- **Used In Production:** ✅ YES (automatically selected when NODE_ENV=production)
- **Required:** ✅ YES

#### `DB_PG_PORT`

- **Current Value:** `5432`
- **Purpose:** Database port
- **Required:** ✅ YES

#### `DB_PG_DATABASE`

- **Current Value:** `shared_apps_wuy4`
- **Purpose:** Database name
- **Required:** ✅ YES

#### `DB_PG_USER`

- **Current Value:** `app_admin`
- **Purpose:** Database user
- **Required:** ✅ YES

#### `DB_PG_PASSWORD`

- **Current Value:** `n448uT1yPMEMFQ9T9Cpb9jEXBWmagmNV`
- **Purpose:** Database password (SECRET!)
- **Security:** ⚠️ **CRITICAL** - Keep secret, never commit
- **Required:** ✅ YES

---

### 3. Security Configuration

#### `SESSION_SECRET`

- **Current Value:** None (defaults to dev secret)
- **Purpose:** Encrypts session cookies
- **Required for Production:** ✅ YES (must be set!)
- **Security:** ⚠️ **CRITICAL** - Use strong random value
- **Example:** Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Optional/Informational Variables

### Local Development Only

#### `RENDER_URL`

- **Current Value:** `https://flashcards-98g4.onrender.com`
- **Purpose:** Render production app URL for deploy script
- **In Render:** ❌ NOT NEEDED (this is for local .env only)
- **Why:** Allows deployment script to automatically open browser to production app
- **Used By:** `bash deploy.sh -prod` command
- **Format:** Full HTTPS URL to your Render app

### Not Required in Render (for reference only)

#### `DB_PG_EXTERNAL_HOSTNAME`

- **Current Value:** `dpg-dbhnuks9v7es73beg8mg-a.virginia-postgres.render.com`
- **Used By:** Local development only (external SSL connection)
- **In Render:** ❌ NOT NEEDED (uses internal hostname)
- **Why:** Render apps connect internally, no external connection needed

#### `DB_PG_EXTERNAL_URL`

- **Purpose:** Reference for external connections (local PgAdmin access)
- **In Render:** ❌ NOT NEEDED
- **Why:** For documentation/PgAdmin only

#### `DB_PG_INTERNAL_URL`

- **Purpose:** Reference for internal connections
- **In Render:** ❌ NOT NEEDED (code doesn't use this directly)
- **Why:** Connection pool handles this

#### `DB_PG_PSQL_COMMAND`

- **Purpose:** Pre-formatted psql command for CLI access
- **In Render:** ❌ NOT NEEDED
- **Why:** For manual database access, not needed by app

#### `DB_PG_EXPIRE` & `DB_PG_VERSION`

- **Purpose:** Metadata about Render database
- **In Render:** ❌ NOT NEEDED
- **Why:** Just informational

---

## Summary: What to Add to Render

### Critical (Must Have)

```env
NODE_ENV=production
PORT=3000
DB_PG_INTERNAL_HOSTNAME=dpg-dbhnuks9v7es73beg8mg-a
DB_PG_PORT=5432
DB_PG_DATABASE=shared_apps_wuy4
DB_PG_USER=app_admin
DB_PG_PASSWORD=n448uT1yPMEMFQ9T9Cpb9jEXBWmagmNV
SESSION_SECRET=<generate-random-value>
```

### Nice to Have (For Debugging)

- `DB_PG_EXTERNAL_HOSTNAME` (optional, for troubleshooting)

---

## How to Set Variables in Render

### Option 1: Render Dashboard UI

1. Go to your service in Render dashboard
2. Click "Environment"
3. Add each variable as a key-value pair
4. Click "Deploy" to apply changes

### Option 2: Environment File

Create `.env.production` in root with production values (keep password secure)

### Option 3: Infrastructure as Code

If using Render's IaC features, add to your render.yaml or similar

---

## Variable Reference by Component

| Variable                  | Component | Production  | Dev         | Local       |
| ------------------------- | --------- | ----------- | ----------- | ----------- |
| `NODE_ENV`                | Express   | production  | development | development |
| `PORT`                    | Express   | 3000        | 5000        | 5000        |
| `DB_PG_INTERNAL_HOSTNAME` | Database  | ✅          | ❌          | ❌          |
| `DB_PG_EXTERNAL_HOSTNAME` | Database  | ❌          | ✅          | ✅          |
| `DB_PG_PORT`              | Database  | ✅          | ✅          | ✅          |
| `DB_PG_DATABASE`          | Database  | ✅          | ✅          | ✅          |
| `DB_PG_USER`              | Database  | ✅          | ✅          | ✅          |
| `DB_PG_PASSWORD`          | Database  | ✅          | ✅          | ✅          |
| `SESSION_SECRET`          | Sessions  | ✅ REQUIRED | Optional    | Optional    |

---

## Security Best Practices for Render

### ✅ DO:

- Generate unique `SESSION_SECRET` for production
- Use Render's environment variable system (encrypted)
- Keep `DB_PG_PASSWORD` secret - never commit to git
- Rotate `SESSION_SECRET` periodically
- Store sensitive values in Render secrets, not in code

### ❌ DON'T:

- Commit `.env` file with real passwords to git
- Use same SESSION_SECRET as development
- Share production credentials via email/chat
- Put secrets in render.yaml if it's committed
- Use weak or simple passwords for DB_PG_PASSWORD

---

## Testing Variables Are Correct

Once set in Render, test with:

```bash
# Test 1: Setup status (detects if DB is connected)
curl https://your-render-app.onrender.com/api/system/setup-status

# Test 2: Database status
curl https://your-render-app.onrender.com/api/system/database-status

# Test 3: Health check
curl https://your-render-app.onrender.com/api/health
```

All should return `200 OK` with valid JSON responses.

---

## Environment Variable Changes Required in Code

Currently, the code handles environment selection automatically:

```javascript
// In src/scripts/js/modules/db/connection.mjs
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
const hostname = isProduction
  ? process.env.DB_PG_INTERNAL_HOSTNAME // ← Uses internal in production
  : process.env.DB_PG_EXTERNAL_HOSTNAME; // ← Uses external in development
```

**No code changes needed!** It automatically selects the right hostname based on environment.

---

## Render-Specific Notes

### Render Environment Variable Behavior

- Automatically sets `process.env.RENDER = true`
- Automatically provides port via `PORT` environment variable
- Variables are encrypted at rest
- Changes trigger automatic redeployment
- Can be masked in logs for security

### Why Different Hostnames?

- **Internal hostname** (`dpg-dbhnuks9v7es73beg8mg-a`) = Faster, within Render network, SSL not required
- **External hostname** (`dpg-dbhnuks9v7es73beg8mg-a.virginia-postgres.render.com`) = For external tools like PgAdmin, requires SSL

---

## Deployment Checklist

Before deploying to Render:

- [ ] Set `NODE_ENV=production`
- [ ] Set `PORT=3000`
- [ ] Set all `DB_PG_*` variables (copy from .env)
- [ ] **Generate new `SESSION_SECRET`** ⚠️
- [ ] Verify variables are encrypted in Render dashboard
- [ ] Deploy code
- [ ] Test endpoints with curl
- [ ] Check application logs for connection errors

---

## File Locations Where Variables Are Used

| File                                       | Variables Used                 |
| ------------------------------------------ | ------------------------------ |
| `server.js`                                | NODE_ENV, PORT, SESSION_SECRET |
| `src/scripts/js/modules/db/connection.mjs` | NODE_ENV, DB_PG_*, RENDER      |
| `src/scripts/js/modules/routes/system.mjs` | DB_PG_DATABASE                 |
| `src/scripts/js/modules/db/init-db.mjs`    | DB_PG_*, RENDER                |

---

## Quick Reference: Copy These to Render

```
NODE_ENV: production
PORT: 3000
DB_PG_INTERNAL_HOSTNAME: dpg-dbhnuks9v7es73beg8mg-a
DB_PG_PORT: 5432
DB_PG_DATABASE: shared_apps_wuy4
DB_PG_USER: app_admin
DB_PG_PASSWORD: n448uT1yPMEMFQ9T9Cpb9jEXBWmagmNV
SESSION_SECRET: [GENERATE A NEW RANDOM VALUE]
```

---

**Status:** Ready for production deployment
**Last Updated:** October 29, 2026
**Next Step:** Deploy to Render with `bash deploy.sh -prod`
