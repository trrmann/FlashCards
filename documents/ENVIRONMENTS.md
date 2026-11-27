# FlashCards environments

The shared environment contract is maintained in the
[canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md#environment-contract).
This page records FlashCards' current configuration and gaps; the canonical
contract is the target where the two differ.

| Mode                                           | Code and service targets                                                      | Database                                                        | Status                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Development (`deploy.sh -dev`)                 | Local code; local dev port `2010`; IAM dev URL from `IAM_DEV_URL`             | Local `flashcards_dev_local` on PostgreSQL `127.0.0.1:5433`     | Active                                                           |
| Preview (`deploy.sh -preview`)                 | Local code; local preview port `5010`; IAM preview URL from `IAM_PREVIEW_URL` | Local `flashcards_preview_local` on PostgreSQL `127.0.0.1:5433` | Active; isolated from dev                                        |
| Preview remote (`deploy.sh -preview --remote`) | Local code with explicitly selected production remotes                        | Production database with `DB_PG_READ_ONLY=true`                 | Use only for approved, non-mutating checks                       |
| Production                                     | Render-hosted release; provider supplies `PORT`                               | Provider-managed production database                            | Production environment values belong in Render, not local `.env` |
| Tests                                          | Local test processes                                                          | `flashcards_local`, separate from dev and preview               | Disposable; tests may rebuild only this test database            |

`deploy.sh -dev` and default `deploy.sh -preview` obtain distinct local database
settings from the local database helper. Local code selects IAM using the
environment-specific `IAM_DEV_URL` or `IAM_PREVIEW_URL`; it does not inherit
`IAM_URL` or `IAM_PROD_URL` from production configuration.

FlashCards always signs users in through the IAM service over HTTP; there is no
in-process identity. Development and preview fall back to the local IAM service
at `http://127.0.0.1:2030` and `http://127.0.0.1:5030` when their URL is unset,
so start iam-service first and set `IAM_DEV_CLIENT_SECRET` (or
`IAM_PREVIEW_CLIENT_SECRET`). Tests start their own IAM service on the scratch
database.

For an explicitly remote preview, the script reads production connection
settings from the local ignored `.env` and enables PostgreSQL read-only mode.
Remote-preview checks must remain non-mutating; database read-only mode does not
make production HTTP APIs read-only.

Local variable names and safe defaults are listed in `.env.example`. Production
secrets and provider connection values must remain in Render's environment
settings. Never copy their values into this document or commit them.
