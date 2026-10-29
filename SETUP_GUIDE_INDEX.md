# 🎯 FlashCards Setup & Development Guide

## ⚡ Quick Links

**New to this project?** Start here:

- 📖 [SETUP_QUICK_START.md](./SETUP_QUICK_START.md) - 30-minute guided setup
- ✅ [SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md) - Track your progress

**Ready to set up?**

- 📋 [.env.example](./.env.example) - Copy to `.env` and fill in your values
- 📚 [documents/DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md) - Detailed instructions
- 📚 [documents/MULTI_APP_ARCHITECTURE.md](./documents/MULTI_APP_ARCHITECTURE.md) - Understand the database design

---

## 📚 Complete Documentation Index

### Setup & Configuration

| File                                                                         | Purpose                                            | Read Time |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | --------- |
| [SETUP_QUICK_START.md](./SETUP_QUICK_START.md)                               | 30-minute guided setup with step-by-step commands  | 5 min     |
| [SETUP_CHECKLIST.md](./SETUP_CHECKLIST.md)                                   | Interactive checklist to track setup progress      | 10 min    |
| [.env.example](./.env.example)                                               | Template for environment variables                 | 2 min     |
| [documents/DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md)   | Complete detailed setup guide for Render + pgAdmin | 20 min    |
| [documents/MULTI_APP_ARCHITECTURE.md](./documents/MULTI_APP_ARCHITECTURE.md) | How database supports multiple applications        | 15 min    |

### Study Methodology

| File                                                         | Purpose                                    | Read Time |
| ------------------------------------------------------------ | ------------------------------------------ | --------- |
| [documents/LEITNER_SYSTEM.md](./documents/LEITNER_SYSTEM.md) | Leitner Box System explained with examples | 15 min    |

### Development Reference

| File                                                               | Purpose                                             | Read Time |
| ------------------------------------------------------------------ | --------------------------------------------------- | --------- |
| [documents/ROADMAP.md](./documents/ROADMAP.md)                     | 10-phase development timeline with effort estimates | 15 min    |
| [documents/ARCHITECTURE.md](./documents/ARCHITECTURE.md)           | System design, data flows, and components           | 15 min    |
| [documents/DATABASE_SCHEMA.md](./documents/DATABASE_SCHEMA.md)     | PostgreSQL schema with 7 tables and SQL             | 15 min    |
| [documents/API_ENDPOINTS.md](./documents/API_ENDPOINTS.md)         | REST API specification for 35+ endpoints            | 20 min    |
| [documents/TESTING_STRATEGY.md](./documents/TESTING_STRATEGY.md)   | Jest testing framework with examples                | 20 min    |
| [documents/PROJECT_STRUCTURE.md](./documents/PROJECT_STRUCTURE.md) | Current project layout and file organization        | 5 min     |
| [documents/QUICK_REFERENCE.md](./documents/QUICK_REFERENCE.md)     | Common commands and quick troubleshooting           | 10 min    |

### Deployment

| File                                                                   | Purpose                         | Read Time |
| ---------------------------------------------------------------------- | ------------------------------- | --------- |
| [documents/DEPLOYMENT_STRATEGY.md](./documents/DEPLOYMENT_STRATEGY.md) | Production deployment on Render | 15 min    |

### Overview

| File                                         | Purpose                                    | Read Time |
| -------------------------------------------- | ------------------------------------------ | --------- |
| [documents/README.md](./documents/README.md) | Documentation summary and project overview | 10 min    |

---

## 🚀 Setup Timeline

### Phase 1: Render Database (5 minutes)

1. Create Render account
2. Create `dev_apps` PostgreSQL database
3. Copy connection details

**Result:** PostgreSQL instance running on Render

### Phase 2: Environment (5 minutes)

1. Create `.env` file
2. Fill in database credentials
3. Add to `.gitignore`

**Result:** Local configuration ready

### Phase 3: Dependencies (5 minutes)

1. Run `npm install`
2. Verify packages installed

**Result:** All Node packages ready

### Phase 4: Database Schema (10 minutes)

1. Connect pgAdmin to Render database
2. Create `flashcards_schema`
3. Execute SQL to create 7 tables

**Result:** PostgreSQL schema initialized

### Phase 5: Connection Test (5 minutes)

1. Create test script
2. Verify database connectivity
3. Confirm tables are created

**Result:** Database confirmed working

### Phase 6: Development Server (2 minutes)

1. Create `server.js`
2. Start with `npm run dev`
3. Test health endpoints

**Result:** Development environment running

**Total Time: ~30-45 minutes**

---

## 📊 Your Database Structure

```
Render PostgreSQL Instance (dev-postgres-db)
│
└─ dev_apps Database (shared by all applications)
   │
   ├─ flashcards_schema (this app)
   │  ├─ users
   │  ├─ flashcards
   │  ├─ leitner_boxes
   │  ├─ quizzes
   │  ├─ quiz_questions
   │  ├─ quiz_results
   │  └─ import_export_logs
   │
   ├─ todos_schema (future app - same pattern)
   └─ notes_schema (future app - same pattern)
```

**Key Advantage:** Multiple apps in one database with complete data isolation through PostgreSQL schemas.

---

## 🔑 Critical .env Variables

These 4 values must be filled from your Render database:

```env
DATABASE_URL=postgresql://app_admin:PASSWORD@HOST:5432/dev_apps
DB_HOST=HOST
DB_PASSWORD=PASSWORD
DB_SCHEMA=flashcards_schema
```

Generate JWT_SECRET:

```bash
openssl rand -hex 32
```

Copy the entire `.env.example` file and fill in your actual values.

---

## 📖 Reading Order

### For Immediate Setup

1. [SETUP_QUICK_START.md](./SETUP_QUICK_START.md) - 5 min read
2. [.env.example](./.env.example) - Reference
3. Follow 6 setup steps - 30 min execution
4. ✅ Done!

### For Understanding

1. [documents/MULTI_APP_ARCHITECTURE.md](./documents/MULTI_APP_ARCHITECTURE.md) - Why this design
2. [documents/LEITNER_SYSTEM.md](./documents/LEITNER_SYSTEM.md) - Study methodology
3. [documents/ARCHITECTURE.md](./documents/ARCHITECTURE.md) - System design

### For Development

1. [documents/ROADMAP.md](./documents/ROADMAP.md) - What to build
2. [documents/API_ENDPOINTS.md](./documents/API_ENDPOINTS.md) - How to build
3. [documents/DATABASE_SCHEMA.md](./documents/DATABASE_SCHEMA.md) - Data structure
4. [documents/TESTING_STRATEGY.md](./documents/TESTING_STRATEGY.md) - Testing approach

### For Operations

1. [documents/DEPLOYMENT_STRATEGY.md](./documents/DEPLOYMENT_STRATEGY.md) - Production setup
2. [documents/QUICK_REFERENCE.md](./documents/QUICK_REFERENCE.md) - Common commands
3. [documents/DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md) - Troubleshooting

---

## 🆘 Troubleshooting

**Issue:** "ENOTFOUND" or connection error
→ Check `DB_HOST` in `.env` matches Render connection details

**Issue:** "Authentication failed"
→ Verify `DB_PASSWORD` is correct (copy from Render dashboard)

**Issue:** "relation users does not exist"
→ Ensure `DB_SCHEMA=flashcards_schema` in `.env` and server is restarted

**Issue:** pgAdmin tables not visible
→ Right-click schema → Refresh

**Issue:** "Port 5000 already in use"
→ Change `PORT` in `.env` or kill process: `lsof -i :5000`

For more help: See "Troubleshooting" sections in [DEV_ENVIRONMENT_SETUP.md](./documents/DEV_ENVIRONMENT_SETUP.md)

---

## ✨ Next Steps After Setup

1. ✅ Development environment running
2. 📖 Read [documents/LEITNER_SYSTEM.md](./documents/LEITNER_SYSTEM.md)
3. 📖 Read [documents/ROADMAP.md](./documents/ROADMAP.md)
4. 🔨 Begin Phase 2: Authentication endpoints
5. 📝 Track progress in session todos

---

## 📞 Quick Reference

**Generate JWT Secret:**

```bash
openssl rand -hex 32
```

**Start Development:**

```bash
npm run dev
```

**Test Database Connection:**

```bash
curl http://localhost:5000/api/db-health
```

**View Documentation:**

```bash
cat SETUP_QUICK_START.md
```

---

## 📋 Files Included

- ✨ **SETUP_QUICK_START.md** - Quick 30-minute setup guide
- ✅ **SETUP_CHECKLIST.md** - Interactive progress tracker
- 📋 **.env.example** - Environment template
- 📚 **documents/DEV_ENVIRONMENT_SETUP.md** - Detailed setup
- 📚 **documents/MULTI_APP_ARCHITECTURE.md** - Database design
- 📚 **documents/LEITNER_SYSTEM.md** - Study methodology
- 📚 **documents/** - 9 additional reference guides

**Total:** 15 files, ~200 KB of documentation

---

## 🎯 Your Mission

1. Follow [SETUP_QUICK_START.md](./SETUP_QUICK_START.md)
2. Complete setup in 30-45 minutes
3. Verify `npm run dev` works
4. Read about Leitner system
5. Begin Phase 2 development

**You've got this! 🚀**

---

**Last Updated:** October 29, 2024
**Documentation Version:** 2.0 (Multi-App Architecture)
