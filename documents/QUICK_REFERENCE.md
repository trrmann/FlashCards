# FlashCards Quick Reference

## Commands

```bash
npm install
npm run dev                 # nodemon, NODE_ENV from .env → http://localhost:5000 (development)
npm start                   # node server.js (production mode unless NODE_ENV says otherwise)
npm run verify              # prettier --write . && eslint
npm run test:preview        # preview quality suite against $TEST_BASE_URL (default :5000)

deploy.sh -dev            # dev server on :5000, waits for /api/health, opens browser
deploy.sh -preview        # strict format+lint, server on :4000, runs test:preview
deploy.sh -prod           # prettier, `git add .` + commit, push main, poll RENDER_URL
deploy.sh -all            # dev → (Enter) → preview → (Enter) → prod
```

Log of the last `deploy.sh` run: `.deployment/last-run.log`.

## URLs

| What          | URL                                                                    |
| ------------- | ---------------------------------------------------------------------- |
| Dev / Preview | <http://localhost:5000> / <http://localhost:4000>                      |
| Health        | `/api/health`                                                          |
| Setup status  | `/api/system/setup-status`                                             |
| Table status  | `/api/system/database-status`                                          |
| Pages         | `/`, `/entries`, `/practice`, `/quiz`, `/login`, `/profile`, `/logout` |

## Where things live

| Concern                      | File(s)                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| Server setup, page routes    | `src/scripts/js/modules/server.mjs`                          |
| API routes                   | `src/scripts/js/modules/routes/*Router.mjs`                  |
| Business logic               | `src/scripts/js/modules/auth/*Service.mjs`                   |
| SQL (schema + named queries) | `src/scripts/sql/pg/`                                        |
| DB connection / bootstrap    | `src/scripts/js/modules/db/`                                 |
| Pages                        | `src/views/*.ejs` (+ `partials/`)                            |
| Styles                       | `public/css/styles.css` chain, `app.css`, `pages/<page>.css` |

## Key rules at a glance

- **Auth:** cookie session stored in Postgres, 24 h. The first user is admin.
- **Password:** ≥ 8 chars, with uppercase, lowercase, digit, and one of `!@#$%^&*`. **Username:** 3–50 chars, `[A-Za-z0-9_-]`.
- **Accessible cards:** your own, accepted shares, and public cards you haven't removed.
- **Filters:** case-insensitive; a trailing `*` is a prefix wildcard (except quiz start, which is exact).
- **Leitner:** box 1 is due daily, box 2 on Sun/Tue/Thu/Sat, box 3 on Friday, and `next_review` must have passed.
  A session needs 3/2/1 attempts; all correct → promote, any wrong → box 1.
- **Options:** same class and category distractors; ~15% "None of the above" for standard text cards.
- **Quiz:** practiced cards only, ≤ 20 questions, bucketed by difficulty.
- **Storage quota:** 25 MB per user by default (admins can change it).
- **Export/backup:** always two files, a data JSON plus a media ZIP (`media/<media_id>.<ext>`).

## Database access

```bash
psql "postgresql://<user>:<password>@<external-host>:5432/<db>?sslmode=require"
```

Credentials are in your local `.env` (`DB_PG_*`) and in the Render dashboard. Never paste them into docs.

## Troubleshooting

| Symptom                                 | Check                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `Database connection failed` at startup | `DB_PG_*` values; locally `DB_PG_EXTERNAL_HOSTNAME` must be set                 |
| `Schema bootstrap … failed`             | Startup log names the first failing statement                                   |
| Login works locally but not on Render   | `NODE_ENV=production` needs HTTPS (secure cookie); set `SESSION_SECRET`         |
| "More Entries Needed" in practice       | Add cards with the same class+category (see DIAGNOSTIC_INSUFFICIENT_ENTRIES.md) |
| Quiz says no flashcards                 | Quiz uses only cards you have practiced at least once                           |
| `413 Storage limit exceeded`            | Admin → raise the user's storage limit, or remove media                         |
| Header shows DB expiry warning          | `DB_PG_EXPIRE`. Take a backup (JSON + ZIP) and move to a new DB                 |
| Port in use                             | `lsof -i :5000` / `:4000`; `deploy.sh` kills the old listener itself            |
