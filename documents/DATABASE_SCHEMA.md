# Database Schema for FlashCards

## Overview

This document defines the PostgreSQL database schema for the FlashCards application. The schema is designed to support user authentication, flashcard management, spaced repetition practice, and quiz tracking.

---

## Schema Diagram

```
┌─────────────────────┐
│      users          │
├─────────────────────┤
│ user_id (PK)        │
│ username (UNIQUE)   │
│ email (UNIQUE)      │
│ password_hash       │
│ full_name           │
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
    ┌──────┴──────┬──────────────────┬──────────────┐
    │             │                  │              │
    ▼             ▼                  ▼              ▼
┌──────────────┐ ┌────────────┐ ┌──────────┐ ┌─────────────────┐
│ flashcards   │ │   quizzes  │ │   quiz   │ │ practice_       │
│              │ │            │ │ questions│ │ matrices        │
├──────────────┤ ├────────────┤ ├──────────┤ ├─────────────────┤
│ card_id (PK) │ │ quiz_id(PK)│ │ quiz_q.. │ │ matrix_id (PK)  │
│ user_id (FK) │ │ user_id(FK)│ │ (PK)     │ │ user_id (FK)    │
│ question     │ │ name       │ │ quiz_id  │ │ card_id (FK)    │
│ answer       │ │ created_at │ │ card_id  │ │ review_count    │
│ category     │ │ updated_at │ │ order    │ │ correct_count   │
│ difficulty   │ └────────────┘ │ (FK)     │ │ last_reviewed   │
│ created_at   │                └──────────┘ │ next_review     │
│ updated_at   │                             │ ease_factor     │
└──────────────┘                             │ created_at      │
                                             │ updated_at      │
                                             └─────────────────┘
```

---

## Tables

### 1. `users`

Core user account information.

```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

**Columns:**

- `user_id`: Unique identifier (UUID)
- `username`: Login identifier, must be unique
- `email`: Contact email, must be unique
- `password_hash`: Bcrypt hash of password (never store plaintext)
- `full_name`: User's display name
- `created_at`: Account creation timestamp
- `updated_at`: Last profile update timestamp

**Notes:**

- Do NOT store passwords in plaintext
- Hash with bcryptjs (10+ rounds)
- Updated_at should be updated on profile changes

---

### 2. `flashcards`

Flashcard definitions (question-answer pairs).

```sql
CREATE TABLE flashcards (
  card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  difficulty INT CHECK (difficulty >= 1 AND difficulty <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX idx_flashcards_category ON flashcards(category, user_id);
```

**Columns:**

- `card_id`: Unique identifier (UUID)
- `user_id`: Owner of the card (FK to users)
- `question`: The front of the card (question/prompt)
- `answer`: The back of the card (answer/response)
- `category`: Organizational category (e.g., "Vocabulary", "Math")
- `difficulty`: Self-assessed difficulty 1-5 (1=easy, 5=hard)
- `created_at`: Card creation timestamp
- `updated_at`: Last modification timestamp

**Constraints:**

- `ON DELETE CASCADE`: When user is deleted, their cards are deleted
- Difficulty must be between 1 and 5

---

### 3. `leitner_boxes`

Leitner Box System tracking for each user-card pair.

```sql
CREATE TABLE leitner_boxes (
  box_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
  box_number INT NOT NULL CHECK (box_number >= 1 AND box_number <= 3),
  review_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  last_reviewed TIMESTAMP,
  next_review TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX idx_leitner_boxes_user_id ON leitner_boxes(user_id);
CREATE INDEX idx_leitner_boxes_box_number ON leitner_boxes(user_id, box_number);
CREATE INDEX idx_leitner_boxes_next_review ON leitner_boxes(user_id, next_review);
```

**Columns:**

- `box_id`: Unique identifier
- `user_id`: User who is studying this card
- `card_id`: The card being studied
- `box_number`: Current box (1=Daily, 2=Every 2 Days, 3=Weekly)
- `review_count`: Total number of times reviewed
- `correct_count`: Number of times answered correctly
- `last_reviewed`: Timestamp of most recent review
- `next_review`: When this card should be reviewed next
- `created_at`: When this card was added to boxes
- `updated_at`: Last update to any field

**Leitner Box System:**

The system uses 3 boxes with fixed review schedules:

| Box | Review Schedule | Purpose                       | Promotion | Demotion    |
| --- | --------------- | ----------------------------- | --------- | ----------- |
| 1   | Daily           | New cards & incorrect answers | 1 correct | N/A         |
| 2   | Every 2 days    | Medium difficulty             | 1 correct | 1 incorrect |
| 3   | Weekly          | Mastered cards                | -         | 1 incorrect |

**Flow Logic:**

```
Card Answered Correctly:
  If box_number < 3:
    box_number++
    next_review = NOW() + box_interval[box_number]

Card Answered Incorrectly:
  If box_number > 1:
    box_number = 1
    next_review = NOW() + 1 day
  Else:
    Stays in box 1
    next_review = NOW() + 1 day

Box Review Intervals:
  Box 1: Every 1 day (daily practice)
  Box 2: Every 2 days
  Box 3: Every 7 days (weekly)
```

**Notes:**

- UNIQUE constraint ensures one entry per user-card pair
- Index on `box_number` enables efficient "cards due in this box" queries
- Index on `next_review` enables efficient "cards due today" queries
- Simple, deterministic scheduling (no complex algorithms)
- All incorrect answers demote back to Box 1 (aggressive drilling of weak concepts)

---

### 4. `quizzes`

Quiz templates (sets of questions grouped for testing).

```sql
CREATE TABLE quizzes (
  quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);
```

**Columns:**

- `quiz_id`: Unique identifier
- `user_id`: Creator/owner of the quiz
- `name`: Quiz title (e.g., "Chapter 3 Vocab Quiz")
- `description`: Optional quiz description
- `created_at`: When quiz was created
- `updated_at`: Last modification

---

### 5. `quiz_questions`

Composition of quizzes (which cards belong to which quiz, and in what order).

```sql
CREATE TABLE quiz_questions (
  quiz_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quiz_questions_quiz_id ON quiz_questions(quiz_id, order_index);
CREATE INDEX idx_quiz_questions_card_id ON quiz_questions(card_id);
```

**Columns:**

- `quiz_question_id`: Unique identifier
- `quiz_id`: Which quiz this belongs to
- `card_id`: Which flashcard is included
- `order_index`: Position in the quiz (1, 2, 3, ...)
- `created_at`: When added to quiz

**Notes:**

- Allows cards to be reused across multiple quizzes
- Order_index determines question sequence
- Deleting a quiz cascades to delete all its questions

---

### 6. `quiz_results`

Results and scores from quiz attempts.

```sql
CREATE TABLE quiz_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  time_spent_seconds INT,
  taken_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX idx_quiz_results_quiz_id ON quiz_results(quiz_id);
CREATE INDEX idx_quiz_results_taken_at ON quiz_results(user_id, taken_at DESC);
```

**Columns:**

- `result_id`: Unique identifier for this attempt
- `quiz_id`: Which quiz was taken
- `user_id`: Who took the quiz
- `score`: Number of correct answers
- `total_questions`: Total questions in the quiz (for reference)
- `time_spent_seconds`: How long the quiz took
- `taken_at`: When the quiz was completed

**Usage:**

- Track user progress over time
- Compare attempts on same quiz
- Generate statistics and reports

---

### 7. `import_export_logs` (Optional)

Audit log for flashcard imports and exports.

```sql
CREATE TABLE import_export_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('import', 'export')),
  filename VARCHAR(255),
  card_count INT,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_import_export_logs_user_id ON import_export_logs(user_id, created_at DESC);
```

**Columns:**

- `log_id`: Unique identifier
- `user_id`: User who performed the action
- `action`: Either 'import' or 'export'
- `filename`: Name of the file involved
- `card_count`: How many cards were affected
- `status`: 'success', 'partial', 'failed'
- `error_message`: If failed, what went wrong
- `created_at`: When the action occurred

**Usage:**

- Audit trail for data changes
- Troubleshooting import failures
- Usage analytics

---

## Constraints & Relationships

### Foreign Keys (Referential Integrity)

```sql
-- Flashcards belong to users
ALTER TABLE flashcards
ADD CONSTRAINT fk_flashcards_user
FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- Practice matrices reference user and card
ALTER TABLE practice_matrices
ADD CONSTRAINT fk_practice_matrices_user
FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE practice_matrices
ADD CONSTRAINT fk_practice_matrices_card
FOREIGN KEY (card_id) REFERENCES flashcards(card_id) ON DELETE CASCADE;

-- Quizzes belong to users
ALTER TABLE quizzes
ADD CONSTRAINT fk_quizzes_user
FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- Quiz questions reference quizzes and cards
ALTER TABLE quiz_questions
ADD CONSTRAINT fk_quiz_questions_quiz
FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;

ALTER TABLE quiz_questions
ADD CONSTRAINT fk_quiz_questions_card
FOREIGN KEY (card_id) REFERENCES flashcards(card_id) ON DELETE CASCADE;

-- Quiz results reference quizzes and users
ALTER TABLE quiz_results
ADD CONSTRAINT fk_quiz_results_quiz
FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE;

ALTER TABLE quiz_results
ADD CONSTRAINT fk_quiz_results_user
FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
```

### Cascade Delete Behavior

- **User deleted** → All related cards, quizzes, practice matrices, results deleted
- **Card deleted** → Removed from all quizzes and practice matrices
- **Quiz deleted** → All its results are deleted (for history)

---

## Sample Queries

### Get cards due for practice today (Box 1 - Daily)

```sql
SELECT f.*
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.box_number = 1
ORDER BY lb.next_review ASC
LIMIT 10;
```

### Get cards due for Box 2 (Every 2 days)

```sql
SELECT f.*
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.box_number = 2
  AND lb.next_review <= NOW()
ORDER BY lb.next_review ASC;
```

### Get mastered cards (Box 3)

```sql
SELECT f.*
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.box_number = 3
ORDER BY lb.next_review ASC;
```

### Get user's study statistics with Leitner boxes

```sql
SELECT
  COUNT(DISTINCT CASE WHEN lb.box_number = 1 THEN lb.card_id END) as box1_count,
  COUNT(DISTINCT CASE WHEN lb.box_number = 2 THEN lb.card_id END) as box2_count,
  COUNT(DISTINCT CASE WHEN lb.box_number = 3 THEN lb.card_id END) as box3_count,
  COUNT(DISTINCT lb.card_id) as total_cards,
  ROUND(100.0 * SUM(lb.correct_count)::numeric /
        NULLIF(SUM(lb.review_count), 0), 2) as accuracy_percent,
  MAX(lb.last_reviewed) as last_studied
FROM leitner_boxes lb
WHERE lb.user_id = $1;
```

### Get cards due for review today across all boxes

```sql
SELECT
  f.card_id,
  f.question,
  lb.box_number,
  lb.next_review,
  CASE
    WHEN lb.box_number = 1 THEN 'Daily'
    WHEN lb.box_number = 2 THEN 'Every 2 Days'
    WHEN lb.box_number = 3 THEN 'Weekly'
  END as box_label
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.next_review <= NOW()
ORDER BY lb.box_number ASC, lb.next_review ASC;
```

---

## Initial Setup Script

Save as `scripts/init-db.sql` and run to initialize database:

```sql
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create all tables (copy table definitions from above)
-- ...

-- Insert sample data (optional, for testing)
INSERT INTO users (username, email, password_hash, full_name) VALUES
  ('demo', 'demo@example.com', '$2a$10$demo_hash', 'Demo User');
```

Run with:

```bash
psql postgresql://user:password@host/database < scripts/init-db.sql
```

---

## Backup & Recovery

### Manual Backup

```bash
pg_dump postgresql://user:password@host:5432/database > backup.sql
```

### Restore from Backup

```bash
psql postgresql://user:password@host:5432/database < backup.sql
```

### Render Automated Backups

- Enabled by default
- 7-day retention on free plan
- Available in Render dashboard

---

## Performance Tuning

### Recommended Indexes

Already included in table definitions above. Key ones:

- `idx_flashcards_user_id`: Fast lookup of user's cards
- `idx_practice_matrices_next_review`: Fast query for cards due for review
- `idx_quiz_results_taken_at`: Time-series queries

### Statistics & Analysis

```sql
-- Update statistics for query planner
ANALYZE;

-- Check index usage
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```
