# FlashCards Quick Reference Guide

## Documentation Index

All documentation is in `/documents/` folder:

| Document                                           | Purpose                                     | Length      |
| -------------------------------------------------- | ------------------------------------------- | ----------- |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)     | Directory layout, components, current state | 5 min read  |
| [ARCHITECTURE.md](./ARCHITECTURE.md)               | System design, data flows, security         | 10 min read |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)         | PostgreSQL tables, schema, queries          | 15 min read |
| [API_ENDPOINTS.md](./API_ENDPOINTS.md)             | Complete API specification with examples    | 20 min read |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md)       | Testing approach, examples, CI/CD           | 20 min read |
| [DEPLOYMENT_STRATEGY.md](./DEPLOYMENT_STRATEGY.md) | Render setup, pgAdmin, deployment steps     | 15 min read |
| [ROADMAP.md](./ROADMAP.md)                         | 10-phase development plan, timeline         | 20 min read |

---

## Project Overview

**What is FlashCards?**
A web application for studying flashcards with:

- User accounts (login/logout/profile)
- Flashcard management (create, organize, import/export)
- Intelligent practice with spaced repetition (SM-2 algorithm)
- Quiz system for testing knowledge
- Progress tracking and analytics

**Tech Stack:**

- Frontend: EJS, HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express.js
- Database: PostgreSQL (Render-hosted)
- Admin: pgAdmin 4
- Testing: Jest + Supertest
- Deployment: Render (auto-deploy from GitHub)

**Current Status:**

- ✅ Project structure reviewed and documented
- ✅ Architecture designed
- ✅ Database schema designed
- ✅ API specification complete
- ✅ Testing strategy defined
- ✅ Deployment strategy defined
- ✅ Todos created (44 items across 10 phases)
- ⏳ Development ready to begin

---

## Quick Start for Development

### Prerequisites

```bash
# Node.js 18+
node --version

# Git
git --version

# PostgreSQL client (psql) - optional but useful
psql --version
```

### Local Setup (First Time)

```bash
cd /home/tmann/Documents/Projects/FlashCards

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Update .env with your local database credentials
nano .env
```

### Running Locally

```bash
# Development server (auto-reload with nodemon)
npm run dev
# Server runs on http://localhost:3000

# Production build
npm start

# Run tests
npm test

# Run specific test file
npm test tests/unit/auth.test.js

# Watch tests (run as you code)
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## Database Setup Checklist

### Step 1: Render PostgreSQL ✅ (DO FIRST)

- [ ] Create account at https://render.com
- [ ] Create new PostgreSQL instance
  - Name: `flashcards-db`
  - Database: `flashcards`
  - User: `flashcards_user`
  - Plan: Free tier
- [ ] Copy connection string: `postgresql://user:pass@host:5432/db`
- [ ] Add to `.env` as `DATABASE_URL`
- [ ] Test connection locally:
  ```bash
  psql $DATABASE_URL -c "SELECT 1;"
  ```

### Step 2: Initialize Schema

```bash
# Option A: Using psql CLI
psql $DATABASE_URL < database/schema.sql

# Option B: Using Node.js (add to server startup)
npm install pg
node scripts/init-db.js

# Option C: Using pgAdmin GUI
# Connect to Render DB, paste SQL from DATABASE_SCHEMA.md, execute
```

### Step 3: pgAdmin Setup ✅ (YOUR PREFERENCE)

- [ ] Install pgAdmin 4: https://www.pgadmin.org/download/
- [ ] Open pgAdmin, create server connection:
  - Name: `FlashCards-Render`
  - Hostname: (from Render connection string)
  - Port: 5432
  - Database: `flashcards`
  - Username: `flashcards_user`
  - Password: (from Render)
  - SSL Mode: Require
- [ ] Test: Right-click server → Properties → Connection tab → Test

### Step 4: Configure Environment

```bash
# .env file
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/flashcards
JWT_SECRET=generate-random-string-with-openssl
JWT_EXPIRE=7d
BCRYPT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=debug
```

Generate JWT_SECRET:

```bash
openssl rand -hex 32
# Output: a1b2c3d4e5f6...
```

---

## Development Workflow

### Creating a Feature

```bash
# 1. Update todo status
# In VS Code: Open Command Palette → "FlashCards: Update Todo"
# Select todo and change status to "in_progress"

# 2. Create feature branch
git checkout -b feature/user-registration

# 3. Make changes
# Edit server.js, src/routes/auth.js, etc.

# 4. Test locally
npm run dev
# Test in browser or Postman

# 5. Run tests
npm test

# 6. Commit with clear message
git add .
git commit -m "feat: add user registration endpoint

- Implement POST /api/auth/register
- Add bcryptjs password hashing
- Add Joi validation
- Add test coverage"

# 7. Push and create PR
git push origin feature/user-registration
# Open PR on GitHub

# 8. After merge, update todo to "done"
```

### Git Commit Convention

```
feat: add new feature
fix: fix a bug
docs: documentation changes
style: formatting, missing semicolons, etc.
refactor: code restructuring without feature change
test: add or update tests
chore: dependency updates, build config

Examples:
feat: implement SM-2 spaced repetition algorithm
fix: correct SRS interval calculation for first review
test: add 10 unit tests for practice service
docs: add API endpoints documentation
```

---

## Common Commands Cheat Sheet

### Development

```bash
npm run dev              # Start dev server with auto-reload
npm start               # Start production server
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate coverage report
npm run lint            # Lint code (when added)
npm run build           # Build for production (when needed)
```

### Database (psql)

```bash
# Connect to database
psql $DATABASE_URL

# List all tables
\dt

# Describe table structure
\d users

# Run SQL query from file
\i database/schema.sql

# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore from backup
psql $DATABASE_URL < backup.sql

# Exit psql
\q
```

### Git

```bash
git status              # Check current branch and changes
git log --oneline       # View commit history
git branch -a           # List all branches
git diff                # View changes
git stash               # Temporarily save changes
git stash pop           # Restore stashed changes
git reset --hard        # Discard all changes (⚠️ careful!)
```

### Render Deployment

```bash
# View logs
git log --oneline | grep "deploy"

# Trigger manual redeploy in Render Dashboard
# Settings → Deployments → Manual Deploy

# Check deployment status
# Dashboard → Deployments tab

# Restart service
# Dashboard → Settings → Restart Service
```

---

## API Testing

### Using Postman

1. Open Postman
2. Create new request
3. Method: `POST`
4. URL: `http://localhost:3000/api/auth/login`
5. Body (raw JSON):
   ```json
   {
     "username": "testuser",
     "password": "TestPassword123!"
   }
   ```
6. Send
7. Response should include JWT token

### Using curl

```bash
# Registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPassword123!",
    "fullName": "Test User"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "TestPassword123!"
  }'

# Use token in subsequent requests
TOKEN="eyJhbGciOiJIUzI1NiIs..."
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN"
```

### Using VS Code REST Client Extension

Create `test.http` file:

```http
### Register User
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "TestPassword123!",
  "fullName": "Test User"
}

### Login
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "TestPassword123!"
}

### Get Profile
GET http://localhost:3000/api/profile
Authorization: Bearer {{TOKEN}}
```

Right-click and select "Send Request"

---

## Debugging

### Enable Debug Logging

```bash
# In terminal before running
DEBUG=* npm run dev

# Or in .env
LOG_LEVEL=debug

# In code
console.log('Variable:', variable);
console.error('Error:', error);
```

### VS Code Debugger

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Server",
      "program": "${workspaceFolder}/server.js",
      "restart": true,
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

Then press F5 to start debugging with breakpoints.

### Database Debugging

```bash
# Connect to database
psql $DATABASE_URL

# Check for errors
SELECT * FROM users; -- See all users
SELECT * FROM flashcards WHERE user_id = 'xxx'; -- See user's cards

# Check SRS matrix
SELECT * FROM practice_matrices
WHERE user_id = 'xxx'
AND next_review <= NOW()
ORDER BY next_review;

# Check quiz results
SELECT * FROM quiz_results WHERE user_id = 'xxx';
```

---

## Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**

- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Try `psql $DATABASE_URL -c "SELECT 1;"`
- For Render: Verify instance is "Available" in dashboard

### JWT Token Issues

```
Error: Invalid token or token expired
```

**Solutions:**

- Check `JWT_SECRET` matches between .env and Render
- Verify token hasn't expired (default 7 days)
- Use `/api/auth/refresh` to refresh token
- Clear localStorage/cookies and re-login

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

```bash
# Kill process on port 3000
lsof -i :3000
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

### npm Install Issues

```bash
# Clear npm cache
npm cache clean --force

# Reinstall everything
rm -rf node_modules package-lock.json
npm install
```

---

## Performance Tips

### Database Queries

- ✅ Use indexes (already in schema)
- ✅ Use pagination for large lists
- ✅ Filter unnecessary data in SELECT
- ❌ Don't use SELECT * in production
- ❌ Don't have N+1 queries in loops

### Code

- ✅ Use async/await consistently
- ✅ Handle errors with try/catch
- ✅ Use connection pooling (pg pool)
- ❌ Don't block event loop with sync operations

### Frontend

- ✅ Minify CSS/JS in production
- ✅ Use CDN for static assets
- ✅ Compress images
- ❌ Don't load entire datasets on page load

---

## Security Checklist

- [ ] Never commit `.env` or secrets
- [ ] Use HTTPS in production (Render provides)
- [ ] Validate all user input server-side
- [ ] Use parameterized queries (pg library does this)
- [ ] Hash passwords with bcryptjs (10+ rounds)
- [ ] Use JWT with secure secret (20+ characters)
- [ ] Implement CORS carefully
- [ ] Add rate limiting on sensitive endpoints
- [ ] Log security events
- [ ] Regular dependency updates (`npm audit`)

---

## Testing Checklist

### Before Committing

```bash
npm test              # All tests must pass
npm run test:coverage # Check coverage threshold met
```

### Before Deploying

```bash
# Local
npm test
npm run test:coverage

# GitHub Actions (automatic on push)
# Check workflows passing before merge

# Manual testing on Render staging
# Test all features work on production-like DB
```

---

## Getting Help

### Documentation Files

- Questions about structure? → See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)
- Questions about design? → See [ARCHITECTURE.md](./ARCHITECTURE.md)
- Questions about database? → See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- Questions about APIs? → See [API_ENDPOINTS.md](./API_ENDPOINTS.md)
- Questions about testing? → See [TESTING_STRATEGY.md](./TESTING_STRATEGY.md)
- Questions about deployment? → See [DEPLOYMENT_STRATEGY.md](./DEPLOYMENT_STRATEGY.md)
- Questions about timeline? → See [ROADMAP.md](./ROADMAP.md)

### Online Resources

- Express.js: https://expressjs.com/
- PostgreSQL: https://www.postgresql.org/docs/
- pgAdmin: https://www.pgadmin.org/docs/
- JWT: https://jwt.io/
- Jest: https://jestjs.io/
- Render: https://render.com/docs

---

## Productivity Tips

### VS Code Extensions

- REST Client (for API testing)
- ES7+ React/Redux/React-Native snippets
- SQLTools + PostgreSQL Driver
- Prettier (code formatter)
- ESLint (linter)
- Thunder Client or Postman (API testing)

### Shortcuts

```
Ctrl+K Ctrl+O    Open folder
Ctrl+J           Toggle terminal
Ctrl+`           Focus terminal
Ctrl+Shift+D     Debug
Ctrl+Shift+F5    Restart debugging
F9               Toggle breakpoint
F10              Step over
F11              Step into
Shift+F11        Step out
```

### Focus & Productivity

- Use `npm run test:watch` during development
- Keep browser DevTools open for API testing
- Use pgAdmin for database verification
- Check logs in terminal for error messages
- Commit frequently (small, focused commits)

---

## Success Metrics

### Development Success ✅

- [ ] All todos completed
- [ ] 80%+ test coverage
- [ ] All tests passing
- [ ] Zero linting errors
- [ ] Code review completed

### Deployment Success ✅

- [ ] CI/CD pipeline passing
- [ ] App live on Render
- [ ] Database persisting data
- [ ] pgAdmin can connect
- [ ] All endpoints responsive

### User Experience ✅

- [ ] Registration works end-to-end
- [ ] Can create and study flashcards
- [ ] Practice sessions improve accuracy
- [ ] Quiz results stored
- [ ] Import/export working

---

**Happy coding! 🚀**

For the full picture, start with [ROADMAP.md](./ROADMAP.md) for timeline and context, then refer to specific documentation as needed.
