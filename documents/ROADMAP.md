# FlashCards Project Roadmap & Execution Plan

## Executive Summary

The FlashCards project is a web-based flashcard study application that integrates with Render PostgreSQL for persistent storage. This document outlines the 10-phase development roadmap, immediate next steps, and project status.

**Project Goals:**

1. ✅ Review and document project structure
2. ✅ Create comprehensive architecture documentation
3. ✅ Define complete API specification
4. ✅ Design PostgreSQL database schema
5. ✅ Plan testing strategy with examples
6. ✅ Plan deployment to Render with pgAdmin access
7. Implement Phase 1: Database & Backend Foundation
8. Implement Phase 2-10: Progressive feature development

**Timeline:** 10-12 weeks for MVP, ongoing for enhancements

---

## Project Phases Overview

### Phase 1: Backend Setup & Database Integration (Week 1-2)

**Dependencies:** None (startup phase)
**Deliverables:**

- ✅ Render PostgreSQL instance provisioned
- Database schema initialized
- Environment variables configured
- Node.js dependencies installed
- pgAdmin 4 connected to Render instance

**Todos:**

1. `setup-database-render` - Provision PostgreSQL on Render
2. `init-database-schema` - Create all tables with schema.sql
3. `install-db-dependencies` - Add pg, bcryptjs, jsonwebtoken, joi, cors, dotenv
4. `setup-env-variables` - Configure .env and Render dashboard

**Effort:** 2-3 days

---

### Phase 2: Authentication System (Week 2-3)

**Dependencies:** Phase 1 complete
**Deliverables:**

- User registration with validation
- User login with JWT tokens
- Protected route middleware
- Profile management (update name, email, password)
- Logout functionality

**Todos:**

1. `implement-user-registration` - POST /api/auth/register
2. `implement-user-login` - POST /api/auth/login
3. `implement-jwt-middleware` - Auth middleware for protected routes
4. `implement-profile-endpoints` - GET/PUT /api/profile
5. `implement-logout` - POST /api/auth/logout

**Effort:** 3-4 days

**Key Features:**

- Password hashing with bcryptjs (10+ rounds)
- JWT tokens with 7-day expiration
- Input validation with Joi
- Error handling with meaningful messages
- Email uniqueness validation

---

### Phase 3: Flashcard Management (Week 3-4)

**Dependencies:** Phase 2 complete
**Deliverables:**

- CRUD operations for flashcards
- Category and difficulty filtering
- Pagination support
- JSON export functionality
- JSON import with file upload

**Todos:**

1. `implement-card-crud` - POST/GET/PUT/DELETE /api/cards
2. `implement-card-filtering` - Category, difficulty, pagination
3. `implement-export-functionality` - GET /api/cards/export
4. `implement-import-functionality` - POST /api/cards/import

**Effort:** 3-4 days

**Key Features:**

- File upload handling with multer
- JSON validation schema
- Batch import with error reporting
- File download with proper headers
- Duplicate detection (optional)

---

### Phase 4: Leitner Box System (Week 4-5)

**Dependencies:** Phase 3 complete
**Deliverables:**

- Leitner Box implementation (3-box system)
- Card promotion/demotion logic
- Box scheduling (Daily, Every 2 Days, Weekly)
- Practice session management with boxes
- Progress tracking by box level

**Todos:**

1. `implement-leitner-boxes` - Create leitner_boxes table and queries
2. `implement-box-promotion` - Correct answer logic (promote to next box)
3. `implement-box-demotion` - Incorrect answer logic (demote to Box 1)
4. `implement-box-scheduling` - Box 1 (daily), Box 2 (2-day), Box 3 (weekly) logic

**Effort:** 2-3 days

**Leitner System Details:**

The system uses 3 boxes with fixed review schedules:

```
[ BOX 1 ] --------> [ BOX 2 ] --------> [ BOX 3 ]
  Daily            Every 2 Days          Weekly
  (New/Hard)          (Medium)           (Mastered)
    ^                    |                    |
    |____________________|____________________|
                    If Incorrect (Demote back to Box 1)
```

**Key Features:**

- All cards start in Box 1
- Correct answer → promote to next box
- Incorrect answer → demote back to Box 1
- Box 3 (mastered) cards: reviewed weekly if they haven't been missed
- Simple, deterministic scheduling
- Focus study time on weakest concepts in Box 1

**Algorithm:**

```
If Answer Correct:
  If card.box_number < 3:
    card.box_number++
  Set next_review per box schedule

If Answer Incorrect:
  card.box_number = 1
  Set next_review = NOW() + 1 day
```

**Box Review Schedule:**

- Box 1: Every 1 day (daily practice)
- Box 2: Every 2 days
- Box 3: Every 7 days (weekly)

---

### Phase 5: Quiz System (Week 6-7)

**Dependencies:** Phase 4 complete
**Deliverables:**

- Quiz template creation
- Quiz taking interface
- Result scoring and storage
- Performance analytics

**Todos:**

1. `implement-quiz-creation` - POST /api/quizzes
2. `implement-quiz-taking` - Quiz session management
3. `implement-quiz-results` - Score calculation & storage
4. `implement-quiz-analytics` - Performance trends

**Effort:** 3-4 days

**Features:**

- Create quizzes from existing card sets
- Immediate feedback on answers
- Score calculation (percentage, time tracking)
- Attempt history and comparison
- Topic-based performance breakdown

---

### Phase 6: Frontend UI/UX (Week 7-9)

**Dependencies:** Phases 2-5 complete
**Deliverables:**

- Updated EJS templates with proper forms
- Responsive CSS styling (mobile-first)
- Client-side JavaScript for interactions
- Form validation and error handling

**Todos:**

1. `update-login-view` - Wire login form
2. `update-profile-view` - Profile editing interface
3. `update-entries-view` - Card management UI
4. `update-practice-view` - Practice mode interface
5. `update-quiz-view` - Quiz creation & taking interface
6. `add-css-styling` - Comprehensive CSS across all pages
7. `add-client-javascript` - Client-side logic and API calls

**Effort:** 5-6 days

**Design Notes:**

- Mobile-first responsive design
- Accessibility compliance (WCAG 2.1 AA)
- Loading states and error messages
- Progress indicators for sessions
- Dark/light theme support (optional)

---

### Phase 7: Testing (Week 9-10)

**Dependencies:** Phases 1-6 complete
**Deliverables:**

- Comprehensive test suite (80%+ coverage)
- Unit tests for business logic
- Integration tests for API endpoints
- End-to-end tests for user flows

**Todos:**

1. `setup-jest-testing` - Jest + Supertest configuration
2. `write-unit-tests` - Services, algorithms, utilities
3. `write-integration-tests` - API endpoints + DB
4. `write-e2e-tests` - Complete user workflows

**Effort:** 3-4 days

**Test Coverage Goals:**

- Overall: 80%+
- Unit: 90%+
- Critical paths (auth, practice): 95%+

**Test Types:**

- Unit tests for SRS algorithm, validation, utilities
- Integration tests for all API endpoints
- E2E tests for registration→login→practice→export→quiz
- Fixtures for test data management

---

### Phase 8: Deployment & DevOps (Week 10-11)

**Dependencies:** Phases 1-7 complete
**Deliverables:**

- GitHub Actions CI/CD pipeline
- Render deployment configuration
- Monitoring and logging setup
- Database backup strategy

**Todos:**

1. `setup-github-actions` - Automated testing & deployment
2. `configure-render-deployment` - Auto-deploy on push
3. `setup-monitoring-logging` - Error tracking, performance monitoring
4. `setup-database-backups` - Backup strategy and recovery

**Effort:** 2-3 days

**DevOps Stack:**

- GitHub Actions for CI/CD
- Render for hosting (auto-deploy from GitHub)
- Sentry (optional) for error tracking
- Render's built-in monitoring

---

### Phase 9: Documentation & Polish (Week 11-12)

**Dependencies:** Phases 1-8 complete
**Deliverables:**

- ✅ API documentation (done)
- ✅ Database schema documentation (done)
- User guide for all features
- Developer guide for contributors
- Project README with setup instructions

**Todos:**

1. `create-api-documentation` - ✅ Completed
2. `create-user-guide` - How-to guides for each feature
3. `create-developer-guide` - Setup, architecture, contribution
4. `setup-readme` - Quick start and project overview

**Effort:** 2-3 days

---

### Phase 10: Optional Enhancements (Week 12+)

**Dependencies:** MVP complete
**Potential Features:**

- Two-factor authentication
- Performance metrics dashboard
- Detailed SRS statistics and visualization
- API rate limiting
- Social features (sharing quizzes)
- Mobile app (React Native/Flutter)
- Offline mode with sync

**Todos:**

1. `add-two-factor-auth` - 2FA security enhancement
2. `add-performance-metrics` - Study trends & graphs
3. `add-spaced-repetition-stats` - Detailed SRS insights
4. `add-api-rate-limiting` - Abuse prevention

---

## Tech Stack Summary

### Frontend

- **Templating**: EJS 7.0.2
- **Styling**: CSS (responsive, mobile-first)
- **JavaScript**: Vanilla JS (no framework required initially)
- **HTTP Client**: Fetch API

### Backend

- **Runtime**: Node.js 18+
- **Framework**: Express.js 5.3.0
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcryptjs
- **Validation**: Joi
- **Environment**: dotenv
- **CORS**: cors middleware

### Database

- **Provider**: PostgreSQL on Render
- **Client**: pg (node-postgres)
- **Migrations**: Manual SQL scripts
- **GUI**: pgAdmin 4 (desktop)

### Development

- **Dev Server**: Nodemon 3.1.14
- **Testing**: Jest + Supertest
- **CI/CD**: GitHub Actions
- **Deployment**: Render

---

## Getting Started (Immediate Actions)

### Step 1: Local Development Setup (Today)

```bash
# Install dependencies
npm install

# Add new packages for database integration
npm install pg bcryptjs jsonwebtoken joi cors dotenv

# Create local .env file
cp .env.example .env

# Update .env with LOCAL database credentials
DATABASE_URL=postgresql://user:password@localhost:5432/flashcards_dev
JWT_SECRET=your-random-secret-string
```

### Step 2: Render PostgreSQL Setup (Day 1)

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Create PostgreSQL instance
3. Copy connection string to .env
4. Create database tables using schema from [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

### Step 3: pgAdmin Setup (Day 1)

1. Install pgAdmin 4
2. Add Render PostgreSQL connection with credentials
3. Verify you can view tables, run queries

### Step 4: Start Phase 1 Implementation (Day 2)

1. Create database connection module
2. Implement user registration endpoint
3. Test with Postman or curl
4. Verify data persists in Render PostgreSQL

---

## Recommended Development Workflow

### Daily Workflow

```bash
# 1. Pull latest changes
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Start dev server with auto-reload
npm run dev

# 4. Make changes, test in browser/Postman

# 5. Run tests
npm test

# 6. Commit and push
git add .
git commit -m "Add your feature description"
git push origin feature/your-feature-name

# 7. Create pull request on GitHub
# 8. Wait for GitHub Actions (tests) to pass
# 9. Merge to main
# 10. Render auto-deploys
```

### Testing Workflow

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/auth.test.js

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Database Operations

```bash
# Access Render DB via pgAdmin GUI (preferred for browsing)
# Open pgAdmin → Connect to Render PostgreSQL instance

# Or use psql CLI
psql "postgresql://flashcards_user:PASSWORD@host.render.com:5432/flashcards"

# Common queries
SELECT * FROM users;
SELECT * FROM practice_matrices WHERE user_id = 'xxx' AND next_review <= NOW();
TRUNCATE users CASCADE; -- Clear all data (dev only!)
```

---

## Success Criteria for MVP

### Phase 1 Complete ✓

- [x] PostgreSQL instance on Render provisioned
- [ ] Database schema created with all tables
- [ ] Environment variables configured locally and on Render
- [ ] pgAdmin can connect to Render database

### Phase 2 Complete ✓

- [ ] User registration working (POST /api/auth/register)
- [ ] User login working (POST /api/auth/login)
- [ ] JWT tokens issued and validated
- [ ] Profile endpoints functional (GET/PUT /api/profile)
- [ ] 80%+ test coverage for auth

### Phase 3 Complete ✓

- [ ] Card CRUD endpoints working (POST/GET/PUT/DELETE /api/cards)
- [ ] Export to JSON working (GET /api/cards/export)
- [ ] Import from JSON working (POST /api/cards/import)
- [ ] Filtering and pagination working

### Phase 4 Complete ✓

- [ ] SM-2 algorithm correctly implemented
- [ ] Practice sessions working (POST /api/practice/start)
- [ ] Next card selection correct (GET /api/practice/:id/card)
- [ ] Answer submission updates SRS matrix (POST /api/practice/:id/answer)

### Phase 5 Complete ✓

- [ ] Quiz creation working (POST /api/quizzes)
- [ ] Quiz taking working (POST /api/quizzes/:id/take)
- [ ] Results stored and calculated correctly
- [ ] Quiz history available

### Phase 6 Complete ✓

- [ ] All pages have proper HTML forms
- [ ] CSS styling applied to all pages
- [ ] Responsive design works on mobile, tablet, desktop
- [ ] Client-side JavaScript for forms and API calls working

### Phase 7 Complete ✓

- [ ] Unit tests for services (SRS, card, auth)
- [ ] Integration tests for all endpoints
- [ ] E2E tests for key user flows
- [ ] Coverage ≥ 80%
- [ ] All tests passing in GitHub Actions

### Phase 8 Complete ✓

- [ ] GitHub Actions pipeline passing
- [ ] Render deployment successful
- [ ] Auto-deploy on push working
- [ ] Monitoring/logging configured

### Phase 9 Complete ✓

- [ ] README.md complete
- [ ] API docs comprehensive
- [ ] User guide written
- [ ] Developer guide written

---

## Risk Mitigation

### Technical Risks

| Risk                        | Probability | Impact   | Mitigation                                         |
| --------------------------- | ----------- | -------- | -------------------------------------------------- |
| SRS algorithm bugs          | Medium      | High     | Comprehensive unit tests, test with real user data |
| Database performance issues | Low         | High     | Index planning, query optimization, monitoring     |
| JWT token security          | Low         | Critical | Use proven library, secure env vars, HTTPS         |
| Data loss                   | Low         | Critical | Render auto-backups, versioned migrations          |
| Render service outage       | Very Low    | High     | Disaster recovery plan, database exports           |

### Schedule Risks

| Risk                  | Probability | Impact | Mitigation                                  |
| --------------------- | ----------- | ------ | ------------------------------------------- |
| Underestimated effort | Medium      | High   | Buffer time, prioritize MVP features        |
| Dependency issues     | Low         | Medium | Pin versions, document setup, CI/CD testing |
| Testing lag           | Medium      | Medium | Write tests as you code, use fixtures       |

---

## Resource Requirements

### Skills Needed

- Node.js / Express.js development
- PostgreSQL / SQL
- Frontend HTML/CSS/JavaScript
- Testing frameworks (Jest)
- Git / GitHub

### Tools

- VS Code or preferred IDE
- Git
- Postman or curl (API testing)
- pgAdmin 4
- Terminal/CLI

### Time Commitment

- **MVP (Phases 1-6)**: 60-80 hours
- **Testing & Deployment (Phases 7-9)**: 30-40 hours
- **Optional Enhancements (Phase 10)**: 20-30 hours/feature
- **Total for MVP**: 90-120 hours (~10-12 weeks part-time)

---

## Communication & Progress Tracking

### Progress Tracking

- Todos are in session database (44 items, 10 phases)
- Each todo has status: pending, in_progress, done, blocked
- Update todo status as work completes
- Use git commits to mark checkpoints

### Key Milestones

- [x] Week 1: Phase 1 (Database)
- [ ] Week 2-3: Phase 2 (Auth)
- [ ] Week 3-4: Phase 3 (Cards)
- [ ] Week 4-6: Phase 4 (Practice)
- [ ] Week 6-7: Phase 5 (Quiz)
- [ ] Week 7-9: Phase 6 (UI)
- [ ] Week 9-10: Phase 7 (Testing)
- [ ] Week 10-11: Phase 8 (Deployment)
- [ ] Week 11-12: Phase 9 (Docs)

---

## Next Steps

1. **Immediately**: Review and approve this roadmap
2. **Today**: Set up Render PostgreSQL instance, test pgAdmin connection
3. **Day 2**: Begin Phase 1 - Database initialization
4. **Day 3**: Begin Phase 2 - Authentication endpoints
5. **Ongoing**: Update todo statuses, commit progress, run tests

---

## Questions & Support

Refer to the following documentation files:

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - Project layout
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database tables
- [API_ENDPOINTS.md](./API_ENDPOINTS.md) - API specification
- [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) - Testing approach
- [DEPLOYMENT_STRATEGY.md](./DEPLOYMENT_STRATEGY.md) - Deployment guide

**Good luck with the FlashCards project! 🚀**
