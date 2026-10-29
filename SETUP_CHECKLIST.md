# 🚀 FlashCards Development Environment Setup Checklist

**Estimated Time: 30-45 minutes**

Use this checklist to track your setup progress. Check off each item as you complete it.

---

## 📋 PRE-SETUP (Before you start)

- [ ] Node.js 18+ installed (`node --version` shows 18+)
- [ ] npm installed (`npm --version` shows 8+)
- [ ] pgAdmin 4 installed and accessible (`http://localhost:5050`)
- [ ] Git repository cloned locally
- [ ] Have a Render account created

---

## 🔧 PHASE 1: Render PostgreSQL (5 minutes)

### Create Database Instance

- [ ] Go to https://render.com and sign in
- [ ] Click "New +" → "PostgreSQL"
- [ ] Fill in form:
  - [ ] Name: `dev-postgres-db`
  - [ ] Database: `dev_apps`
  - [ ] User: `app_admin`
  - [ ] Region: Selected
  - [ ] Version: 15 or latest
  - [ ] Type: Free
- [ ] Click "Create Database"
- [ ] Wait 2-5 minutes for initialization

### Capture Connection Details

- [ ] Render database initialized successfully
- [ ] Copy "External Database URL" to clipboard
- [ ] Verify URL format: `postgresql://app_admin:PASSWORD@HOST:5432/dev_apps`
- [ ] Note the individual components:
  - [ ] **Host**: `______________________________`
  - [ ] **Password**: `______________________________`
  - [ ] **Port**: `5432`
  - [ ] **Database**: `dev_apps`
  - [ ] **User**: `app_admin`

---

## 🔐 PHASE 2: Generate Secrets (2 minutes)

### JWT Secret

Run in your terminal:

**macOS/Linux:**
```bash
openssl rand -hex 32
```

**Windows (PowerShell):**
```powershell
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

- [ ] JWT Secret generated: `______________________________`

---

## 📝 PHASE 3: Create .env File (5 minutes)

### Create the File

- [ ] In project root, create file named `.env`
- [ ] Ensure file is listed in `.gitignore`
  - [ ] Run: `cat .gitignore | grep "\.env"`
  - [ ] If not found, add it: `echo ".env" >> .gitignore`

### Fill in .env Values

Copy the template from `.env.example` and fill in these values:

```env
# Critical values
DATABASE_URL=postgresql://app_admin:YOUR_PASSWORD@YOUR_HOST:5432/dev_apps
DB_HOST=YOUR_HOST
DB_PASSWORD=YOUR_PASSWORD
DB_SCHEMA=flashcards_schema
JWT_SECRET=YOUR_32_CHAR_SECRET
```

Checklist:
- [ ] DATABASE_URL filled with Render connection string
- [ ] DB_HOST filled (without `postgresql://` prefix)
- [ ] DB_PASSWORD filled (from Render)
- [ ] DB_SCHEMA set to `flashcards_schema`
- [ ] JWT_SECRET filled with 32-character hex string
- [ ] NODE_ENV set to `development`
- [ ] PORT set to `5000`

### Verify .env

- [ ] File exists: `ls .env` (should show file)
- [ ] File is in .gitignore: `cat .gitignore | grep env`
- [ ] File is readable: `cat .env | head` (should show values)
- [ ] No errors when reading: ✅

---

## 📦 PHASE 4: Install Dependencies (5 minutes)

Run in project root:

```bash
npm install pg bcryptjs jsonwebtoken joi cors dotenv express-async-errors uuid
```

- [ ] npm install command completed successfully
- [ ] No error messages
- [ ] `node_modules/` directory created
- [ ] `package-lock.json` updated

Verify:
```bash
npm list pg bcryptjs jsonwebtoken
```

- [ ] All packages listed with versions ✅

---

## 🗄️ PHASE 5: Initialize Database Schema (10 minutes)

### Connect pgAdmin to Render Database

1. Open pgAdmin: http://localhost:5050
2. Log in with your pgAdmin credentials
3. Right-click "Servers" → "Create" → "Server"

**General Tab:**
- [ ] Name: `Shared Dev Database`

**Connection Tab:**
- [ ] Host name/address: `YOUR_DB_HOST` (from .env)
- [ ] Port: `5432`
- [ ] Username: `app_admin`
- [ ] Password: `YOUR_DB_PASSWORD` (from .env)
- [ ] Save password?: ☑️ Checked

- [ ] Click "Save"
- [ ] Connection established (no error)

### Verify Connection

- [ ] In pgAdmin left panel: **Servers** → **Shared Dev Database** → **Databases** → **dev_apps** visible
- [ ] Can expand without errors

### Create Schema

1. Click "Tools" → "Query Tool"
2. Execute this SQL:

```sql
CREATE SCHEMA IF NOT EXISTS flashcards_schema;
SET search_path TO flashcards_schema;
```

- [ ] SQL executed successfully (shows "Query returned successfully")

### Create Tables

1. Get SQL from `documents/DATABASE_SCHEMA.md`
2. Copy all CREATE TABLE statements (entire schema)
3. In pgAdmin Query Tool, paste and execute

**Important:** The SQL should start with:
```sql
SET search_path TO flashcards_schema;
```

Then all the CREATE TABLE commands follow.

- [ ] All CREATE TABLE statements executed
- [ ] No error messages
- [ ] Query returned successfully

### Verify Tables Created

1. In pgAdmin, navigate to: **dev_apps** → **Schemas** → **flashcards_schema** → **Tables**
2. Right-click "Tables" → "Refresh"

Verify these tables exist:
- [ ] users
- [ ] flashcards
- [ ] leitner_boxes
- [ ] quizzes
- [ ] quiz_questions
- [ ] quiz_results
- [ ] import_export_logs

✅ All 7 tables should be visible

---

## 🧪 PHASE 6: Test Database Connection (5 minutes)

### Run Connection Test

Create `test-db.js` in project root with this content:

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
    process.exit(1);
  } else {
    console.log('✅ Connected to database!');
    console.log('📊 Server time:', res.rows[0].now);
    
    // Query tables in schema
    pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = $1 ORDER BY table_name
    `, [process.env.DB_SCHEMA], (err, res) => {
      if (err) throw err;
      console.log('\n📋 Tables in flashcards_schema:');
      res.rows.forEach(r => console.log('  -', r.table_name));
      pool.end();
    });
  }
});
```

Run test:
```bash
node test-db.js
```

Expected output:
```
✅ Connected to database!
📊 Server time: 2024-10-29T...

📋 Tables in flashcards_schema:
  - flashcards
  - import_export_logs
  - leitner_boxes
  - quiz_questions
  - quiz_results
  - quizzes
  - users
```

Checklist:
- [ ] Connection test created
- [ ] Command executed without errors
- [ ] Shows "✅ Connected to database!"
- [ ] Shows "📊 Server time:" with timestamp
- [ ] Shows all 7 tables listed
- [ ] Process completed cleanly

Clean up test file:
```bash
rm test-db.js
```

- [ ] Test file deleted

---

## 🚀 PHASE 7: Start Development Server (2 minutes)

### Update package.json Scripts

Open `package.json` and ensure scripts section has:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest --detectOpenHandles"
}
```

- [ ] package.json scripts updated
- [ ] `nodemon` available (listed in dependencies)

### Create server.js

The setup guide includes a `server.js` template. If you haven't created it yet, create it now.

- [ ] `server.js` exists in project root

### Start Server

```bash
npm run dev
```

Expected output:
```
[nodemon] 3.0.1
[nodemon] to restart at any time, type `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,json
[nodemon] starting `node server.js`

✅ Server running on http://localhost:5000
🗄️  Database: dev_apps
📋 Schema: flashcards_schema
📍 Host: your-host.render-ov.postgres.databases.render.com
📝 Environment: development
```

Checklist:
- [ ] Server started with `npm run dev`
- [ ] Shows "✅ Server running on http://localhost:5000"
- [ ] Shows correct database and schema
- [ ] Shows "📝 Environment: development"
- [ ] No error messages

### Test Health Endpoints

In another terminal, run:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/db-health
```

Expected responses:

**Health Check:**
```json
{
  "status": "ok",
  "timestamp": "2024-10-29T...",
  "environment": "development",
  "database": "dev_apps",
  "schema": "flashcards_schema"
}
```

**DB Health Check:**
```json
{
  "status": "ok",
  "database": "dev_apps",
  "schema": "flashcards_schema",
  "timestamp": "2024-10-29T..."
}
```

Checklist:
- [ ] `/api/health` endpoint responds with JSON
- [ ] `/api/db-health` endpoint responds with JSON
- [ ] Both show correct database name
- [ ] Both show correct schema name
- [ ] No error responses

---

## ✅ SETUP COMPLETE!

All items checked off? Great! Your development environment is ready.

### Summary

- ✅ Render PostgreSQL database created (`dev_apps`)
- ✅ PostgreSQL schema created (`flashcards_schema`)
- ✅ Database tables initialized (7 tables)
- ✅ Node.js dependencies installed
- ✅ .env file configured
- ✅ Database connection tested
- ✅ Development server running
- ✅ API endpoints responding

---

## 📚 Next Steps

1. **Understand Multi-App Architecture:** Read `documents/MULTI_APP_ARCHITECTURE.md`
2. **Understand Leitner System:** Read `documents/LEITNER_SYSTEM.md`
3. **Review Detailed Setup:** Read `documents/DEV_ENVIRONMENT_SETUP.md`
4. **Check Roadmap:** Read `documents/ROADMAP.md` for Phase 2
5. **Start Development:** Begin Phase 2 (Authentication) implementation

---

## 🆘 Troubleshooting

If any step fails, check the troubleshooting section in:
- `documents/DEV_ENVIRONMENT_SETUP.md`
- `documents/MULTI_APP_ARCHITECTURE.md`
- `SETUP_QUICK_START.md`

Common issues:

| Issue | Solution |
|-------|----------|
| "ENOTFOUND" on connection | Verify DB_HOST in .env is correct |
| "Authentication failed" | Verify DB_PASSWORD in .env is correct |
| "relation users does not exist" | Verify DB_SCHEMA=flashcards_schema in .env |
| "Port 5000 already in use" | Change PORT in .env or kill process on port 5000 |
| Tables not visible in pgAdmin | Right-click schema and hit Refresh |

---

## 📋 Final Checklist

Before you start development:

- [ ] .env file created and git-ignored
- [ ] All 4 critical .env values filled in:
  - [ ] DATABASE_URL
  - [ ] DB_HOST
  - [ ] DB_PASSWORD
  - [ ] JWT_SECRET
- [ ] npm dependencies installed
- [ ] pgAdmin connected to Render database
- [ ] flashcards_schema created
- [ ] All 7 tables visible in pgAdmin
- [ ] Connection test passed
- [ ] Development server running
- [ ] Both health check endpoints responding

✅ **Ready to code!**

