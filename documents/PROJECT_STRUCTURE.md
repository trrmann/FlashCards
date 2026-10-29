# FlashCards Project Structure

## Overview
FlashCards is an Express.js-based web application for studying flashcards. The project aims to help users practice and quiz themselves using customizable study matrices with PostgreSQL backend storage.

**Tech Stack:**
- **Frontend:** EJS templates, HTML, CSS (responsive design)
- **Backend:** Node.js with Express.js v5.3.0
- **Database:** PostgreSQL (Render - planned)
- **Dev Tools:** Nodemon for development

---

## Directory Structure

```
FlashCards/
├── documents/                  # Project documentation (this folder)
│   ├── PROJECT_STRUCTURE.md   # This file
│   ├── ARCHITECTURE.md         # System architecture and design
│   ├── DATABASE_SCHEMA.md      # Database design
│   ├── API_ENDPOINTS.md        # API documentation
│   ├── TESTING_STRATEGY.md     # Testing approach
│   └── DEPLOYMENT_STRATEGY.md  # Deployment guide
├── public/                     # Static assets
│   ├── css/
│   │   ├── styles.css         # Main stylesheet
│   │   ├── core.css           # Core styles
│   │   ├── mobile.css         # Mobile responsive
│   │   ├── tablet.css         # Tablet responsive
│   │   ├── desktop.css        # Desktop responsive
│   │   └── laptop.css         # Laptop responsive
│   └── images/                # Image assets
├── src/                        # Source code
│   ├── js/
│   │   ├── appSiteData.js     # Export wrapper
│   │   └── modules/
│   │       └── appSiteData.mjs # Site data class (page titles, names)
│   └── views/                  # EJS templates
│       ├── home.ejs           # Home page
│       ├── login.ejs          # Login form
│       ├── profile.ejs        # User profile
│       ├── entries.ejs        # Flashcard entries management
│       ├── practice.ejs       # Practice mode
│       ├── quiz.ejs           # Quiz mode
│       ├── logout.ejs         # Logout page
│       └── partials/
│           ├── header.ejs     # Navigation header
│           └── footer.ejs     # Page footer
├── server.js                   # Express server entry point
├── package.json               # Project dependencies
├── nodemon.json               # Nodemon configuration
└── .env                       # Environment variables (not committed)
```

---

## Current Components

### Server (server.js)
- Express application setup
- Static middleware for public assets
- EJS view engine configuration
- Route definitions for 7 main pages
- Error handling (async route handlers)

### Routes
| Route | Purpose | Status |
|-------|---------|--------|
| `GET /` | Home page | ✅ Defined |
| `GET /login` | User login | ✅ Defined |
| `GET /profile` | User profile management | ✅ Defined |
| `GET /entries` | Manage flashcard entries | ✅ Defined |
| `GET /practice` | Practice mode | ✅ Defined |
| `GET /quiz` | Quiz mode | ✅ Defined |
| `GET /logout` | User logout | ✅ Defined |

### Data Models (Planned)

#### User
```
- user_id (UUID, PK)
- username (VARCHAR, UNIQUE)
- email (VARCHAR, UNIQUE)
- password_hash (VARCHAR)
- full_name (VARCHAR)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### FlashCard
```
- card_id (UUID, PK)
- user_id (UUID, FK)
- question (TEXT)
- answer (TEXT)
- category (VARCHAR)
- difficulty (INT: 1-5)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### PracticeMatrix
```
- matrix_id (UUID, PK)
- user_id (UUID, FK)
- card_id (UUID, FK)
- review_count (INT)
- correct_count (INT)
- last_reviewed (TIMESTAMP)
- next_review (TIMESTAMP)
- ease_factor (FLOAT)
```

#### Quiz
```
- quiz_id (UUID, PK)
- user_id (UUID, FK)
- name (VARCHAR)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### QuizQuestion
```
- quiz_question_id (UUID, PK)
- quiz_id (UUID, FK)
- card_id (UUID, FK)
- order (INT)
```

#### QuizResult
```
- result_id (UUID, PK)
- quiz_id (UUID, FK)
- user_id (UUID, FK)
- score (INT)
- total_questions (INT)
- taken_at (TIMESTAMP)
```

---

## Technology Dependencies

### Production Dependencies
- **express** (v5.3.0) - Web framework
- **ejs** (v7.0.2) - Templating engine

### Development Dependencies
- **nodemon** (v3.1.14) - Auto-restart server during development

### Planned Dependencies
- **pg** or **postgres** - PostgreSQL client
- **bcryptjs** - Password hashing
- **jsonwebtoken** (JWT) - Authentication tokens
- **dotenv** - Environment variable management
- **joi** - Data validation
- **cors** - Cross-Origin Resource Sharing

---

## Running the Project

### Development
```bash
npm install
npm run dev          # Runs with nodemon
```

### Production
```bash
npm install --production
npm start            # Runs server.js
```

### Environment
- Default port: 3000 (configurable via `PORT` env var)
- Environment: Set via `NODE_ENV` (defaults to 'production')

---

## Future Development Areas

### Phase 1: Authentication & User Management
- [ ] Database setup and connection
- [ ] User registration/login endpoints
- [ ] Session/JWT management
- [ ] Password hashing and security

### Phase 2: Flashcard Management
- [ ] Create/Read/Update/Delete flashcards
- [ ] Category organization
- [ ] Difficulty ratings
- [ ] File import/export (JSON)

### Phase 3: Practice System
- [ ] Practice mode with configurable matrix
- [ ] Spaced repetition algorithm (SRS)
- [ ] Progress tracking

### Phase 4: Quiz System
- [ ] Quiz creation from question sets
- [ ] Quiz taking interface
- [ ] Result tracking and analytics

### Phase 5: Additional Features
- [ ] pgAdmin integration
- [ ] Export/Import functionality
- [ ] User statistics and progress reporting
- [ ] Responsive UI improvements

---

## Known Issues
- Login and profile forms missing form tags
- No CSS styling currently (framework in place)
- All routes are GET, no POST/PUT/DELETE implementation
- No database integration yet
- No authentication logic

