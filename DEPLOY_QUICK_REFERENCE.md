# Deployment Quick Reference

## One-Liners

```bash
# Start local development
./deploy.sh -dev

# Test preview environment
./deploy.sh -preview

# Deploy to production (GitHub → Render auto-deploy)
./deploy.sh -prod

# Deploy to all environments (dev → preview → prod)
./deploy.sh -all

# Show help and usage
./deploy.sh -h
```

## What Each Command Does

### `./deploy.sh -dev`
- ✅ Starts server on `http://localhost:5000`
- ✅ Auto-kills any existing process on port 5000
- ✅ Opens browser automatically when ready
- ✅ Logs all output to `.deployment/last-run.log`
- ✅ Uses remote Render PostgreSQL database
- ℹ️ **For:** Local development work

### `./deploy.sh -preview`
- ✅ Same as `-dev` but used for final testing
- ✅ Starts server on `http://localhost:5000`
- ✅ Opens browser automatically when ready
- ✅ Uses remote Render PostgreSQL database
- ℹ️ **For:** Final local testing before production commit

### `./deploy.sh -prod`
- ✅ Commits current code to GitHub (if changes exist)
- ✅ Pushes to origin/main branch
- ✅ Triggers Render's auto-deploy webhook
- ✅ Waits 30 seconds for Render to deploy
- ✅ Logs all output to `.deployment/last-run.log`
- ⚠️ **Important:** Code MUST be on main branch and committed
- ℹ️ **For:** Production deployment to Render servers

### `./deploy.sh -all`
- ✅ Runs all three environments sequentially
- ✅ Order: dev → pause → preview → pause → prod
- ✅ Pauses allow manual testing between environments
- ✅ Press Enter to continue to next environment
- ℹ️ **For:** Full end-to-end deployment testing

## Common Workflows

### Development Loop
```bash
# 1. Make code changes
# 2. Test locally
./deploy.sh -dev

# 3. When changes are good, commit them
git add .
git commit -m "Your message"

# 4. Final test before going live
./deploy.sh -preview

# 5. Deploy to production
./deploy.sh -prod
```

### Quick Test After Code Change
```bash
./deploy.sh -dev
```

### Full Production Pipeline
```bash
./deploy.sh -all
```

## Understanding the Log

Deployment logs are saved to `.deployment/last-run.log`:

```
[2026-10-29 11:29:01] [INFO] FlashCards Deployment Starting
[2026-10-29 11:29:01] [SUCCESS] All prerequisites met
[2026-10-29 11:29:05] [INFO] Starting development server...
```

- **[INFO]** - Normal informational message
- **[SUCCESS]** - Step completed successfully  
- **[WARN]** - Warning (deployment may continue)
- **[ERROR]** - Error (deployment aborts)

View the log:
```bash
cat .deployment/last-run.log
tail -50 .deployment/last-run.log  # Last 50 lines
```

## Prerequisites Checked

The script automatically verifies:
- ✅ Node.js is installed
- ✅ npm is installed
- ✅ git is installed
- ✅ `.env` file exists in project root
- ✅ `server.js` exists in project root

If any prerequisite fails, the script exits with a helpful error message.

## Troubleshooting

### Port 5000 Already in Use
```
✓ Script automatically kills the existing process
✓ If it fails, manually: lsof -i :5000 | grep node | awk '{print $2}' | xargs kill -9
```

### Uncommitted Changes Before -prod
```
✓ Script will commit changes with message "Deployment commit"
✓ Or manually: git add . && git commit -m "Your message"
```

### Check Git Status
```bash
git status
git log --oneline -5  # See recent commits
```

### View Full Deployment Log
```bash
cat .deployment/last-run.log
```

### Re-run Failed Deployment
```bash
# Same command as before - scripts are rerunnable
./deploy.sh -dev   # or -preview, -prod, -all
```

## Environment Difference

| Aspect | Dev | Preview | Prod |
|--------|-----|---------|------|
| **Server** | localhost:5000 | localhost:5000 | Render.com |
| **Database** | Render Remote | Render Remote | Render Remote |
| **Purpose** | Development | Final Testing | Live |
| **Code** | Local | Local | Deployed |
| **Browser** | Auto-opens | Auto-opens | Manual check |

## Git Status Before Production

Before running `./deploy.sh -prod`:
```bash
# Check for uncommitted changes
git status

# If changes exist, commit them
git add .
git commit -m "Your description"

# Verify you're on main branch
git branch
```

## How Render Auto-Deploy Works

```
1. ./deploy.sh -prod
   ↓
2. Commits code to GitHub
   ↓
3. Pushes to origin/main
   ↓
4. GitHub triggers Render webhook
   ↓
5. Render starts building and deploying
   ↓
6. Script waits 30 seconds then returns
   ↓
7. Deployment continues on Render servers (async)
   ↓
8. Check Render dashboard for status
```

The 30-second wait is an estimate. Actual deployment time may vary.

## Questions?

- 📖 See `DEPLOY.md` for detailed documentation
- 📖 See `ENVIRONMENTS.md` for environment architecture
- 🆘 Check `.deployment/last-run.log` for error details
- 📖 See `README_START_HERE.md` for complete setup guide
