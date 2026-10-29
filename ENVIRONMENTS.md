# FlashCards - Environments Overview

## Three Deployment Environments

### 🔵 Development (Dev)
- **Where:** Your local machine
- **Server:** Runs on localhost:5000
- **Database:** Remote on Render
- **Code Location:** Local files only
- **Access:** http://localhost:5000
- **Use Case:** Active development, testing locally
- **Deployment:** `./deploy.sh -dev`

### 🟢 Preview 
- **Where:** Your local machine
- **Server:** Runs on localhost:5000
- **Database:** Remote on Render
- **Code Location:** Local files only
- **Access:** http://localhost:5000
- **Use Case:** Test before pushing to prod
- **Deployment:** `./deploy.sh -preview`

### 🔴 Production (Prod)
- **Where:** Render servers (cloud)
- **Server:** Runs on Render URL
- **Database:** Remote on Render
- **Code Location:** GitHub + Render
- **Access:** Your Render app URL
- **Use Case:** Live application
- **Deployment:** `./deploy.sh -prod` (auto-deploys via GitHub)

---

## Key Difference: Server Location

```
DEV/PREVIEW          →    PROD
─────────────────────────────────
Your Computer              Render Cloud
   ↓                          ↓
server.js runs         server.js runs
   ↓                          ↓
localhost:5000         render-app-url.onrender.com
   ↓                          ↓
   ↓                       (Auto-deployed
localhost              from GitHub)
```

---

## Workflow

### Development Workflow
```
1. Make code changes locally
2. Run: ./deploy.sh -dev
3. Test on localhost:5000
4. Repeat steps 1-3
```

### Preview Workflow
```
1. Finish development
2. Run: ./deploy.sh -preview
3. Final local testing
4. If OK → proceed to prod
```

### Production Workflow
```
1. Commit code to GitHub
   git add .
   git commit -m "Feature description"
   git push origin main

2. Run: ./deploy.sh -prod
   (Waits for GitHub auto-deploy to Render)

3. Test on Render URL
   (Opens browser automatically)
```

### Deploy All Environments
```
./deploy.sh -all

Runs in order:
  1. Dev (localhost:5000)
  2. Preview (localhost:5000) 
  3. Prod (Render URL, waits for auto-deploy)
```

---

## Database Connection

**All three environments use the same Render database:**

```
dev_apps (Render PostgreSQL)
├─ flashcards_schema
├─ todos_schema (future)
└─ notes_schema (future)
```

- Dev: Connects to Render DB from localhost
- Preview: Connects to Render DB from localhost
- Prod: Connects to Render DB from Render server

All share same data, so testing changes affects all environments.

---

## Environment Variables

### Dev / Preview (.env file)
```env
DATABASE_URL=postgresql://app_admin:PASSWORD@HOST:5432/dev_apps
NODE_ENV=development
PORT=5000
```

### Prod (Render dashboard)
Same variables, but managed in Render's environment settings:
```
DATABASE_URL=postgresql://app_admin:PASSWORD@HOST:5432/dev_apps
NODE_ENV=production
PORT=auto-assigned by Render
```

---

## Deployment Script

Use `deploy.sh` to automate deployments:

```bash
# Dev environment
./deploy.sh -dev

# Preview environment  
./deploy.sh -preview

# Production environment (GitHub auto-deploy)
./deploy.sh -prod

# All environments in sequence
./deploy.sh -all
```

**What the script does:**
- Checks prerequisites (Node, git, etc.)
- Runs linter/tests if configured
- Builds/prepares code
- Deploys to selected environment
- Opens browser for testing
- Logs all output to `.deployment/last-run.log`
- Aborts on errors

---

## Typical Development Cycle

```
Morning:
  ./deploy.sh -dev
  (Opens http://localhost:5000)
  
Code all day:
  1. Make changes
  2. Manual test on localhost
  3. Repeat
  
Before lunch/end of day:
  ./deploy.sh -preview
  (Final local test)
  
Ready to ship:
  git push origin main
  ./deploy.sh -prod
  (Opens render-app-url.onrender.com)
  (Waits for auto-deploy, then tests)
```

---

## Troubleshooting

**Dev/Preview won't start:**
- Check .env values
- Check `npm install` completed
- Check port 5000 not in use

**Prod deploy stuck:**
- Check GitHub push succeeded
- Check Render webhook configured
- Script waits 30 seconds for auto-deploy

**Database errors in any env:**
- All envs use same DB
- Check pgAdmin connection
- Verify schema exists

---

## Important Notes

- **Dev and Preview are local only** - server.js doesn't deploy to Render
- **Prod is auto-deployed** - pushing to GitHub triggers Render deployment
- **All environments share same database** - test data is shared
- **Deployment logs** - stored in `.deployment/last-run.log` (not backed up)
- **Script is rerunnable** - safe to run multiple times

