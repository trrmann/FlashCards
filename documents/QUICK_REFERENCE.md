# FlashCards quick reference

Shared environment and port rules: [canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md).

## Commands

```bash
npm install
npm run dev                 # Local development; PORT_DEV defaults to 2010
npm run verify              # Non-mutating Prettier check + ESLint
npm run test:preview        # Preview quality suite; default TEST_BASE_URL is localhost:5010
npm run test:roundtrip      # Backup wipe/restore proof on the disposable local test DB

deploy.sh -dev              # Local dev server on :2010; opens the dev URL
deploy.sh -preview          # Quality gate + local preview on :5010
deploy.sh -preview --remote # Local code with production DB read-only
deploy.sh -prod             # Push to main and trigger Render auto-deploy
deploy.sh -all              # Dev → preview → production, with manual pauses

backup.sh [url]             # Full backup outside the repository
restore.sh <url> <json> <zip>
local-db.sh start|serve|run # Local PostgreSQL tooling
```

Development and preview use separate local databases. See
[ENVIRONMENTS.md](./ENVIRONMENTS.md) and [DEPLOY.md](./DEPLOY.md).

Last deployment log: `.deployment/last-run.log`.

## URLs

| What            | URL                           |
| --------------- | ----------------------------- |
| Dev             | <http://localhost:2010>       |
| Preview         | <http://localhost:5010>       |
| Health          | `/api/health`                 |
| Setup status    | `/api/system/setup-status`    |
| Database status | `/api/system/database-status` |

## Where things live

| Concern                       | Location                            |
| ----------------------------- | ----------------------------------- |
| Server setup and page routes  | `src/scripts/js/modules/server.mjs` |
| API routes                    | `src/scripts/js/modules/routes/`    |
| Business logic                | `src/scripts/js/modules/`           |
| SQL                           | `src/scripts/sql/pg/`               |
| Database connection/bootstrap | `src/scripts/js/modules/db/`        |
| Pages                         | `src/views/`                        |
| Styles                        | `public/css/`                       |
