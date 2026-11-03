# FlashCards Architecture & System Design

## System overview

```text
Browser (EJS-rendered pages + inline <script> per page, fetch() to JSON APIs)
   │  session cookie (connect.sid)
   ▼
Express 5 app  ── server.js → src/scripts/js/modules/server.mjs (class Server)
   ├─ middleware: trust proxy · express-session (PgSession store) · express.json(50mb)
   │              · express.static(public/) · EJS view engine · userContextMiddleware
   ├─ page routes:  /  /entries  /practice  /quiz  /login  /profile  /logout
   └─ API routers (classes extending BaseRouter):
        /api/system  /api/auth  /api/users  /api/navigation
        /api/entries  /api/practice (+ /practice)  /api/quiz  /api/admin  /api/health
   │
   ▼
Services (singletons in src/scripts/js/modules/auth/)
   userAuthService · validationService · entriesService · practiceService
   backupService · mediaArchiveService
   │
   ▼
Database adapters (src/scripts/js/modules/db/)
   PostgresDatabase (generic: config, pool, SQL file loader, health, expiry)
     ├─ IdentityManagementDatabase  → iam-postgres-schema.sql
     └─ FlashCardsDatabase          → flashcards-postgres-schema.sql
   │  pg.Pool (SSL, max 20)
   ▼
PostgreSQL on Render (one database, public schema)
```

## Layers

### Server (`server.mjs`)

`class Server` builds the Express app in its constructor and exports a singleton `server`.
`server.start()` listens on the port first, then initializes the database (see Bootstrap).
`server.stop()` closes the HTTP server and both pools.

- **Port**: `resolvePort(env)` gives development → `PORT_DEV` (5000), preview → `PORT_PREVIEW` (4000),
  production → `PORT_PROD` → `PORT` → 3000.
- **Environment**: `NODE_ENV` (lower-cased); defaults to `production` when unset.
- **Sessions**: `express-session` with `connect-pg-simple` on the IAM pool, table `session`.
  Secret is `SESSION_SECRET`, falling back to a hard-coded dev secret. Set it on Render.
  The cookie is httpOnly, `sameSite=lax`, `secure` in production, with a 24 h max age. `trust proxy` = 1 for Render's TLS proxy.
- **userContextMiddleware**: on every request, sets `res.locals.{userId, isLoggedIn, fullName, isAdmin, siteData}`.
- **Page title**: `appSiteData` is a single shared instance. Each page route sets its title,
  and the middleware sets the user's name. Because one object is shared across concurrent
  requests, titles and names can bleed between users under concurrency.

### Routers (`src/scripts/js/modules/routes/`)

Each router is a class extending `BaseRouter`. The base class owns an `express.Router`, the
database handle, and the `requireAuth` and `requireAdmin` middleware. Subclasses implement
`registerRoutes()`, and each module default-exports `instance.router`. Most routers check
`req.session.userId` inline. `usersRouter` and `adminRouter` use the base middleware.
Full reference: [API_ENDPOINTS.md](./API_ENDPOINTS.md).

### Services (`src/scripts/js/modules/auth/`)

Despite the folder name, these are the domain services:

| Service               | Responsibility                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `validationService`   | bcrypt hash/compare (10 rounds); username, email, and password rules                     |
| `userAuthService`     | Users, roles (`admin`), visibility, storage limit, last page, delete-user cascade        |
| `entriesService`      | Card CRUD, media blocks, options, storage usage, public cards, sharing, metadata         |
| `practiceService`     | Leitner scheduling, option generation, session repetitions, stats, dashboard, difficulty |
| `backupService`       | Full-dataset export/import (upsert) across IAM and app tables                            |
| `mediaArchiveService` | Media ZIP build/parse (`media/<media_id>.<ext>`), manifest                               |

Each service loads its SQL as a static `queries` map, read from a named-query file in `src/scripts/sql/pg/`.

### Data layer

`PostgresDatabase` loads `.env` via dotenv. It reads `DB_PG_*` variables. In production
(`NODE_ENV=production` or `RENDER` set), it uses `DB_PG_INTERNAL_HOSTNAME`; otherwise it uses
`DB_PG_EXTERNAL_HOSTNAME`. SSL is always on with `rejectUnauthorized: false`.
Every query is logged with its duration. An error on an idle pool client exits the process.

The two adapters (`IdentityManagementDatabase`, `FlashCardsDatabase`) are separate pools to the same
database, each with its own PostgreSQL schema (`iam`, `flashcards`) on its connection `search_path`.
App code reaches identity data only through `userAuthService` (no cross-domain SQL); app tables link to
`iam.users` by foreign key with `ON DELETE CASCADE`. The IAM becomes a separate service in a later phase
(IAM_MULTI_APP_DESIGN.md).
See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

### Frontend

- `src/views/*.ejs` pages include `partials/header.ejs`, `partials/footer.ejs`, `partials/filter-panel.ejs`, and `partials/mission.ejs`.
  Each page's behavior is an inline `<script>` that calls the JSON APIs with `fetch`. There is no bundler and no client framework.
- CSS (as of the class-driven styling refactor):
  - `styles.css` → `desktop.css` → `laptop.css` → `tablet.css` → `mobile.css` → `core.css` → `forms.css` (an `@import` chain of breakpoint layers)
  - `app.css`: shared app components
  - `pages/<page>.css`: per-page styles, chosen by the `activePage` value each view passes to the header
  - Visibility is toggled with classes, not inline styles.
- `public/js/navigation-tracker.js` posts page visits to `/api/navigation/track`.
- Browser APIs used: Web Speech (TTS for `text_tts` blocks and speech input for `listen` mode), MediaRecorder (audio recording), FileReader (images and import files).

## Data flows

### Login

`login.ejs` → `POST /api/auth/login` → `userAuthService.authenticateUser` (bcrypt, `status = 'active'`)
→ session saved in Postgres → response `redirectTo` = last page visited → browser navigates there.

### Practice (Leitner)

```text
/practice page load → initializeAllCardsForUser → stats/schedule/summary/streak rendered
"Start" → sessionStartTime = now (client)
loop:
  GET /api/practice/next?class=&lesson=&category=   → random due card + options (incl. isCorrect)
  user answers (choice, multi-select, or "listen" self-grade); browser decides isCorrect
  POST /api/practice/answer {flashcardId, isCorrect, sessionStartTime, filter*}
     → session_card_attempts + practice_history rows
     → after 3/2/1 attempts (box 1/2/3): all correct → promote, any wrong → box 1; next_review set
```

Details: [LEITNER_SYSTEM.md](./LEITNER_SYSTEM.md), [NONE_OF_ABOVE_FEATURE.md](./NONE_OF_ABOVE_FEATURE.md),
[REPETITIONS_IMPLEMENTATION.md](./REPETITIONS_IMPLEMENTATION.md).

### Quiz

`POST /api/quiz/start` (practiced cards only, ≤ 20, difficulty-bucketed) → client runs the quiz
→ `POST /api/quiz/:id/submit` with per-card `is_correct` → `quiz_results`. Quiz answers do not
affect Leitner boxes.

### Import / export

Two linked files at every point: a data JSON plus a media ZIP keyed by `media_id`.

- User level: `/api/entries/export` + `/export/media` → `/api/entries/import` (upsert by question text).
- Admin level: `/api/admin/backup/download` + `/download-media` → `/api/admin/backup/import`
  (upsert by primary key; roles/rights matched by name; users matched by username/email and their ids remapped).

## Security notes (current state)

| Area                      | Status                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Passwords                 | bcrypt, 10 rounds. Password change does not require the current password.                            |
| Sessions                  | Server-side in Postgres; httpOnly cookie; secure in production. Set `SESSION_SECRET`.                |
| Authorization             | Ownership checks in services (`created_by`); admin = `admin` role. Fine-grained `rights` are unused. |
| SQL                       | Parameterized queries. Dynamic clauses come only from fixed templates and whitelisted column names.  |
| Grading                   | Practice and quiz correctness is computed in the browser and trusted by the server.                  |
| Rate limiting, CORS, CSRF | None (same-origin app with `sameSite=lax` cookies).                                                  |
| Storage abuse             | Per-user quota (`storage_max_bytes`, default 25 MB) on card create and import.                       |
| Secrets                   | `.env` is ignored by git. `.env.backup` is ignored but **is tracked** in the repo (see Issues).      |

## Deployment

Render web service (auto-deploys on push to `main`) plus a Render PostgreSQL database.
Local dev and preview point to the same Render database through its external hostname.
See [DEPLOY.md](./DEPLOY.md), [ENVIRONMENTS.md](./ENVIRONMENTS.md), and [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md).
