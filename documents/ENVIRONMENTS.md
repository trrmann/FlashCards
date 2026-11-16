# FlashCards - Environments Overview

> **Target behavior** is defined by [CODING_STANDARDS.md §§ 0.5–0.7](./CODING_STANDARDS.md) (deploy stages,
> preview test coverage, data safety). This page describes the **current** behavior; the gaps are listed in that document.

## Three Deployment Environments

### 🔵 Development (Dev)

- **Where:** Your local machine
- **Server:** Runs on localhost:5000
- **Database:** Local `flashcards_dev_local` on the shared PostgreSQL cluster (`127.0.0.1:5433`)
- **Code Location:** Local files only
- **Access:** http://localhost:5000
- **Use Case:** Active development, testing locally
- **Deployment:** `deploy.sh -dev`

### 🟢 Preview

- **Where:** Your local machine
- **Server:** Runs on localhost:4000 (`NODE_ENV=preview`, `PORT_PREVIEW`)
- **Database:** Local `flashcards_dev_local`; `deploy.sh -preview --remote` uses production read-only
- **Code Location:** Local files only
- **Access:** http://localhost:4000
- **Checks:** Prettier + ESLint must pass, then `npm run test:preview` (Lighthouse, HTML/CSS, memory, Web Vitals) must pass
- **Use Case:** Test before pushing to prod
- **Deployment:** `deploy.sh -preview`

### 🔴 Production (Prod)

- **Where:** Render servers (cloud)
- **Server:** Runs on Render URL
- **Database:** Remote on Render
- **Code Location:** GitHub + Render
- **Access:** Your Render app URL
- **Use Case:** Live application
- **Deployment:** `deploy.sh -prod` (auto-deploys via GitHub)

---

## Key Difference: Server Location

```
DEV/PREVIEW          →    PROD
─────────────────────────────────
Your Computer              Render Cloud
   ↓                          ↓
server.js runs         server.js runs
   ↓                          ↓
localhost:5000         render-app-url.onrender.com
   ↓                          ↓
   ↓                       (Auto-deployed
localhost              from GitHub)
```

---

## Workflow

### Development Workflow

```
1. Make code changes locally
2. Run: deploy.sh -dev
3. Test on localhost:5000
4. Repeat steps 1-3
```

### Preview Workflow

```
1. Finish development
2. Run: deploy.sh -preview
3. Final local testing
4. If OK → proceed to prod
```

### Production Workflow

```
1. Commit code to GitHub
   git add .
   git commit -m "Feature description"
   git push origin main

2. Run: deploy.sh -prod
   (Waits for GitHub auto-deploy to Render)

3. Test on Render URL
   (Opens browser automatically)
```

### Deploy All Environments

```
deploy.sh -all

Runs in order:
  1. Dev (localhost:5000)  → press Enter
  2. Preview (localhost:4000) → press Enter
  3. Prod (Render URL, waits for auto-deploy)
```

---

## Database Connection

**Database targets are separated by default:**

Development and preview use `flashcards_dev_local` in the shared local PostgreSQL cluster at
`127.0.0.1:5433`. Tests use the separate `flashcards_local` database. Local database scripts
default `LOCAL_PG_PORT` to `5433` and pass it to the app as `DB_PG_PORT`.

Production uses the provider-managed Render database and its supplied `DB_PG_PORT` (currently
`5432`). `deploy.sh -preview --remote` can connect to production from localhost, but forces
read-only mode. No per-application schema is used.

---

## Environment Variables

### Local dev / preview

`deploy.sh -dev` and `deploy.sh -preview` inject local `DB_PG_*` settings from
`src/scripts/sh/local-db.sh`. Keep Render database settings out of the local dev/preview path;
the explicit `deploy.sh -preview --remote` mode reads them from `.env` and connects read-only.

### Prod (Render dashboard)

Set the connection values supplied by the database provider in Render's environment settings.
Render currently uses port `5432`; use the supplied `DB_PG_PORT` rather than assigning a
web-service port to PostgreSQL.

```text
NODE_ENV=production
SESSION_SECRET=<long random value>
DB_PG_INTERNAL_HOSTNAME, DB_PG_PORT, DB_PG_DATABASE, DB_PG_USER, DB_PG_PASSWORD, DB_PG_EXPIRE
PORT=assigned by Render
```

Full list: RENDER_ENVIRONMENT_VARIABLES.md.

---

## Deployment Script

Use `deploy.sh` to automate deployments:

```bash
# Dev environment
deploy.sh -dev

# Preview environment
deploy.sh -preview

# Production environment (GitHub auto-deploy)
deploy.sh -prod

# All environments in sequence
deploy.sh -all
```

**What the script does:**

- Checks prerequisites (Node, git, etc.)
- Runs linter/tests if configured
- Builds/prepares code
- Deploys to selected environment
- Opens browser for testing
- Logs all output to `.deployment/last-run.log`
- Aborts on errors

---

## Typical Development Cycle

```
Morning:
  deploy.sh -dev
  (Opens http://localhost:5000)

Code all day:
  1. Make changes
  2. Manual test on localhost
  3. Repeat

Before lunch/end of day:
  deploy.sh -preview
  (Final local test)

Ready to ship:
  git push origin main
  deploy.sh -prod
  (Opens render-app-url.onrender.com)
  (Waits for auto-deploy, then tests)
```

---

## Troubleshooting

**Dev/Preview won't start:**

- Check .env values
- Check `npm install` completed
- Check port 5000 (dev) / 4000 (preview) not in use (the script kills existing listeners)

**Prod deploy stuck:**

- Check GitHub push succeeded
- Check Render webhook configured
- Script waits 45 seconds, then polls `RENDER_URL` up to 60 times every 2 seconds

**Database errors in any env:**

- Dev/preview: local `flashcards_dev_local`; prod: Render. Run `pull-prod.sh` to refresh the local copy
- Check pgAdmin connection
- Check `/api/system/database-status` and the startup bootstrap log

---

## Important Notes

- **Dev and Preview are local only** - server.js doesn't deploy to Render
- **Prod is auto-deployed** - pushing to GitHub triggers Render deployment
- **Dev and preview use the local dev database** (`flashcards_dev_local`, refreshed with `pull-prod.sh`); `deploy.sh -preview --remote` reads production read-only; only Render writes to production
- **Deployment logs** - stored in `.deployment/last-run.log` (not backed up)
- **Script is rerunnable** - safe to run multiple times
