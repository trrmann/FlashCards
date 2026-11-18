# FlashCards deployment

The shared environment and deployment contract is maintained in the
[canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md#environment-contract).
This page documents the current FlashCards script:
[`src/scripts/sh/deploy.sh`](../src/scripts/sh/deploy.sh).

## Commands

```bash
deploy.sh -dev
deploy.sh -preview
deploy.sh -preview --remote
deploy.sh -prod
deploy.sh -all
```

| Mode                | Behavior                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-dev`              | Starts local development on `http://localhost:2010`, using local `flashcards_dev_local`. It does not run the full preview quality gate.                                         |
| `-preview`          | Runs formatting/lint and preview tests, then starts local preview on `http://localhost:5010` using the separate `flashcards_preview_local` database.                            |
| `-preview --remote` | Runs local code with the explicitly configured production database in read-only mode. Use only for approved, non-mutating checks; production HTTP APIs may still accept writes. |
| `-prod`             | Commits/pushes to GitHub `main` and triggers Render's auto-deploy. Check the Render dashboard for deployment status and the service URL.                                        |
| `-all`              | Runs dev, preview, and production sequentially, with manual pauses between stages.                                                                                              |

The script opens the local dev or preview URL after starting that mode. It logs
the current run to `.deployment/last-run.log`.

## Data targets

- Dev: local `flashcards_dev_local` on PostgreSQL `127.0.0.1:5433`.
- Preview: separate local `flashcards_preview_local`.
- Tests: disposable local `flashcards_local`, separate from dev/preview.
- Preview `--remote` and production: provider-managed production database.

Local variable names and safe defaults are in `.env.example`. Production
connection values and secrets belong in Render's environment settings. See
[ENVIRONMENTS.md](./ENVIRONMENTS.md),
[LOCAL_DATABASE.md](./LOCAL_DATABASE.md), and
[RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md).
