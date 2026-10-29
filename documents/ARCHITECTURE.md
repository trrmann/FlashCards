# FlashCards Architecture & System Design

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                            │
│  (Browser - EJS Templates, HTML, CSS, Client-side JS)      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS API LAYER                         │
│  - Route handlers                                            │
│  - Middleware (auth, validation, error handling)            │
│  - Session management                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA ACCESS LAYER                         │
│  - PostgreSQL client (pg library)                           │
│  - Query builders / ORM                                      │
│  - Connection pooling                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  RENDER POSTGRESQL DB                        │
│  - User accounts & authentication                           │
│  - Flashcard definitions                                    │
│  - Practice matrices (SRS tracking)                         │
│  - Quiz templates and results                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Frontend (Client Layer)

**Views (EJS Templates)**
- **Layout**: Header (nav) → Main Content → Footer
- **Navigation Structure**:
  - Unauthenticated: Home → Login
  - Authenticated: Home → Practice → Quiz → Entries → Profile → Logout

**Page Components**

| Page | Purpose | Features |
|------|---------|----------|
| Home | Landing page | Welcome, intro, login link |
| Login | Authentication | Username/password form |
| Profile | User settings | Update password, name, preferences |
| Entries | Card management | CRUD for flashcards, import/export |
| Practice | Study mode | Configurable practice algorithm, SRS |
| Quiz | Assessment | Quiz taking, score tracking |
| Logout | Cleanup | Session termination |

**Responsive Design**
- Core styles (core.css) - baseline
- Mobile-first responsive breakpoints:
  - Mobile (mobile.css)
  - Tablet (tablet.css)
  - Desktop (desktop.css)
  - Laptop (laptop.css)

---

### 2. Backend (Express Server)

**Architecture Pattern**: MVC-inspired with clear separation

```
Server Structure:
├── Routes Layer (server.js)
├── Controllers (Planned)
│   ├── AuthController
│   ├── CardController
│   ├── PracticeController
│   ├── QuizController
│   └── UserController
├── Services Layer (Planned)
│   ├── AuthService
│   ├── CardService
│   ├── PracticeService
│   └── QuizService
├── Models Layer (Planned)
│   ├── User
│   ├── FlashCard
│   ├── PracticeMatrix
│   └── Quiz
├── Middleware (Planned)
│   ├── Authentication
│   ├── Error Handling
│   └── Validation
└── Utils
    └── appSiteData (page metadata)
```

**Key Middleware & Concerns**
- **Session Management**: JWT tokens or server-side sessions
- **Authentication**: Protect routes requiring login
- **Validation**: Input sanitization & validation
- **Error Handling**: Graceful error responses
- **CORS**: Cross-origin requests (if applicable)

---

### 3. Data Layer (Database)

**PostgreSQL on Render**

**Access Methods**
1. **Primary**: Node.js `pg` library for application queries
2. **Admin/Monitoring**: pgAdmin 4 (local desktop app)
   - Connection: Render PostgreSQL URL
   - For schema inspection, data export, manual queries

**Schema Organization**

```sql
-- Core Authentication & User Management
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Flashcard Definitions
CREATE TABLE flashcards (
  card_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  difficulty INT CHECK (difficulty >= 1 AND difficulty <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Leitner Box System Tracking
-- Box 1: Daily (new & incorrect cards)
-- Box 2: Every 2 days (medium)
-- Box 3: Weekly (mastered)
CREATE TABLE leitner_boxes (
  box_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  card_id UUID REFERENCES flashcards(card_id) ON DELETE CASCADE,
  box_number INT CHECK (box_number >= 1 AND box_number <= 3),
  review_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  last_reviewed TIMESTAMP,
  next_review TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- Quiz Templates
CREATE TABLE quizzes (
  quiz_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Quiz Composition (which cards in which quiz)
CREATE TABLE quiz_questions (
  quiz_question_id UUID PRIMARY KEY,
  quiz_id UUID REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  card_id UUID REFERENCES flashcards(card_id) ON DELETE CASCADE,
  order_index INT NOT NULL
);

-- Quiz Results (tracking quiz attempts)
CREATE TABLE quiz_results (
  result_id UUID PRIMARY KEY,
  quiz_id UUID REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  taken_at TIMESTAMP DEFAULT NOW()
);

-- Import/Export Audit (optional)
CREATE TABLE import_export_logs (
  log_id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  action VARCHAR(50), -- 'import', 'export'
  filename VARCHAR(255),
  card_count INT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Data Flow

### Authentication Flow
```
User Input (login.ejs)
    ↓
POST /api/auth/login
    ↓
AuthController.login()
    ↓
AuthService.authenticate()
    ↓
Check credentials in DB
    ↓
Generate JWT Token
    ↓
Send token to client (cookie/localStorage)
    ↓
Client stores session
```

### Practice Session Flow (Leitner System)
```
User visits /practice
    ↓
Client requests GET /api/practice/next-card
    ↓
PracticeController.getNextCard()
    ↓
PracticeService.selectCard() 
    (prioritizes Box 1 cards, then Box 2/3 if due)
    ↓
Return card question
    ↓
User answers
    ↓
POST /api/practice/submit-answer
    ↓
PracticeService.updateLeitnerBox()
    If Correct:
      Promote: box_number++
      Set next_review per box schedule
    If Incorrect:
      Demote: box_number = 1
      Set next_review = NOW() + 1 day
    ↓
Update leitner_boxes table
    ↓
Return feedback & progress
```

**Box Schedule:**
- Box 1 (Daily): Review every 1 day
- Box 2 (Every 2 days): Review every 2 days
- Box 3 (Weekly): Review every 7 days

### Quiz Flow
```
User creates/selects quiz on /quiz
    ↓
POST /api/quiz/create or GET /api/quiz/:id
    ↓
QuizController returns quiz_questions
    ↓
Client displays questions one-by-one
    ↓
User submits answers
    ↓
POST /api/quiz/:id/submit
    ↓
QuizService.scoreQuiz()
    ↓
Insert quiz_results record
    ↓
Display results/statistics
```

### Import/Export Flow
```
User on /entries
    ↓
GET /api/entries/export (or click Export button)
    ↓
CardService.exportUserCards()
    ↓
Generate JSON file
    ↓
Download to client
    ↓
--- OR ---
User uploads file
    ↓
POST /api/entries/import (multipart/form-data)
    ↓
CardService.importCards()
    ↓
Parse JSON, validate, insert into DB
    ↓
Log in import_export_logs
    ↓
Return import summary
```

---

## Security Considerations

1. **Authentication**: JWT tokens with secure, httpOnly cookies
2. **Password Storage**: bcryptjs with salt rounds (10+)
3. **Input Validation**: Server-side validation before DB queries
4. **SQL Injection Prevention**: Parameterized queries via pg library
5. **CORS**: Restrict cross-origin requests
6. **Rate Limiting**: Prevent brute-force attacks (especially login)
7. **HTTPS**: Required in production (Render handles this)
8. **Environment Variables**: Sensitive data in .env, never committed
9. **User Isolation**: Row-level security (queries filter by user_id)

---

## Performance Considerations

1. **Database Indexes**:
   - PK on all tables
   - UNIQUE on (username, email, user_id+card_id in matrices)
   - Foreign keys for referential integrity

2. **Connection Pooling**: Use pg with pooling to reuse DB connections

3. **Caching**: Consider Redis for session storage and recent cards

4. **Query Optimization**:
   - Pagination for large card lists
   - Lazy-load quiz results
   - Index on `user_id` for fast user isolation

5. **Asset Optimization**:
   - Minify CSS in production
   - Bundle client-side JS (if any)
   - CDN for static files (optional)

---

## Scalability Plan

### Phase 1 (MVP)
- Single-instance Node.js server
- Single Render PostgreSQL database
- Local session storage (memory or cookies)

### Phase 2 (Growth)
- Add Redis for session/cache layer
- Database read replicas (if traffic warrants)
- Load balancing (if multi-instance needed)

### Phase 3 (Scale)
- Microservices for quiz/practice engines
- Message queues for async processing
- CDN for static assets

---

## Error Handling Strategy

```javascript
// Middleware approach
app.use(errorHandler); // Catches all errors

// Pattern
try {
  // Logic
} catch (error) {
  logger.error(error);
  res.status(500).json({ 
    error: 'User-friendly message',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

---

## Deployment Architecture

See `DEPLOYMENT_STRATEGY.md` for Render-specific setup:
- Environment variables configuration
- Database provisioning
- CI/CD pipeline
- Monitoring & logging

