# FlashCards Project Structure

## Overview

FlashCards is an Express web application for studying flashcards with a 3-box Leitner
system, quizzes, card sharing, public cards, and multimedia (image, audio, TTS) questions
and answers. Data is stored in PostgreSQL on Render.

### Tech stack

- **Runtime:** Node.js (ES modules, `"type": "module"`), Express 5, EJS 7
- **Database:** PostgreSQL via `pg`; sessions via `express-session` + `connect-pg-simple`
- **Auth:** server-side sessions, `bcrypt` password hashing
- **Media archives:** `adm-zip`
- **Config:** `dotenv`, plus `node --env-file=.env` in `nodemon.json`
- **Dev/test tools:** nodemon, ESLint 10 (flat config) + Prettier, Lighthouse, Puppeteer, html-validate, axe-core

## Directory structure

```text
FlashCards/
├── README.md                     # Pointer only. All docs live in documents/
├── server.js                     # Entry point: imports the Server singleton and calls start()
├── package.json / package-lock.json
├── nodemon.json                  # Runs node --env-file=.env server.js; watches js css ejs env
├── eslint.config.js, .prettierrc.json, .prettierignore
├── .vscode/settings.json, FlashCards.code-workspace  # Put src/scripts/sh on the VS Code terminal PATH
├── .env.example                  # Template (note: several keys in it are not read by the code)
├── documents/                    # All project documentation (+ sample data exports)
├── public/                       # Static assets served at /
│   ├── css/
│   │   ├── styles.css            # Entry: @import chain desktop → laptop → tablet → mobile → core → forms
│   │   ├── app.css               # Shared application components
│   │   └── pages/                # Per-page styles: entries, home, login, logout, practice, profile, quiz
│   └── js/navigation-tracker.js  # Posts page visits to /api/navigation/track
└── src/
    ├── data/test.db              # Unused leftover (the app uses PostgreSQL only)
    ├── views/                    # EJS pages (each with an inline <script> for its behavior)
    │   ├── home.ejs  entries.ejs  practice.ejs  quiz.ejs
    │   ├── login.ejs  profile.ejs  logout.ejs
    │   └── partials/header.ejs  footer.ejs  filter-panel.ejs  mission.ejs
    └── scripts/
        ├── js/modules/
        │   ├── server.mjs        # class Server: middleware, page routes, API mounting, DB bootstrap
        │   ├── appSiteData.mjs   # Page title / user name for templates
        │   ├── db/
        │   │   ├── postgresDatabase.mjs            # Generic adapter (pool, SQL loader, health, expiry)
        │   │   ├── identityManagementDatabase.mjs  # IAM schema owner
        │   │   └── flashCardsDatabase.mjs          # App schema owner
        │   ├── auth/             # Domain services (see ARCHITECTURE.md)
        │   │   ├── userAuthService.mjs  validationService.mjs
        │   │   ├── entriesService.mjs   practiceService.mjs
        │   │   └── backupService.mjs    mediaArchiveService.mjs
        │   ├── routes/           # class XRouter extends BaseRouter
        │   │   ├── baseRouter.mjs
        │   │   ├── systemRouter.mjs  authRouter.mjs  usersRouter.mjs  navigationRouter.mjs
        │   │   └── entriesRouter.mjs  practiceRouter.mjs  quizRouter.mjs  adminRouter.mjs
        │   ├── tools/
        │   │   ├── backupClient.mjs        # BackupClient / BackupCli (HTTP backup + restore)
        │   │   └── backup-cli.mjs          # Entry used by backup.sh / restore.sh
        │   └── tests/
        │       ├── preview-tests.mjs       # npm run test:preview entry
        │       ├── previewTestSuite.mjs    # Lighthouse / HTML / CSS / memory / Web Vitals
        │       ├── testResults.mjs
        │       ├── backup-roundtrip.mjs     # npm run test:roundtrip entry
        │       └── backupRoundTripTest.mjs  # Backup wipe/restore proof (local DB only)
        ├── sh/                           # Shell scripts: on PATH in the VS Code terminal (any dir)
        │   ├── backup.sh                 # Download a full backup (JSON + ZIP) from any environment
        │   ├── deploy.sh                 # deploy.sh -dev | -preview | -prod | -all
        │   ├── local-db.sh               # Local scratch PostgreSQL (LOCAL_DATABASE.md)
        │   └── restore.sh                # Restore / recover an empty database in one command
        └── sql/pg/
            ├── iam-postgres-schema.sql          # IAM tables + role seed
            ├── flashcards-postgres-schema.sql   # App tables + idempotent migrations
            ├── *-queries.sql                    # Named queries (-- Query: name)
            ├── test-queries.sql                 # Test-only (local scratch DB)
            └── transaction-queries.sql          # BEGIN / COMMIT / ROLLBACK for withTransaction()
```

## Pages

| Route       | View           | What it does                                                                                                                                                                                            |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`         | `home.ejs`     | Welcome; when logged in, the **Study Status** dashboard (overall, by class → lesson, by category)                                                                                                       |
| `/entries`  | `entries.ejs`  | Create/edit cards (question types, languages, image/audio/TTS blocks, options), grouped collapsible list, bulk public/private, bulk share, Public Cards (remove/restore), Shared with Me, import/export |
| `/practice` | `practice.ejs` | Leitner practice with the filter panel, statistics, schedule, catch-up mode, "listen" voice answers                                                                                                     |
| `/quiz`     | `quiz.ejs`     | Filtered quiz builder, quiz taking, history                                                                                                                                                             |
| `/login`    | `login.ejs`    | Login and registration; first-user setup when the database has no users                                                                                                                                 |
| `/profile`  | `profile.ejs`  | Profile, password, share-directory visibility, pending shares; admin user management and Backup & Restore                                                                                               |
| `/logout`   | `logout.ejs`   | Logout confirmation                                                                                                                                                                                     |

## npm scripts

| Script                            | Command                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `npm start`                       | `node server.js` (production; env from Render or `.env` via dotenv)             |
| `npm run dev`                     | `nodemon` → `node --env-file=.env server.js`                                    |
| `npm run test:roundtrip`          | Backup wipe/restore proof on the local scratch DB (LOCAL_DATABASE.md)           |
| `npm run test:preview`            | Preview quality suite against `TEST_BASE_URL` (default `http://localhost:5000`) |
| `npm run format` / `format:check` | Prettier write / check                                                          |
| `npm run lint` / `lint:fix`       | ESLint                                                                          |
| `npm run verify`                  | format + lint                                                                   |
| `npm test`                        | Placeholder that exits 1 (no unit tests yet)                                    |

## Environment

See [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md) for the variables the code reads.
Ports: dev 5000, preview 4000, prod `PORT_PROD`/`PORT`/3000 ([PORT_CONFIGURATION.md](./PORT_CONFIGURATION.md)).
`NODE_ENV` defaults to `production` when unset.

## Where to read next

- [ARCHITECTURE.md](./ARCHITECTURE.md): how the layers fit together
- [API_ENDPOINTS.md](./API_ENDPOINTS.md): every route
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md): tables and bootstrap
- [LEITNER_SYSTEM.md](./LEITNER_SYSTEM.md): practice scheduling
- [Issues.md](./Issues.md): open issues and resolution log
