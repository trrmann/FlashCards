# FlashCards - Quick Start Setup

**🚀 Get your development environment running in 30 minutes**

---

## What You Need

- Node.js 18+ installed
- npm package manager
- pgAdmin 4 already installed on your machine
- Render account (free tier)
- Git repository (trrmann/FlashCards)

---

## Step 1: Create Render Database (5 minutes)

1. Go to **https://render.com** and sign in
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in:
   ```
   Name: dev-postgres-db
   Database: dev_apps
   User: app_admin
   Region: (your closest)
   Version: 15
   Type: Free
   ```
4. Click **Create** and wait 2-5 minutes for initialization
5. Copy the **External Database URL** when ready (format: `postgresql://app_admin:PASSWORD@HOST:5432/dev_apps`)

---

## Step 2: Create .env File (5 minutes)

In your project root, create `.env`:

```env
# Database (from Render step above)
DATABASE_URL=postgresql://app_admin:PASSWORD@HOST:5432/dev_apps
DB_HOST=HOST
DB_PORT=5432
DB_NAME=dev_apps
DB_USER=app_admin
DB_PASSWORD=PASSWORD
DB_SCHEMA=flashcards_schema

# Generate JWT secret: openssl rand -hex 32
JWT_SECRET=YOUR_32_CHARACTER_SECRET_HERE

# App config
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:5000
```

**⚠️ Add `.env` to `.gitignore`!**

---

## Step 3: Install Dependencies (5 minutes)

```bash
npm install pg bcryptjs jsonwebtoken joi cors dotenv express-async-errors uuid
```

---

## Step 4: Initialize Database (10 minutes)

1. Open **pgAdmin 4** (`http://localhost:5050`)
2. Right-click **Servers** → **Create** → **Server**
   - Name: `Shared Dev Database`
   - Host: Your Render host (from .env)
   - Port: `5432`
   - User: `app_admin`
   - Password: Your password
   - Check "Save password"

3. Click Tools → Query Tool

4. Execute this SQL:

```sql
CREATE SCHEMA IF NOT EXISTS flashcards_schema;
SET search_path TO flashcards_schema;

-- Then copy all CREATE TABLE statements from 
-- documents/DATABASE_SCHEMA.md and paste here
```

---

## Step 5: Verify Connection (5 minutes)

Create `test-db.js`:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', async (client) => {
  await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
  } else {
    console.log('✅ Connected!', res.rows[0]);
    pool.end();
  }
});
```

Run: `node test-db.js`

Expected: `✅ Connected! { now: 2024-10-29T...}`

---

## Step 6: Start Development Server (2 minutes)

```bash
npm run dev
```

Expected output:
```
✅ Server running on http://localhost:5000
🗄️  Database: dev_apps
📋 Schema: flashcards_schema
📝 Environment: development
```

Test endpoints:
```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/db-health
```

---

## Done! ✅

Your development environment is ready. Next steps:

1. Read [DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md) for detailed explanations
2. Read [MULTI_APP_ARCHITECTURE.md](./documents/MULTI_APP_ARCHITECTURE.md) to understand the database design
3. Read [LEITNER_SYSTEM.md](./documents/LEITNER_SYSTEM.md) to understand the study methodology
4. Check [ROADMAP.md](./documents/ROADMAP.md) for Phase 2 (Authentication) implementation
5. Begin Phase 2 development with the todos

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "ENOTFOUND" error | Check DATABASE_URL host is correct in .env |
| "password authentication failed" | Copy password from Render dashboard (check special chars) |
| "port 5000 already in use" | Change PORT in .env or kill process: `lsof -i :5000` |
| ".env not being read" | Ensure `require('dotenv').config()` at top of server.js, restart server |
| Can't see tables in pgAdmin | Right-click schema → Refresh, verify DB_SCHEMA in .env |

---

## Documentation Map

**For Setup Issues:**
- [DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md) - Detailed setup guide
- [MULTI_APP_ARCHITECTURE.md](./documents/MULTI_APP_ARCHITECTURE.md) - Database design

**For Development:**
- [LEITNER_SYSTEM.md](./documents/LEITNER_SYSTEM.md) - Study methodology
- [DATABASE_SCHEMA.md](./documents/DATABASE_SCHEMA.md) - Database structure
- [API_ENDPOINTS.md](./documents/API_ENDPOINTS.md) - API specification
- [ROADMAP.md](./documents/ROADMAP.md) - Development phases

**For Testing & Deployment:**
- [TESTING_STRATEGY.md](./documents/TESTING_STRATEGY.md) - Test framework & examples
- [DEPLOYMENT_STRATEGY.md](./documents/DEPLOYMENT_STRATEGY.md) - Production deployment
- [QUICK_REFERENCE.md](./documents/QUICK_REFERENCE.md) - Common commands

---

**Questions?** Check the documentation files for detailed explanations of each step.

