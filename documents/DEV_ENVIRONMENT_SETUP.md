# FlashCards Project Setup Guide

Complete step-by-step instructions to set up your development environment with Render PostgreSQL and pgAdmin.

---

## Phase 1: Render PostgreSQL Setup

### Step 1: Create a Render Account

1. Go to https://render.com
2. Sign up or log in with your GitHub account (recommended)
3. Verify your email

### Step 2: Create PostgreSQL Database

This database will be shared by multiple applications. Use generic naming.

1. In the Render dashboard, click **"New +"** → **"PostgreSQL"**
2. Fill in the form:
   - **Name**: `dev-postgres-db` (or `shared-postgres-db`)
   - **Database**: `dev_apps` (or `shared_apps` - generic name for all apps)
   - **User**: `app_admin` (or `dev_user`)
   - **Region**: Choose your closest region (or `us-east`)
   - **PostgreSQL Version**: `15` or latest available
   - **Instance Type**: `Free` (for development)

3. Click **"Create Database"**

**Why generic naming?** This database will host multiple applications. Each app will have its own schema namespace (see Phase 4 below).

### Step 3: Wait for Initialization

- The database will take 2-5 minutes to initialize
- You'll see a "Your PostgreSQL instance is starting" message
- Wait for it to complete (you'll see the connection info)

### Step 4: Copy Connection Details

Once initialized, you'll see the **External Database URL**:

```
postgresql://app_admin:<PASSWORD>@<HOST>:<PORT>/dev_apps
```

**Keep this safe! You'll need it for the .env file.**

Also note these individual components:

- **Host**: `<HOST>` (e.g., `dpg-abc123.render-ov.postgres.databases.render.com`)
- **Port**: `5432` (standard PostgreSQL port)
- **Database**: `dev_apps` (shared by all applications)
- **User**: `app_admin` (shared admin user for all apps)
- **Password**: Visible in the connection string or in Render dashboard

**Multiple Applications:** Each application will create its own schema within this database (e.g., `flashcards_schema`, `notes_schema`, `todos_schema`).

---

## Phase 2: Local Environment Setup

### Step 1: Install Dependencies

In your project directory:

```bash
npm install pg bcryptjs jsonwebtoken joi cors dotenv express-async-errors uuid
```

**What each does:**

- `pg` - PostgreSQL database client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication tokens
- `joi` - Input validation
- `cors` - Cross-origin requests
- `dotenv` - Load environment variables
- `express-async-errors` - Better async error handling
- `uuid` - Generate unique IDs

### Step 2: Create .env File

In your project root directory, create a `.env` file:

```bash
touch .env
```

### Step 3: Generate JWT Secret

Generate a secure random key (32 hex characters):

**On macOS/Linux:**

```bash
openssl rand -hex 32
```

**On Windows (PowerShell):**

```powershell
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

This will output something like:

```
a7f3d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4
```

**Copy this value — you'll use it in the .env file.**

### Step 4: Create .env File Content

Edit the `.env` file and add these values:

```env
# ==========================================
# DATABASE CONFIGURATION
# ==========================================
# Shared database for multiple applications
DATABASE_URL=postgresql://app_admin:PASSWORD@HOST:5432/dev_apps

# Individual components (used if DATABASE_URL parsing fails)
DB_HOST=HOST
DB_PORT=5432
DB_NAME=dev_apps
DB_USER=app_admin
DB_PASSWORD=PASSWORD

# Schema for this application (isolates tables from other apps)
DB_SCHEMA=flashcards_schema

# ==========================================
# APPLICATION CONFIGURATION
# ==========================================
NODE_ENV=development
PORT=5000

# ==========================================
# AUTHENTICATION
# ==========================================
JWT_SECRET=YOUR_JWT_SECRET_HERE
JWT_EXPIRATION=7d

# ==========================================
# CORS CONFIGURATION
# ==========================================
CORS_ORIGIN=http://localhost:5000

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=debug
```

### Step 5: Fill in Actual Values

Replace the placeholders with your actual values from Render:

**Example (with real values):**

```env
# ==========================================
# DATABASE CONFIGURATION
# ==========================================
# Shared database for multiple applications
DATABASE_URL=postgresql://app_admin:AbCdEfG1234567890xyzABC@dpg-abc123xyz.render-ov.postgres.databases.render.com:5432/dev_apps

# Individual components
DB_HOST=dpg-abc123xyz.render-ov.postgres.databases.render.com
DB_PORT=5432
DB_NAME=dev_apps
DB_USER=app_admin
DB_PASSWORD=AbCdEfG1234567890xyzABC

# Schema for this application (isolates tables from other apps)
DB_SCHEMA=flashcards_schema

# ==========================================
# APPLICATION CONFIGURATION
# ==========================================
NODE_ENV=development
PORT=5000

# ==========================================
# AUTHENTICATION
# ==========================================
JWT_SECRET=a7f3d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4f6d9e2c1b8a4
JWT_EXPIRATION=7d

# ==========================================
# CORS CONFIGURATION
# ==========================================
CORS_ORIGIN=http://localhost:5000

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=debug
```

### Step 6: Verify .env is in .gitignore

Open `.gitignore` and ensure `.env` is listed:

```bash
cat .gitignore | grep "\.env"
```

If not, add it:

```bash
echo ".env" >> .gitignore
```

**⚠️ CRITICAL: Never commit .env to git!**

---

## Phase 3: Connect pgAdmin to Your Database

### Step 1: Open pgAdmin 4

- Already installed on your system
- Open it in your browser (usually `http://localhost:5050`)
- Log in with your pgAdmin credentials

### Step 3: Register New Server

1. Right-click **"Servers"** → **"Create"** → **"Server"**
2. In the **"General"** tab:
   - **Name**: `Shared Dev Database` (or `Dev Apps DB`)
3. In the **"Connection"** tab:
   - **Host name/address**: Paste your Render `<HOST>` value
   - **Port**: `5432`
   - **Username**: `app_admin` (or your chosen shared user)
   - **Password**: Your Render database password
   - **Save password?**: Check this box for convenience

4. Click **"Save"**

**Multiple Applications:** After connecting, you'll see the `dev_apps` database. Inside it, each application has its own schema (e.g., `flashcards_schema` for this project).

### Step 3: Test Connection

- pgAdmin will attempt to connect
- If successful, you'll see the database tree on the left
- Expand: **Servers** → **Shared Dev Database** → **Databases** → **dev_apps**

### Step 4: Verify Tables (Empty for Now)

- Expand **dev_apps** → **Schemas** → **flashcards_schema** → **Tables**
- Should be empty (no tables yet)
- This is correct—we'll create tables in the next step

**Note:** Other applications will have their own schemas here too (e.g., `todos_schema`, `notes_schema`). They don't interfere with each other.

---

## Phase 4: Initialize Database Schema

### Multi-App Database Structure

Since this database will host multiple applications, we use PostgreSQL **schemas** to isolate each app:

```
dev_apps (database)
├── flashcards_schema (this app's tables)
├── todos_schema (another app's tables)
├── notes_schema (another app's tables)
└── public (shared utilities)
```

Each schema is completely independent. This project uses `flashcards_schema`.

### Step 1: Create Schema

1. In pgAdmin, select your database: **Servers** → **Shared Dev Database** → **dev_apps**
2. Click **"Tools"** → **"Query Tool"**
3. Execute this SQL to create the schema for FlashCards:

```sql
CREATE SCHEMA IF NOT EXISTS flashcards_schema;
SET search_path TO flashcards_schema;
```

4. Click **"Execute"**

### Step 2: Get and Modify the SQL Script

Open your documentation:

```bash
cat documents/DATABASE_SCHEMA.md
```

The DATABASE_SCHEMA.md file creates tables for the `public` schema. For the multi-app setup, we need to prepend `SET search_path` to direct all tables to `flashcards_schema`.

### Step 3: Execute Modified Schema SQL

1. In pgAdmin Query Tool, copy this complete SQL block:

```sql
-- Set schema for all subsequent commands
SET search_path TO flashcards_schema;

-- Create all tables (from DATABASE_SCHEMA.md)
-- Copy everything from DATABASE_SCHEMA.md starting with CREATE TABLE
-- ... (paste entire schema from DATABASE_SCHEMA.md)
```

2. Replace the `... (paste entire schema...)` with all the CREATE TABLE statements from [DATABASE_SCHEMA.md](/home/tmann/Documents/Projects/FlashCards/documents/DATABASE_SCHEMA.md)

3. Click **"Execute"** (or press F5)

4. Wait for completion—should show "Query returned successfully"

### Step 4: Verify Tables Created

1. In pgAdmin, right-click **Schemas** → **flashcards_schema** → **Tables** → **"Refresh"**
2. You should see these tables:
   - `users`
   - `flashcards`
   - `leitner_boxes`
   - `quizzes`
   - `quiz_questions`
   - `quiz_results`
   - `import_export_logs`

### Step 5: Verify Indexes

1. Expand any table (e.g., **leitner_boxes**)
2. Click **"Indexes"**—should see multiple indexes created

**✅ Success!** Your database schema is ready in `flashcards_schema`.

---

## Phase 5: Test Database Connection from Node.js

### Step 1: Create Test Script

Create `test-db-connection.js` in your project root:

```bash
cat > test-db-connection.js << 'EOF'
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Render
  }
});

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...');
    console.log(`📍 Connecting to: ${process.env.DB_HOST}`);
    console.log(`📦 Database: ${process.env.DB_NAME}`);
    console.log(`📋 Schema: ${process.env.DB_SCHEMA}`);

    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL!');

    // Set schema for this connection
    await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);

    // Test query
    const result = await client.query('SELECT NOW()');
    console.log('✅ Query successful!');
    console.log(`📅 Server time: ${result.rows[0].now}`);

    // Show tables in this app's schema
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `, [process.env.DB_SCHEMA]);

    console.log(`\n📊 Tables in ${process.env.DB_SCHEMA} schema:`);
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));

    // Show other schemas in this database (other apps)
    const schemas = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public')
      ORDER BY schema_name
    `);

    if (schemas.rows.length > 0) {
      console.log(`\n🗂️  Other app schemas in ${process.env.DB_NAME}:`);
      schemas.rows.forEach(row => console.log(`   - ${row.schema_name}`));
    }

    client.release();
    await pool.end();
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
EOF
```

### Step 2: Run Test

```bash
node test-db-connection.js
```

### Expected Output

```
🔍 Testing database connection...
📍 Connecting to: dpg-abc123xyz.render-ov.postgres.databases.render.com
📦 Database: dev_apps
📋 Schema: flashcards_schema
✅ Connected to PostgreSQL!
✅ Query successful!
📅 Server time: 2024-10-29 15:30:45.123456+00

📊 Tables in flashcards_schema schema:
   - flashcards
   - import_export_logs
   - leitner_boxes
   - quiz_questions
   - quiz_results
   - quizzes
   - users

✅ All tests passed!
```

If other apps are already using this database, you might also see:

```
🗂️  Other app schemas in dev_apps:
   - flashcards_schema
   - todos_schema
   - notes_schema
```

This shows multiple applications can coexist peacefully in the same database!

### Troubleshooting

**If connection fails:**

1. **"ENOTFOUND" error**: Database host is incorrect
   - Check DATABASE_URL in .env
   - Verify Render connection string

2. **"FATAL: invalid authorization specification"**: Password is wrong
   - Copy password again from Render dashboard
   - Ensure no extra spaces

3. **"SSL certificate problem"**: SSL configuration needed
   - Already handled in test script with `rejectUnauthorized: false`
   - Production should use proper SSL

### Step 3: Clean Up Test File

Once successful, remove the test script:

```bash
rm test-db-connection.js
```

---

## Phase 6: Start Development Server

### Step 1: Create Basic Server File

Create `server.js` in your project root:

```bash
cat > server.js << 'EOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Render
  }
});

// Set schema for all queries
pool.on('connect', async (client) => {
  await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
});

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5000' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make db available to routes
app.locals.pool = pool;
app.locals.schema = process.env.DB_SCHEMA;

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA
  });
});

// Database health check
app.get('/api/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      database: process.env.DB_NAME,
      schema: process.env.DB_SCHEMA,
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Home route
app.get('/', (req, res) => {
  res.render('index');
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`🗄️  Database: ${process.env.DB_NAME}`);
  console.log(`📋 Schema: ${process.env.DB_SCHEMA}`);
  console.log(`📍 Host: ${process.env.DB_HOST}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV}\n`);
});
EOF
```

### Step 2: Update package.json Scripts

Open `package.json` and update the `"scripts"` section:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "jest --detectOpenHandles",
  "test:watch": "jest --watch"
},
```

### Step 3: Start Development Server

```bash
npm run dev
```

### Expected Output

```
[nodemon] 3.0.1
[nodemon] to restart at any time, type `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: js,json
[nodemon] starting `node server.js`

✅ Server running on http://localhost:5000
🗄️  Database: dev_apps
📋 Schema: flashcards_schema
📍 Host: dpg-abc123xyz.render-ov.postgres.databases.render.com
📝 Environment: development
```

### Step 4: Test Health Endpoints

In another terminal:

```bash
# Basic health check
curl http://localhost:5000/api/health

# Database health check
curl http://localhost:5000/api/db-health
```

Expected responses:

```json
{
  "status": "ok",
  "timestamp": "2024-10-29T15:35:22.456Z",
  "environment": "development",
  "database": "dev_apps",
  "schema": "flashcards_schema"
}
```

```json
{
  "status": "ok",
  "database": "dev_apps",
  "schema": "flashcards_schema",
  "timestamp": "2024-10-29T15:35:22.456Z"
}
```

✅ **Server is working and connected to the correct schema!**

---

## Complete .env Reference

Here's your complete `.env` template with all possible values:

```env
# ==========================================
# CRITICAL: REPLACE THESE VALUES
# ==========================================
# Shared database for multiple applications
DATABASE_URL=postgresql://app_admin:YOUR_PASSWORD@YOUR_HOST:5432/dev_apps
DB_HOST=YOUR_HOST
DB_PASSWORD=YOUR_PASSWORD
JWT_SECRET=YOUR_JWT_SECRET_32_CHARACTERS

# ==========================================
# DATABASE CONFIGURATION
# ==========================================
# Shared database for multiple applications
DB_PORT=5432
DB_NAME=dev_apps
DB_USER=app_admin
DB_SCHEMA=flashcards_schema
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000

# ==========================================
# APPLICATION CONFIGURATION
# ==========================================
NODE_ENV=development
PORT=5000
HOST=localhost

# ==========================================
# AUTHENTICATION
# ==========================================
JWT_SECRET=YOUR_JWT_SECRET_32_CHARACTERS
JWT_EXPIRATION=7d
JWT_REFRESH_EXPIRATION=30d
BCRYPT_ROUNDS=10

# ==========================================
# CORS CONFIGURATION
# ==========================================
CORS_ORIGIN=http://localhost:5000
CORS_CREDENTIALS=true

# ==========================================
# SESSION CONFIGURATION
# ==========================================
SESSION_MAX_DURATION=3600000
STUDY_SESSION_TIMEOUT=300000

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=debug

# ==========================================
# PAGINATION
# ==========================================
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100

# ==========================================
# RATE LIMITING (Optional - for future)
# ==========================================
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=100

# ==========================================
# FEATURES (Flags for optional features)
# ==========================================
ENABLE_IMPORT_EXPORT=true
ENABLE_QUIZ_MODE=true
ENABLE_ANALYTICS=false
```

---

## Checklist: Setup Complete?

- [ ] Render PostgreSQL instance created (`dev_apps` database)
- [ ] Connection string copied to .env
- [ ] Database user is `app_admin` (shared across apps)
- [ ] `DB_SCHEMA=flashcards_schema` in .env
- [ ] JWT secret generated and in .env
- [ ] npm dependencies installed
- [ ] .env file created and git-ignored
- [ ] pgAdmin connected to shared database
- [ ] `flashcards_schema` created in pgAdmin
- [ ] Database schema initialized (7 tables in flashcards_schema)
- [ ] Test connection script ran successfully
- [ ] server.js created with schema setup
- [ ] Development server starts with `npm run dev`
- [ ] `/api/health` endpoint responds
- [ ] `/api/db-health` endpoint responds and shows correct schema

---

## What's Next?

Once everything above is complete:

### Phase 2: User Authentication (1-2 days)

- Create user registration endpoint
- Create user login endpoint
- Create JWT token generation
- Create password hashing with bcryptjs

### Phase 3: Flashcard CRUD (1-2 days)

- Create flashcard management endpoints
- Implement add/edit/delete/list cards

### Phase 4: Leitner System (2-3 days)

- Create leitner_boxes service
- Implement card promotion/demotion logic
- Create practice endpoints
- Implement box scheduling

### Phase 5: Quiz System (2-3 days)

- Create quiz creation
- Create quiz questions
- Implement quiz taking
- Track quiz results

See `ROADMAP.md` for complete 10-phase timeline.

---

## Common Issues & Solutions

### Issue: "FATAL: role flashcards_user does not exist"

**Solution:** Render may not have created the user yet. Wait 5 minutes and try again, or recreate the database.

### Issue: "connect ECONNREFUSED"

**Solution:** Database isn't ready yet. Render takes 2-5 minutes after creation. Check Render dashboard.

### Issue: "SSL certificate problem"

**Solution:** Already handled in our code with `rejectUnauthorized: false` for development.

### Issue: "password authentication failed"

**Solution:**

- Check password includes special characters correctly
- Copy from Render dashboard, not from URL (URL-encoded characters differ)
- Try recreating database with simpler password

### Issue: "port 5000 already in use"

**Solution:**

```bash
lsof -i :5000  # Find process using port
kill -9 <PID>  # Kill the process
# Or use different port: PORT=3000 npm run dev
```

### Issue: ".env file not being read"

**Solution:**

- Ensure `require('dotenv').config();` is at top of server.js
- Restart server after changing .env
- Check file is named `.env` (not `.env.txt`)

---

## Security Notes

⚠️ **IMPORTANT:**

1. **Never commit .env to git**
   - Add to .gitignore
   - Use `git config core.excludesfile` if needed

2. **Never share your .env values**
   - Database passwords
   - JWT secrets
   - Connection strings

3. **Rotate secrets regularly**
   - Generate new JWT_SECRET monthly
   - Change database password quarterly

4. **Use environment-specific values**
   - `.env` for local development
   - `.env.production` for production (never commit)
   - Use Render's environment variables for production

5. **Enable SSL/TLS in production**
   - Current setup disables SSL for development
   - Production must have `rejectUnauthorized: true`

---

## Support

If you encounter issues:

1. Check `.env` file for typos
2. Verify Render connection string format
3. Restart development server
4. Check Render dashboard for database status
5. Review server.js console output for error messages

Good luck! 🚀
