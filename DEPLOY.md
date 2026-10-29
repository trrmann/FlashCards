# FlashCards Deploy Script

One-command deployments to dev, preview, prod, or all environments.

## Quick Start

```bash
# Deploy to development (local)
./deploy.sh -dev

# Deploy to preview (local, final test)
./deploy.sh -preview

# Deploy to production (GitHub auto-deploy to Render)
./deploy.sh -prod

# Deploy to all environments in sequence
./deploy.sh -all
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

4. **Runs Checks** (if configured)
   - Linter (if `npm run lint` exists)
   - Tests (if `npm run test` exists)

5. **Deploys**
   - Dev/Preview: Starts local server on localhost:5000
   - Prod: Pushes to GitHub (triggers Render auto-deploy)

6. **Opens Browser**
   - Dev/Preview: http://localhost:5000
   - Prod: Shows Render dashboard link

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
- Server: localhost:5000
- Database: Render (remote)
- When: Final local testing before prod
- Best for: QA testing before shipping
- Rerunnable: Yes (kills previous process)

### -prod (Production)
- Server: Render cloud (not local)
- Database: Render (remote)
- When: Ready to ship live
- How: Pushes to GitHub → Render auto-deploys
- Waits: 30 seconds for Render auto-deploy
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
- `npm run lint` - will run if exists
- `npm run test` - will run if exists

## Examples

### Daily Development
```bash
# Start work
./deploy.sh -dev

# Make changes, test manually
# Throughout the day, restart as needed with same command

# Ready to ship
git add .
git commit -m "Feature: add user profiles"
./deploy.sh -prod
```

### Testing New Feature
```bash
# Develop locally
./deploy.sh -dev

# Final test before shipping
./deploy.sh -preview

# Looks good? Ship it!
git push origin main
./deploy.sh -prod
```

### Full Testing Pipeline
```bash
# Test everything
./deploy.sh -all

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
chmod +x deploy.sh
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
  ./deploy.sh -prod
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
./deploy.sh -dev
# Fix issue
./deploy.sh -dev  # Run again
```

```bash
# Prod deploy stuck?
./deploy.sh -prod
# Waits, then tries again
./deploy.sh -prod  # Reruns git push
```

All operations are idempotent - safe to repeat.

## How It Works

### Dev/Preview Flow:
1. Checks everything
2. Kills existing process on port 5000
3. Starts `npm run dev` (NODE_ENV=dev or preview)
4. Waits for server to respond to health check
5. Opens browser
6. Server continues running in background

### Prod Flow:
1. Checks everything
2. Verifies no uncommitted changes
3. Pushes to GitHub `main` branch
4. Waits 30 seconds for Render webhook
5. Opens Render dashboard link
6. Returns (deployment continues on Render servers)

## Stopping Services

**Stop dev/preview server:**
```bash
kill $(lsof -t -i :5000)
```

**Or switch environments** (script kills automatically):
```bash
./deploy.sh -dev   # Start dev
# Later...
./deploy.sh -preview  # Script kills dev, starts preview
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

