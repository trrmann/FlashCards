# Multi-Application Database Architecture

This guide explains how the FlashCards project uses a shared Render PostgreSQL database with other applications, using PostgreSQL schemas for isolation.

---

## Overview

Instead of creating a separate database for each application, we use **one PostgreSQL database** (`dev_apps`) with multiple **schemas** inside it. Each schema is like a namespace that completely isolates one application's data from another.

```
┌─────────────────────────────────────────────────────────┐
│            Render PostgreSQL Instance                   │
│         (dev-postgres-db on render.com)                 │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │         dev_apps Database                         │ │
│  │  (One database shared by all applications)        │ │
│  │                                                   │ │
│  │  ┌──────────────────┐  ┌──────────────────┐     │ │
│  │  │ flashcards_schema│  │  todos_schema    │     │ │
│  │  │                  │  │                  │     │ │
│  │  │ ├─ users         │  │ ├─ users         │     │ │
│  │  │ ├─ flashcards    │  │ ├─ todos         │     │ │
│  │  │ ├─ leitner_boxes │  │ ├─ categories    │     │ │
│  │  │ ├─ quizzes       │  │ └─ tags          │     │ │
│  │  │ └─ ...           │  │                  │     │ │
│  │  └──────────────────┘  └──────────────────┘     │ │
│  │                                                   │ │
│  │  ┌──────────────────┐  ┌──────────────────┐     │ │
│  │  │  notes_schema    │  │ public (shared)  │     │ │
│  │  │                  │  │                  │     │ │
│  │  │ ├─ users         │  │ ├─ functions     │     │ │
│  │  │ ├─ notes         │  │ └─ extensions    │     │ │
│  │  │ ├─ categories    │  │                  │     │ │
│  │  │ └─ ...           │  │                  │     │ │
│  │  └──────────────────┘  └──────────────────┘     │ │
│  │                                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits of This Architecture

### 1. **Cost Efficient** 💰
- Only one database instance on Render (Free tier sufficient for dev/test)
- One connection pool shared for development
- No extra database hosting costs

### 2. **Easy Management** 🎯
- Single pgAdmin connection to view all apps
- Centralized backup strategy
- Simplified credential management

### 3. **Data Isolation** 🔒
- Each app has its own schema
- Can't accidentally query another app's tables
- Identical table names don't conflict (e.g., both have `users` table)

### 4. **Scalability** 📈
- Easy to add new applications
- No migration needed when adding 4th, 5th app
- Simple to split databases later if needed

### 5. **Development Flexibility** 🔧
- Share utility functions in `public` schema
- Test cross-schema queries (rare but possible)
- Learn PostgreSQL schema concepts

---

## Schema Isolation Explained

### What is a PostgreSQL Schema?

A **schema** is a namespace inside a database. Think of it like folders in a file system:

```
Database = Hard Drive
  └─ Schema = Folder
       └─ Table = File
            └─ Row = Data
```

### Each App Gets Its Own Schema

**FlashCards App:**
```
dev_apps.flashcards_schema.users
dev_apps.flashcards_schema.flashcards
dev_apps.flashcards_schema.leitner_boxes
```

**Todos App** (hypothetical):
```
dev_apps.todos_schema.users
dev_apps.todos_schema.todos
dev_apps.todos_schema.categories
```

### Complete Isolation

Even though both apps have a `users` table, they're completely separate:

```sql
-- FlashCards app sees only its users
SELECT * FROM flashcards_schema.users;

-- Todos app sees only its users
SELECT * FROM todos_schema.users;

-- These are different tables with no overlap
```

---

## How It Works in Node.js

### Connection String

All apps use the same connection string, but with a schema parameter:

```env
DATABASE_URL=postgresql://app_admin:password@host:5432/dev_apps
DB_SCHEMA=flashcards_schema
```

### Setting the Schema in Code

When connecting, we tell PostgreSQL which schema to use:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set schema for this connection
pool.on('connect', async (client) => {
  await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
});
```

After this setup, all queries automatically use `flashcards_schema`:

```javascript
// This query runs in flashcards_schema
const users = await pool.query('SELECT * FROM users');

// Equivalent to:
// SELECT * FROM flashcards_schema.users

// Different schema? Would need explicit:
// SELECT * FROM todos_schema.users
```

---

## pgAdmin View

In pgAdmin, the structure looks like this:

```
Servers
└─ Shared Dev Database (server on render.com)
   └─ Databases
      └─ dev_apps
         └─ Schemas
            ├─ flashcards_schema
            │  └─ Tables
            │     ├─ users
            │     ├─ flashcards
            │     ├─ leitner_boxes
            │     └─ ...
            ├─ todos_schema
            │  └─ Tables
            │     ├─ users
            │     ├─ todos
            │     └─ ...
            ├─ notes_schema
            │  └─ Tables
            │     ├─ users
            │     ├─ notes
            │     └─ ...
            └─ public
               └─ Tables (shared utilities)
```

Each schema is visually separate in pgAdmin, making it easy to see which tables belong to which app.

---

## Setting Up Another App

Want to add the Todos app to the same database? Simple!

### Step 1: Create Another Schema

```sql
CREATE SCHEMA IF NOT EXISTS todos_schema;
SET search_path TO todos_schema;
```

### Step 2: Create That App's Tables

Execute the Todos schema SQL with `SET search_path TO todos_schema` at the top.

### Step 3: Set .env for Todos App

```env
DATABASE_URL=postgresql://app_admin:password@host:5432/dev_apps
DB_SCHEMA=todos_schema
```

### Step 4: Done!

The Todos app now:
- Uses the same database connection
- Has its own completely isolated tables
- Doesn't see FlashCards data
- Can have identical table names without conflict

---

## Important Considerations

### 1. User Table Strategy

Each app has its own `users` table. Three approaches:

**Option A: Fully Separate** (Current)
```
flashcards_schema.users (for FlashCards login)
todos_schema.users (for Todos login)
```
- Pro: Complete isolation
- Con: Can't share auth across apps

**Option B: Shared Users**
```
public.users (shared by all apps)
flashcards_schema.* (app-specific tables)
todos_schema.* (app-specific tables)
```
- Pro: Single login for all apps
- Con: Requires cross-schema relationships

**Option C: Hybrid** (Recommended)
```
public.users (single auth system)
flashcards_schema.* (app-specific)
todos_schema.* (app-specific)

(Foreign key: flashcards_schema.flashcards -> public.users)
```

For now, FlashCards has its own `users` table. If you need shared auth later, it's easy to refactor.

### 2. Backup & Recovery

Backing up `dev_apps` database backs up all schemas automatically:

```bash
# Backup entire database (all apps)
pg_dump dev_apps > backup.sql

# Restore entire database
psql dev_apps < backup.sql

# Backup one schema
pg_dump -n flashcards_schema dev_apps > flashcards_backup.sql
```

### 3. Connection Pooling

One pool can serve multiple schemas:

```javascript
// Single pool for all connections
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Each connection sets its own schema
await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
```

The pool efficiently manages connections across all schemas.

### 4. Queries Across Schemas (Advanced)

You can query multiple schemas if needed (rare):

```javascript
// Get users from both apps
const result = await pool.query(`
  (SELECT user_id, username, 'flashcards' as app 
   FROM flashcards_schema.users)
  UNION
  (SELECT user_id, username, 'todos' as app 
   FROM todos_schema.users)
`);
```

Not recommended for everyday use, but available if needed.

---

## Environment Variables Summary

### For FlashCards

```env
# Shared database
DATABASE_URL=postgresql://app_admin:password@host:5432/dev_apps

# This app's schema
DB_SCHEMA=flashcards_schema
```

### For Todos (if added)

```env
# Same database!
DATABASE_URL=postgresql://app_admin:password@host:5432/dev_apps

# Different schema
DB_SCHEMA=todos_schema
```

### For Notes (if added)

```env
# Same database!
DATABASE_URL=postgresql://app_admin:password@host:5432/dev_apps

# Different schema
DB_SCHEMA=notes_schema
```

---

## Troubleshooting

### "relation users does not exist"

**Problem:** Querying a table that's not in the current schema.

**Solution:** Check `.env` has correct `DB_SCHEMA` value.

```bash
# Verify schema in server output
✅ Server running on http://localhost:5000
📋 Schema: flashcards_schema  # <-- Correct?
```

### "permission denied for schema todos_schema"

**Problem:** App-admin user doesn't have access to a schema.

**Solution:** Grant permissions in pgAdmin:

```sql
GRANT USAGE ON SCHEMA todos_schema TO app_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA todos_schema TO app_admin;
```

### Can't see tables in pgAdmin

**Problem:** Tables not showing in the correct schema.

**Solution:** 
1. Right-click schema → **Refresh**
2. Check schema name exactly matches
3. Verify SQL executed with correct `SET search_path` statement

### Connection pool exhausted

**Problem:** "Client request timeout"

**Solution:** Multiple apps sharing one pool might deplete it. Increase pool size:

```env
DB_POOL_MAX=20  # Instead of default 10
```

---

## Migration Strategy

As your applications grow, you can migrate to separate databases without code changes:

**Phase 1: Single Database (Now)**
```
dev_apps
├─ flashcards_schema
└─ todos_schema
```

**Phase 2: Separate Dev Databases**
```
flashcards_db (on render.com)
todos_db (on render.com)
```

Change only `.env` - no code changes needed!

```env
# Old
DATABASE_URL=postgresql://app_admin:pw@host/dev_apps
DB_SCHEMA=flashcards_schema

# New
DATABASE_URL=postgresql://app_admin:pw@host/flashcards_db
DB_SCHEMA=public  # Or keep using flashcards_schema if preferred
```

---

## Summary

✅ **One database** (`dev_apps`)  
✅ **Multiple schemas** (one per app)  
✅ **Complete isolation** (can't accidentally access other app data)  
✅ **Cost efficient** (free tier sufficient for dev)  
✅ **Easy to scale** (just add a new schema)  
✅ **Future proof** (can split to separate databases later)  

This architecture is perfect for a developer working on multiple projects!

