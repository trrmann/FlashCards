# Local Scratch Database

A private PostgreSQL cluster on the developer machine, for schema and migration work (such as the IAM
separation, [IAM_MULTI_APP_DESIGN.md](./IAM_MULTI_APP_DESIGN.md)) that must not be tried first on the shared
Render database. It's the approved exception to "one database for all environments"
([CODING_STANDARDS.md § 0.5](./CODING_STANDARDS.md)).

## What it is

| Item        | Value                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Script      | `src/scripts/sh/local-db.sh` (on the VS Code terminal `PATH`): a wrapper for platform-db's shared script        |
| Server      | The installed PostgreSQL 18 binaries (`postgresql-server` + `postgresql-contrib`), same major version as Render |
| Data        | `~/.local/share/platform-db/` (one cluster for all platform projects), outside the repo, mode 700/600           |
| Listens on  | `127.0.0.1:5433` only (the system PostgreSQL service on 5432 is not touched)                                    |
| Database    | `flashcards_local`, owned by role `flashcards_app` (not a superuser, like on Render)                            |
| Credentials | Random, generated at `init`, stored in `credentials.env` (never in the repo)                                    |

`postgresql-contrib` is required for the `uuid-ossp` and `pgcrypto` extensions the schema creates.

## Commands

```bash
local-db.sh init        # once: create the cluster, role, and database
local-db.sh start       # start (not started automatically at boot)
local-db.sh status
local-db.sh serve       # run the app on http://localhost:5001 against the local DB
local-db.sh psql        # psql on the local DB (search_path flashcards, iam, public, like the app)
local-db.sh reset       # drop and recreate the database (empty)
local-db.sh stop
local-db.sh destroy     # delete the whole local cluster and its data
local-db.sh env         # print the DB_PG_* exports used by serve
local-db.sh run CMD …   # run any command against the local DB (e.g. the round-trip test)
```

`serve` exports `DB_PG_*` (including `DB_PG_SSL=disable`) before starting nodemon. Real environment variables
take precedence over `.env`, so the app talks only to the local database. Port 5001 lets it run alongside
`deploy.sh -dev` (5000).

## Data

- `serve` on an empty database bootstraps both schemas automatically. The first user registered becomes admin.
- Use **synthetic test data** (created through the app or the API, or an entries import such as
  `documents/language_flashcards.json`).
- `local-db.sh load-prod` replaces the local database with a `pg_dump` of the Render database. It only reads
  production, but it copies **real users' personal data** (emails, password hashes) onto the machine.
  Run it only when that is deliberately needed, and `reset` afterwards. Automated assistants must not run it.

## IAM API test

`npm run test:startup` starts the server before its database (reached through a TCP relay that starts late) and checks
the 503 "starting" answers, the retry after a wait round gives up, and normal service once the database is up.

`npm run test:iam` resets the local database, starts the real server in-process on port 5098, registers five users,
and exercises every `/api/iam` endpoint as users with different roles (79 checks: success, 400/401/403/404/409, and
side effects such as a group role granting admin access and disabled app access blocking sign-in). Same local-only guard.

## IAM service tests

The IAM service, token-policy, and client tests moved to the iam-service repository with the code (`npm test` there, database `iam_service_local` in the same local cluster).

## Backup round-trip test

`npm run test:roundtrip` (= `local-db.sh run node src/scripts/js/modules/tests/backup-roundtrip.mjs`) proves
CODING_STANDARDS § 0.7 on this database. It **drops and rebuilds the schema**, so it refuses to run unless the target is
`127.0.0.1`/`localhost` and the database name ends in `_local`. `deploy.sh -preview` runs it after the preview suite.

1. Fresh schema + synthetic data in every table that has a writer; checks every database table is in the backup.
2. Export (JSON + ZIP) → wipe → bootstrap → admin re-created under a new id → import → compare every table,
   read directly from the database, plus the media bytes.
3. Import the same backup again → nothing changes.
4. Import a corrupt backup (a valid user change plus a failing row) → rejected, and nothing changes.

## Verified (2026-11-03)

`init` → `serve` on an empty database: the IAM schema (6 tables) and the app schema (22 tables total)
bootstrapped with zero errors, `/api/health` was healthy, and every page responded.
