# Environment Variables

This is every environment variable the code reads (`process.env.*` in `server.js` and `src/`,
plus `RENDER_URL` in `deploy.sh`).

> **Never put real values in this document or any committed file.** Values belong in `.env`
> (git-ignored) locally and in the Render dashboard (Web Service → Environment) for production.

## Variables read by the application

| Variable                      | Required in Render                  | Default                 | Used by / effect                                                                                                                     |
| ----------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                    | ✅ `production`                     | `production` if unset   | Secure cookies; port selection; DB host selection                                                                                    |
| `SESSION_SECRET`              | ✅                                  | hard-coded dev secret   | Signs the session cookie. **Must** be set to a long random value in production                                                       |
| `DB_PG_INTERNAL_HOSTNAME`     | ✅                                  | —                       | DB host when `NODE_ENV=production` or `RENDER` is set (also fallback locally)                                                        |
| `DB_PG_EXTERNAL_HOSTNAME`     | ❌ (local only)                     | —                       | DB host for local dev/preview (connects over the internet with SSL)                                                                  |
| `DB_PG_PORT`                  | ✅                                  | `5432`                  | DB port                                                                                                                              |
| `DB_PG_DATABASE`              | ✅                                  | —                       | DB name (also reported by `/api/system/database-status`)                                                                             |
| `DB_PG_USER`                  | ✅                                  | —                       | DB user                                                                                                                              |
| `DB_PG_PASSWORD`              | ✅ (secret)                         | —                       | DB password                                                                                                                          |
| `DB_PG_EXPIRE`                | recommended                         | —                       | Date the Render free DB expires (e.g. `2026-12-01`); drives the header warning banner                                                |
| `DB_PG_SSL`                   | ❌ (never set on Render)            | SSL on                  | `disable` turns SSL off. Only for the local scratch DB (`local-db.sh`), see LOCAL_DATABASE.md                                        |
| `IAM_CLIENT_SECRET_<APP_KEY>` | ✅ on the IAM service once deployed | —                       | Application credential, e.g. `IAM_CLIENT_SECRET_FLASHCARDS` (≥ 32 chars). The same value goes to that application (step 3c)          |
| `PORT_PROD` / `PORT`          | ❌ (Render sets `PORT`)             | `3000`                  | Production listen port: `PORT_PROD`, then `PORT`, then 3000                                                                          |
| `PORT_DEV`                    | ❌                                  | `5000`                  | Listen port when `NODE_ENV=development`                                                                                              |
| `PORT_PREVIEW`                | ❌                                  | `4000`                  | Listen port when `NODE_ENV=preview`                                                                                                  |
| `RENDER`                      | set by Render                       | —                       | Forces internal DB hostname                                                                                                          |
| `TEST_BASE_URL`               | ❌                                  | `http://localhost:5000` | Target of `npm run test:preview`                                                                                                     |
| `DB_PG_POOL_MAX`              | optional                            | `20`                    | Connection pool size, and the database scheduler's concurrency. Keep the total of all services under the database's connection limit |
| `DB_PG_RATE_PER_SECOND`       | optional                            | off                     | Rate limit for database work (with `DB_PG_RATE_BURST`)                                                                               |
| `DB_PG_QUERY_RULES`           | optional                            | —                       | Path to a JSON file overriding which named queries are `critical` / `interactive` / `background`                                     |
| `DB_PG_SCHEDULER`             | ❌                                  | on                      | `off` bypasses the database scheduler (escape hatch)                                                                                 |
| `DB_PG_READ_ONLY`             | ❌ (local only)                     | `false`                 | `true` opens the database read-only: PostgreSQL refuses writes, no schema bootstrap. Set by `deploy.sh -preview --remote`            |
| `DB_PG_ALLOW_REMOTE_WRITES`   | ❌ (never set)                      | —                       | `true` lets a development/preview server write to a remote database. Deliberate owner use only                                       |
| `IAM_URL`                     | not yet (phase 3c switch-over)      | — (in-process IAM)      | URL of the IAM service. When set, FlashCards reaches identity over HTTP instead of in-process. Remove it to switch back              |
| `IAM_CLIENT_SECRET`           | with `IAM_URL` (secret)             | —                       | FlashCards' application secret, the same value as the IAM service's `IAM_CLIENT_SECRET_FLASHCARDS`. Required when `IAM_URL` is set   |
| `IAM_CLIENT_ID`               | optional                            | `flashcards`            | FlashCards' application key at the IAM service                                                                                       |
| `GITHUB_TOKEN`                | ✅ (build only, secret)             | —                       | Read-only access to the private `trrmann/iam-service` package. Used only by `render-build.sh`, never logged                          |

## Build command

Render's **Build Command** for FlashCards is
`if [ -f src/scripts/sh/render-build.sh ]; then bash src/scripts/sh/render-build.sh; else npm install; fi`.
That command also works for code without the script (today's `main`), so it can be set before the release. `render-build.sh` lets npm install the shared
packages from GitHub: it rewrites `git+ssh` to HTTPS and supplies `GITHUB_TOKEN` through a git credential helper, so the
token never appears in a URL or a log. Then it runs `npm ci`. Without the token, installing the private iam-service
package fails with a clear message. The token should be a fine-grained GitHub token with read-only **Contents**
permission on `trrmann/iam-service` only.

Connection settings that are **not** configurable through env (constants in `PostgresDatabase`):
pool max 20, idle timeout 30 s, connect timeout 2 s, SSL with `rejectUnauthorized: false`.

> ⚠️ If `PORT_PROD` is set in Render it overrides Render's `PORT`. Don't set `PORT_PROD` in Render.

## Health check and start-up

Set the web service's **Health Check Path** to `/api/health` (Render → service → Settings → Health Checks).

On start the server listens at once, then waits for the database (backoff from 0.5 s to 10 s, rounds of up to 120 s,
repeated every 5 s) and bootstraps the schemas. Until that is done, every request gets **503** with `Retry-After: 5`:
`{"status": "starting"}` on `/api/*`, a short text on pages. With the health check path set, Render keeps the previous
deploy serving until the new one is healthy, so a deploy that can't reach the database never takes the site down.
Platform-wide start-up order: iam-service `documents/PLATFORM_ACCESS_AND_STARTUP.md`.

## Variables used only by tooling

| Variable     | Where                       | Purpose                                                         |
| ------------ | --------------------------- | --------------------------------------------------------------- |
| `RENDER_URL` | `.env`, read by `deploy.sh` | Production URL to health-check and open after `deploy.sh -prod` |

Informational keys that Render shows for a database (`DB_PG_EXTERNAL_URL`, `DB_PG_INTERNAL_URL`,
`DB_PG_PSQL_COMMAND`, `DB_PG_VERSION`) can be kept in `.env` for psql/pgAdmin convenience. The code doesn't read them.

## Keys in `.env.example` that the code does not read

`DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA`, `DB_POOL_*`,
`DB_IDLE_TIMEOUT`, `DB_CONNECTION_TIMEOUT`, `JWT_*`, `BCRYPT_ROUNDS`, `HOST`, `CORS_*`,
`SESSION_MAX_DURATION`, `STUDY_SESSION_TIMEOUT`, `LOG_LEVEL`, `*_PAGE_SIZE`, `RATE_LIMIT_*`, `ENABLE_*`.
These come from the original plan. Use the `DB_PG_*` names above instead.

## Setting up Render

1. Render dashboard → your Web Service → **Environment**.
2. Add `NODE_ENV=production`, `SESSION_SECRET`, and the `DB_PG_*` values from your Render PostgreSQL
   instance's **Connections** panel (use the _internal_ hostname). Add `DB_PG_EXPIRE` if on the free tier.
3. Save. Render redeploys automatically.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Verifying

```bash
curl https://<your-app>.onrender.com/api/health                 # {"status":"healthy",...}
curl https://<your-app>.onrender.com/api/system/database-status
```

The startup log prints `NODE_ENV`, `PORT`, cookie security, and `✅ Database connected: <host>`.

## Rotating the database password

Render can't change a password in place: you add a new login, switch to it, then delete the old one. Production keeps
running throughout. Last done 2026-11-04 (the password had been committed to this repo's history).

1. Render → PostgreSQL instance → **Info → Credentials → + New default credential** (for example
   `app_admin_YYYYMMDD`). The new login acts as the original owner role, so the schema bootstrap keeps working.
2. Put the new `DB_PG_USER` / `DB_PG_PASSWORD` (and the `DB_PG_*_URL` / `DB_PG_PSQL_COMMAND` convenience values) in
   the local `.env`, then run `src/scripts/sh/prod-readonly-check.sh`: `login_acts_as_owner` and
   `login_can_read_write_all` must be `t` for both schemas.
3. Update `DB_PG_USER` and `DB_PG_PASSWORD` in the Web Service environment, then **Save and deploy** (or restart).
4. Rerun the check until the old login shows no connections, then delete it under **Credentials**. Render revokes its
   login but keeps it as the owner of the tables.
