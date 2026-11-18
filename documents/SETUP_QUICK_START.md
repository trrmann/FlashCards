# FlashCards - Quick Start Setup

How to get a working local environment against the shared local PostgreSQL cluster.
This is the authoritative setup guide. The older long-form guides (DEV_ENVIRONMENT_SETUP,
SETUP_CHECKLIST, MULTI_APP_ARCHITECTURE) describe an earlier plan.

## What you need

- Node.js 20.6+ (`nodemon.json` runs `node --env-file=.env`) and npm
- Git, plus `curl` and `lsof` if you use `deploy.sh`
- PostgreSQL server tools (`initdb`, `pg_ctl`) for the local scratch database; see [LOCAL_DATABASE.md](./LOCAL_DATABASE.md)
- A Render account only if you need to refresh local data from production or deploy
- Optional: pgAdmin or `psql` for inspecting data

## 1. Initialize the local database

Initialize the shared local PostgreSQL cluster once:

```bash
src/scripts/sh/local-db.sh init
```

The shared cluster listens on `127.0.0.1:5433`. `deploy.sh -dev` and `deploy.sh -preview` use
separate local databases: `flashcards_dev_local` for dev and `flashcards_preview_local`
for preview; tests use `flashcards_local`.
See [LOCAL_DATABASE.md](./LOCAL_DATABASE.md) for refresh and database-management commands.

## 2. Configure application settings

Keep application secrets such as `SESSION_SECRET` in `.env`. The local database scripts provide
the `DB_PG_*` settings for local dev and preview, so a Render database configuration in `.env`
is not needed for those workflows. For `deploy.sh -preview --remote`, production database
settings are read from `.env` and the connection is forced read-only.

```env
NODE_ENV=development
PORT_DEV=2010
PORT_PREVIEW=5010
SESSION_SECRET=<random hex>                   # optional locally, required on Render
RENDER_URL=https://<your-app>.onrender.com
```

`.env` is git-ignored. Never commit it, a copy of it, or its values in a document.
All variables are described in [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md).
`.env.example` still lists keys from the original plan that the code doesn't read.

## 3. Install and run

```bash
npm install
deploy.sh -dev         # local database, health-check wait, log file, and browser open
```

No manual SQL is needed. On startup the server connects and runs the idempotent IAM and app
schema files (`src/scripts/sql/pg/*-postgres-schema.sql`). Watch the console for the
`[n/N] CREATE TABLE …` progress lines and `✅ Schema bootstrap complete!`.

## 4. Create the first user

Open <http://localhost:2010/login>. With no users in the database, the page shows **First User Setup**.
The account you create there gets the `admin` role.

Restoring from an old database? See _Restoring a backup into a new database_ in
[SYSTEM_INITIAL_SETUP.md](./SYSTEM_INITIAL_SETUP.md).

## 5. Verify

```bash
curl http://localhost:2010/api/health                  # {"status":"healthy",...}
curl http://localhost:2010/api/system/setup-status     # needsSetup true/false
curl http://localhost:2010/api/system/database-status  # tables + row counts
```

## 6. Quality checks

```bash
npm run verify         # non-mutating Prettier check + ESLint
deploy.sh -preview   # strict format/lint, server on :4000, Lighthouse/HTML/CSS/memory suite
```

## 7. Deploy to Render

1. Create a **Web Service** from the GitHub repo. Build command `npm install`, start command `npm start`.
2. Set its environment ([RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md)): `NODE_ENV=production`,
   `SESSION_SECRET`, and the `DB_PG_*` values using the **internal** hostname.
3. Every push to `main` deploys. `deploy.sh -prod` formats, commits, pushes, and polls `RENDER_URL`
   (read the warning in [DEPLOY.md](./DEPLOY.md) about what it commits).

Local dev and preview use the local scratch database. Production uses the provider-managed
database; a local preview can access it only through `deploy.sh -preview --remote`, which is
read-only.
