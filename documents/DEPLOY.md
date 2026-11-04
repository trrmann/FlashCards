# FlashCards Deploy Script

> **Target behavior** is defined by [CODING_STANDARDS.md §§ 0.5–0.7](./CODING_STANDARDS.md) (deploy stages,
> preview test coverage, data safety). This page describes the **current** behavior; the gaps are listed in that document.

> **Location:** `src/scripts/sh/deploy.sh`. It's on the VS Code terminal `PATH`, so run `deploy.sh …`
> (or the `deploy` alias) from any directory. See [DEPLOY_ACCESSIBILITY.md](./DEPLOY_ACCESSIBILITY.md).

One-command deployments to dev, preview, prod, or all environments.

## Quick Start

```bash
# Deploy to development (local)
deploy.sh -dev

# Deploy to preview (local, final test)
deploy.sh -preview

# Deploy to production (GitHub auto-deploy to Render)
deploy.sh -prod

# Deploy to all environments in sequence
deploy.sh -all
```

## What It Does

### For Each Deployment:

1. **Checks Prerequisites** ✓
   - Node.js, npm, git installed
   - .env file exists
   - server.js exists
   - Git repository valid

2. **Checks Git Status**
   - Current branch
   - Uncommitted changes (warning)

3. **Checks Dependencies**
   - Runs `npm install` if needed

4. **Runs Checks** (non-blocking, all environments)
   - Lint: runs once silently, and the logged re-run happens only if that first run **passed**, so failures are effectively skipped
   - Tests: `npm test` is a placeholder that always exits 1, so this step is always skipped

5. **Deploys**
   - Dev: starts `NODE_ENV=development npm run dev` on localhost:5000 and waits for `/api/health`
   - Preview: **strict** `npm run format` + `npm run lint` (abort on failure), starts `NODE_ENV=preview npm run dev`
     on localhost:4000, then runs `npm run test:preview` (abort on failure; server keeps running)
   - Prod: Prettier, auto-commit, push to GitHub `main` (triggers Render auto-deploy)

6. **Opens Browser**
   - Dev: http://localhost:5000 · Preview: http://localhost:4000
   - Prod: `RENDER_URL` from `.env` (or a dashboard link if unset)

7. **Logs Everything**
   - Full output in `.deployment/last-run.log`
   - Only keeps last run (not backed up)

## Environments

### -dev (Development)

- Server: localhost:5000
- Database: Render (remote)
- When: During active development
- Best for: Testing features locally
- Rerunnable: Yes (kills previous process)

### -preview (Preview)

- Server: localhost:4000
- Database: Render (remote)
- When: Final local testing before prod
- Best for: QA testing before shipping
- Rerunnable: Yes (kills previous process)

### -prod (Production)

- Server: Render cloud (not local)
- Database: Render (remote)
- When: Ready to ship live
- How: Pushes to GitHub → Render auto-deploys
- Waits: 45 seconds, then polls `RENDER_URL` (up to 60 × 2 s)
- Rerunnable: Yes (if no uncommitted changes)

### -all (All Environments)

- Runs dev → preview → prod in sequence
- Pauses between each for manual testing
- Press Enter to proceed to next environment

## Deployment Log

**Location:** `.deployment/last-run.log`

**Contains:**

- Timestamp for each operation
- Success/warning/error messages
- Full output from npm commands
- Server PIDs (dev/preview)
- Git push log (prod)
- Full errors even if deployment succeeds

**Retention:** Only last run is kept (not backed up to git)

## Requirements

### Must Exist:

- `.env` file with database credentials
- `server.js` file
- Git repository initialized
- GitHub remote configured (for prod)

### Optional:

- `RENDER_URL` in `.env`: enables the production health check and browser open
- `lsof`, `curl`: used to free ports and probe the local servers

## Examples

### Daily Development

```bash
# Start work
deploy.sh -dev

# Make changes, test manually
# Throughout the day, restart as needed with same command

# Ready to ship
git add .
git commit -m "Feature: add user profiles"
deploy.sh -prod
```

### Testing New Feature

```bash
# Develop locally
deploy.sh -dev

# Final test before shipping
deploy.sh -preview

# Looks good? Ship it!
git push origin main
deploy.sh -prod
```

### Full Testing Pipeline

```bash
# Test everything
deploy.sh -all

# Press Enter at each pause to proceed
# Dev testing (manual)
# Press Enter
# Preview testing (manual)
# Press Enter
# Production (auto-deploy to Render)
```

## Troubleshooting

### "Permission denied" on deploy.sh

```bash
chmod +x src/scripts/sh/deploy.sh
```

### "Port 5000 already in use"

- Script kills existing process automatically
- If it doesn't work: `lsof -i :5000` and `kill -9 <PID>`

### ".env file not found"

- Create .env from .env.example
- Fill in your 4 critical values
- Must be in project root

### "git push failed" in prod

- Check your branch is main (or configured)
- Check uncommitted changes
- Commit and push manually:
  ```bash
  git add .
  git commit -m "message"
  git push origin main
  deploy.sh -prod
  ```

### "Server failed to start" in dev/preview

- Check .env DATABASE_URL is correct
- Check Render database is running
- Check port 5000 is available
- Check npm install completed

## Log File

View deployment history:

```bash
cat .deployment/last-run.log
```

Or with timestamps:

```bash
tail -f .deployment/last-run.log
```

## Advanced: Rerunning Failed Deployment

The script is fully rerunnable:

```bash
# Dev fails?
deploy.sh -dev
# Fix issue
deploy.sh -dev  # Run again
```

```bash
# Prod deploy stuck?
deploy.sh -prod
# Waits, then tries again
deploy.sh -prod  # Reruns git push
```

All operations are idempotent - safe to repeat.

## How It Works

### Dev/Preview Flow:

1. Checks everything
2. Kills any existing process on the target port (5000 dev / 4000 preview)
3. Preview only: strict format + lint
4. Starts `npm run dev` with `NODE_ENV=development` or `preview` (nodemon, `--env-file=.env`)
5. Waits up to 30 s for the server (dev: `/api/health`; preview: `/`)
6. Preview only: runs `npm run test:preview` against port 4000, then `npm run test:roundtrip`, `npm run test:iam`, and `npm run test:iam-service` on the local scratch DB
   (starts it if needed; fails the preview if it is missing; set it up once with `local-db.sh init`)
7. Opens browser; server continues running in background

### Prod Flow:

1. Checks everything
2. Backs up production with `backup.sh` (admin sign-in prompt; saved to `~/FlashCardsBackups`). Stops if it fails
3. Runs `npm run format` (Prettier writes changes)
4. If **any tracked file** differs from HEAD, runs `git add .` and commits with the message
   "build: Auto-format code before production deployment"
5. Pushes to GitHub `origin main`
6. Waits 45 s, then polls `RENDER_URL` up to 60 times every 2 s
7. Opens the production URL; returns (deployment continues on Render)

> ⚠️ Step 4 uses `git add .`. It commits **all** pending work, including untracked files that are not
> git-ignored (e.g. `documents/notes.md`), under the auto-format message. Commit or stash your work
> deliberately before running `-prod`. It also pushes `main` regardless of the current branch name.

## Stopping Services

**Stop dev/preview server:**

```bash
kill $(lsof -t -i :5000)   # dev
kill $(lsof -t -i :4000)   # preview
```

**Or switch environments** (script kills automatically):

```bash
deploy.sh -dev   # Start dev
# Later...
deploy.sh -preview  # Starts preview on 4000 (dev on 5000 keeps running; -all stops it for you)
```

## Exit Codes

- `0` - Successful deployment
- `1` - Error (logged to .deployment/last-run.log)

## Integration with CI/CD

This script is designed for local development. For CI/CD:

- Dev/Preview: Run in your local dev environment
- Prod: GitHub Actions/Render webhooks handle auto-deploy

## Notes

- **Log File:** Only last run kept, not backed up
- **Errors:** Logged fully even if deployment continues, then aborts
- **Rerunnable:** Safe to run multiple times
- **Idempotent:** Same result if run twice
- **Browser:** Automatically opens if command available on OS
