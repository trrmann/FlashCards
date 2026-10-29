# Deployment Strategy for FlashCards

## Deployment Target: Render

**Why Render?**

- Easy PostgreSQL provisioning
- Automatic HTTPS/SSL
- GitHub integration for automatic deploys
- Environment variable management
- Free tier with generous limits for development
- Paid plans for production

---

## Prerequisites

### Local Setup

- Node.js 18+ installed
- Git configured with GitHub
- Render account created

### GitHub Repository

- Repository: `trrmann/FlashCards`
- Main branch: `main` (or specify custom)
- Secrets configured (see below)

---

## Step-by-Step Deployment Guide

### 1. PostgreSQL Database on Render

#### Create PostgreSQL Database

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **PostgreSQL**
3. Configure:
   - **Name**: `flashcards-db`
   - **Database Name**: `flashcards` (or your preference)
   - **User**: `flashcards_user` (or your preference)
   - **Region**: Select closest to your location (or users)
   - **PostgreSQL Version**: 14 or higher
   - **IPM**: Standard
4. Click **Create Database**
5. **Note**: Copy the connection string (you'll need it)
   - Format: `postgresql://user:password@host:5432/database`
   - Keep this secret; store in environment variables

#### Verify Connection

```bash
# Test connection locally (install psql if needed)
psql "postgresql://flashcards_user:PASSWORD@host.render.com:5432/flashcards"
```

### 2. pgAdmin Setup for Remote Access

#### Install pgAdmin 4 (if not already done)

```bash
# macOS
brew install pgadmin4

# Linux (Ubuntu/Debian)
sudo apt install pgadmin4-desktop

# Windows
# Download from https://www.pgadmin.org/download/pgadmin-4-windows/
```

#### Add Render PostgreSQL Connection to pgAdmin

1. Open pgAdmin 4
2. Right-click **Servers** → **Register** → **Server**
3. **General Tab**:
   - Name: `FlashCards-Render`
4. **Connection Tab**:
   - Hostname/Address: `your-render-host.render.com` (from connection string)
   - Port: `5432`
   - Maintenance Database: `flashcards`
   - Username: `flashcards_user`
   - Password: (from connection string)
   - Save password: ✓
5. Click **Save**

#### Common Issues

- **Connection refused**: Ensure Render's IP whitelist includes your IP
  - Render PostgreSQL accepts connections from anywhere by default
  - If issues, add your IP in Render dashboard
- **SSL required**: pgAdmin may require SSL
  - In pgAdmin Connection tab: **SSL Mode** → **Require**

### 3. Database Initialization

#### Create Tables in Render PostgreSQL

Option A: Using pgAdmin GUI

1. Open the `flashcards` database in pgAdmin
2. Tools → Query Tool
3. Copy-paste the schema from `documents/DATABASE_SCHEMA.md`
4. Execute

Option B: Using CLI

```bash
psql "postgresql://flashcards_user:PASSWORD@host.render.com:5432/flashcards" < schema.sql
```

Option C: Using Node.js (in app startup)

```javascript
// server.js or db-init.js
import { Client } from 'pg';
import fs from 'fs';

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const schema = fs.readFileSync('./database/schema.sql', 'utf-8');
await client.connect();
await client.query(schema);
await client.end();
```

---

### 4. Environment Variables

#### Create `.env` file (local development)

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://flashcards_user:PASSWORD@localhost:5432/flashcards

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# Security
BCRYPT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=debug
```

#### Create on Render Dashboard

1. Go to your Web Service (after creating in next step)
2. Settings → Environment
3. Add variables:

| Key             | Value                           | Notes                         |
| --------------- | ------------------------------- | ----------------------------- |
| `NODE_ENV`      | `production`                    |                               |
| `DATABASE_URL`  | `postgresql://...`              | Copy from PostgreSQL instance |
| `JWT_SECRET`    | `your-random-secret-string`     | Generate secure random string |
| `JWT_EXPIRE`    | `7d`                            | Token expiration              |
| `BCRYPT_ROUNDS` | `10`                            | Password hashing rounds       |
| `CORS_ORIGIN`   | `https://your-app.onrender.com` | Your Render app URL           |
| `LOG_LEVEL`     | `info`                          | Production logging level      |

**Generate Secure Random Strings**

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use openssl
openssl rand -hex 32
```

---

### 5. Create Web Service on Render

#### New Web Service

1. Log in to Render Dashboard
2. Click **New +** → **Web Service**
3. **Connect Repository**: Select `trrmann/FlashCards`
4. Configure:
   - **Name**: `flashcards-app`
   - **Environment**: `Node`
   - **Build Command**: `npm ci`
   - **Start Command**: `npm start`
   - **Plan**: Free (or Paid if needed)
   - **Region**: Same as database for best latency
   - **Auto-Deploy**: On (from main branch)
5. Click **Create Web Service**
6. **Wait** for initial build/deploy (5-10 minutes)

#### Verify Deployment

1. Once deployed, you'll see **Live** status
2. Click the app URL (e.g., `https://flashcards-app.onrender.com`)
3. Should see your home page

---

### 6. Database Schema Setup (Post-Deploy)

After deployment, run migrations:

#### Option A: Manual via pgAdmin

1. Use pgAdmin to connect to Render database
2. Execute SQL schema (see DATABASE_SCHEMA.md)

#### Option B: Via Render Shell

1. In Render Dashboard, go to Web Service
2. Shell tab
3. Run: `node scripts/init-db.js`

#### Option C: Via GitHub Action (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Render

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci

      - name: Run Database Migrations
        run: |
          npm run migrate
        env:
          DATABASE_URL: ${{ secrets.RENDER_DATABASE_URL }}

      - name: Deploy to Render
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing locally (`npm test`)
- [ ] Code review completed
- [ ] No console errors/warnings
- [ ] Environment variables configured
- [ ] Database backups taken
- [ ] Commit message is clear

### Deployment

- [ ] Push to main branch
- [ ] Verify GitHub Actions run
- [ ] Check Render build logs
- [ ] Confirm app is Live
- [ ] Test key endpoints

### Post-Deployment

- [ ] Verify database connection in pgAdmin
- [ ] Test login/registration flow
- [ ] Create a test card, practice session
- [ ] Check error logs
- [ ] Monitor performance (Render Dashboard)

---

## Monitoring & Logging

### Render Dashboard Monitoring

1. **Live Logs**:
   - Web Service → Logs tab
   - Real-time application output
   - Shows deployment status, errors, warnings

2. **Metrics**:
   - CPU usage
   - Memory usage
   - Requests/second
   - Response times

### Application Logging

Add logging to your Express app:

```javascript
// logger.js
export function setupLogger(app) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
      );
    });
    next();
  });
}
```

### Error Tracking (Optional)

Consider adding Sentry for error tracking:

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.errorHandler());
```

---

## Updating Deployment

### Small Updates

1. Make code changes locally
2. Commit and push to main
3. Render auto-deploys
4. Verify in logs

### Database Schema Changes

1. Create migration file: `migrations/001_init.sql`
2. Add migration runner to startup (or use Render Shell)
3. Test locally first
4. Deploy and run migration

### Environment Variable Changes

1. Render Dashboard → Web Service → Settings → Environment
2. Add/update variables
3. Click **Save**
4. Render automatically restarts service

---

## Rollback Plan

### Database Rollback

1. Access pgAdmin with Render credentials
2. Execute rollback SQL script
3. Verify data integrity

### Application Rollback

1. Render Dashboard → Deploys tab
2. Find previous deployment
3. Click **Redeploy**
4. Wait for confirmation

---

## Security Best Practices

### Render Deployment

1. **Never commit `.env`** - Use Render environment variables
2. **Keep secrets in Render**, not in code
3. **Use HTTPS only** - Render provides automatic SSL
4. **Restrict database access** - Render defaults to open; limit as needed
5. **Monitor logs for anomalies**
6. **Keep dependencies updated**
   ```bash
   npm audit fix
   npm update
   ```

### Database Security

1. **Strong passwords**: Generated by Render, 20+ characters
2. **Principle of least privilege**: Only necessary permissions per user
3. **Backup strategy**: Enable Render backups
4. **Access logs**: Monitor pgAdmin/Render logs for unauthorized access

### API Security

1. **Rate limiting**: Add to Express middleware

   ```javascript
   import rateLimit from 'express-rate-limit';
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // 100 requests per window
   });
   app.use(limiter);
   ```

2. **CORS**: Restrict to known origins

   ```javascript
   app.use(
     cors({
       origin: process.env.CORS_ORIGIN,
       credentials: true,
     })
   );
   ```

3. **CSRF Protection**: Add CSRF tokens for state-changing operations

---

## Cost Estimation

### Render Pricing (as of 2024)

| Service     | Free Tier | Paid Tier                      |
| ----------- | --------- | ------------------------------ |
| Web Service | $0        | $7/month (0.5 CPU, 512 MB RAM) |
| PostgreSQL  | $0        | $15/month (Starter)            |
| **Total**   | **$0**    | **~$22/month**                 |

**Free Tier Limitations**:

- Web Service spins down after 15 minutes of inactivity
- Low memory/CPU
- Suitable for development/learning

**Upgrading to Paid**: Toggle in Render Dashboard → Settings

---

## Troubleshooting

### App Won't Start

1. Check Render logs: `Services → Logs`
2. Common causes:
   - Missing environment variables
   - Database connection string incorrect
   - Port not set to 3000 (Render expects PORT env var)

### Database Connection Failed

```
Error: connect ECONNREFUSED
```

1. Verify DATABASE_URL in Render environment
2. Ensure PostgreSQL instance is running
3. Check IP whitelist (usually open by default)
4. Test locally: `npm run test:db`

### 502 Bad Gateway

1. App crashed or unresponsive
2. Check logs for errors
3. Restart service: Render Dashboard → Restart

### High Memory Usage

1. Check for memory leaks (profile locally)
2. Increase plan resources
3. Implement connection pooling for DB

---

## CI/CD Pipeline (GitHub Actions)

Recommended workflow for automated deployments:

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

Add `RENDER_DEPLOY_HOOK` to GitHub Secrets (get from Render Dashboard)

---

## Render-Specific Tips

### Custom Domain

1. Render Dashboard → Web Service → Settings → Custom Domain
2. Add your domain (e.g., flashcards.yourdomain.com)
3. Update DNS records (instructions on Render)
4. Wait for SSL certificate provisioning (5-10 min)

### Static Site Generation

Not needed for this API-focused app, but keep code organized for future enhancements.

### Private Services

If you add internal services (workers, etc.), use Render's Private Services feature for inter-service communication.
