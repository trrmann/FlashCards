# FlashCards - Quick Start Setup

How to get a working local environment against a Render PostgreSQL database.
This is the authoritative setup guide. The older long-form guides (DEV_ENVIRONMENT_SETUP,
SETUP_CHECKLIST, MULTI_APP_ARCHITECTURE) describe an earlier plan.

## What you need

- Node.js 20.6+ (`nodemon.json` runs `node --env-file=.env`) and npm
- Git, plus `curl` and `lsof` if you use `deploy.sh`
- A Render account (a free-tier PostgreSQL instance works; it expires after a fixed period)
- Optional: pgAdmin or `psql` for inspecting data

## 1. Create the database (Render)

1. Render dashboard → **New +** → **PostgreSQL**. Choose a name, region, and plan.
2. When it's ready, open **Connections** and note the internal hostname, external hostname,
   port, database, user, and password. On the free tier, also note the **expiry date**.

## 2. Create `.env` in the project root

```env
NODE_ENV=development
PORT_DEV=5000
PORT_PREVIEW=4000
PORT_PROD=3000

DB_PG_INTERNAL_HOSTNAME=<internal hostname>
DB_PG_EXTERNAL_HOSTNAME=<external hostname>   # used locally
DB_PG_PORT=5432
DB_PG_DATABASE=<database>
DB_PG_USER=<user>
DB_PG_PASSWORD=<password>
DB_PG_EXPIRE=<YYYY-MM-DD>                     # optional: header expiry warning

SESSION_SECRET=<random hex>                   # optional locally, required on Render
RENDER_URL=https://<your-app>.onrender.com    # optional: used by deploy.sh -prod
```

`.env` is git-ignored. Never commit it, a copy of it, or its values in a document.
All variables are described in [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md).
`.env.example` still lists keys from the original plan that the code doesn't read.

## 3. Install and run

```bash
npm install
npm run dev            # nodemon → http://localhost:5000
# or
deploy.sh -dev       # same, plus health-check wait, log file, and browser open
```

No manual SQL is needed. On startup the server connects and runs the idempotent IAM and app
schema files (`src/scripts/sql/pg/*-postgres-schema.sql`). Watch the console for the
`[n/N] CREATE TABLE …` progress lines and `✅ Schema bootstrap complete!`.

## 4. Create the first user

Open <http://localhost:5000/login>. With no users in the database, the page shows **First User Setup**.
The account you create there gets the `admin` role.

Restoring from an old database? See _Restoring a backup into a new database_ in
[SYSTEM_INITIAL_SETUP.md](./SYSTEM_INITIAL_SETUP.md).

## 5. Verify

```bash
curl http://localhost:5000/api/health                  # {"status":"healthy",...}
curl http://localhost:5000/api/system/setup-status     # needsSetup true/false
curl http://localhost:5000/api/system/database-status  # tables + row counts
```

## 6. Quality checks

```bash
npm run verify         # prettier --write + eslint
deploy.sh -preview   # strict format/lint, server on :4000, Lighthouse/HTML/CSS/memory suite
```

## 7. Deploy to Render

1. Create a **Web Service** from the GitHub repo. Build command `npm install`, start command `npm start`.
2. Set its environment ([RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md)): `NODE_ENV=production`,
   `SESSION_SECRET`, and the `DB_PG_*` values using the **internal** hostname.
3. Every push to `main` deploys. `deploy.sh -prod` formats, commits, pushes, and polls `RENDER_URL`
   (read the warning in [DEPLOY.md](./DEPLOY.md) about what it commits).

Local dev, preview, and production all use the **same** database, so test data is shared.
