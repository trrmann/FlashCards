CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Identity tables (users, roles, rights, session) are owned by the IAM
-- schema (iam-postgres-schema.sql), which must be bootstrapped first.

CREATE TABLE IF NOT EXISTS user_rights (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  right_key VARCHAR(100) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, right_key)
);

CREATE TABLE IF NOT EXISTS lessons (
  lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_name ON lessons(user_id, name);

CREATE TABLE IF NOT EXISTS flashcards (
  flashcard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  difficulty INT CHECK (difficulty >= 1 AND difficulty <= 5),
  class VARCHAR(255),
  lesson VARCHAR(255),
  lesson_id UUID REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(user_id) ON DELETE CASCADE,
  difficulty_score DECIMAL(3, 2) DEFAULT 3.00 CHECK (difficulty_score >= 1.0 AND difficulty_score <= 5.0),
  last_difficulty_update TIMESTAMP DEFAULT NOW(),
  difficulty_calc_base VARCHAR(10) DEFAULT 'individual' CHECK (difficulty_calc_base IN ('individual', 'shared')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_category ON flashcards(category, user_id);

CREATE TABLE IF NOT EXISTS public_card_removals (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS flashcard_shares (
  share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  recipient_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  shared_at TIMESTAMP NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  revoked_at TIMESTAMP,
  UNIQUE(owner_id, recipient_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS leitner_boxes (
  box_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  box_number INT NOT NULL CHECK (box_number >= 1 AND box_number <= 3),
  review_count INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  last_reviewed TIMESTAMP,
  next_review TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_leitner_boxes_user_id ON leitner_boxes(user_id);
CREATE INDEX IF NOT EXISTS idx_leitner_boxes_box_number ON leitner_boxes(user_id, box_number);
CREATE INDEX IF NOT EXISTS idx_leitner_boxes_next_review ON leitner_boxes(user_id, next_review);

CREATE TABLE IF NOT EXISTS flashcard_leitner_progress (
  id SERIAL PRIMARY KEY,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  current_box INT NOT NULL DEFAULT 1 CHECK (current_box IN (1, 2, 3)),
  last_reviewed TIMESTAMP,
  next_review TIMESTAMP DEFAULT NOW(),
  times_correct INT DEFAULT 0,
  times_incorrect INT DEFAULT 0,
  none_of_above_count INT DEFAULT 0,
  session_streak INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flashcard_id, user_id)
);

CREATE TABLE IF NOT EXISTS practice_history (
  id SERIAL PRIMARY KEY,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  leitner_box INT NOT NULL CHECK (leitner_box IN (1, 2, 3)),
  correct BOOLEAN NOT NULL,
  response_time_ms INT,
  class VARCHAR(255),
  lesson VARCHAR(255),
  category VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_card_attempts (
  id SERIAL PRIMARY KEY,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_start_time TIMESTAMP NOT NULL,
  attempt_number INT NOT NULL CHECK (attempt_number >= 1),
  was_correct BOOLEAN NOT NULL,
  response_time_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_card ON session_card_attempts(user_id, flashcard_id, session_start_time);

CREATE TABLE IF NOT EXISTS difficulty_history (
  id SERIAL PRIMARY KEY,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  old_score DECIMAL(3, 2),
  new_score DECIMAL(3, 2),
  calculation_basis VARCHAR(255),
  sample_size INT,
  success_rate DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_difficulty_history ON difficulty_history(flashcard_id, created_at);

CREATE TABLE IF NOT EXISTS quizzes (
  quiz_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  quiz_question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id, order_index);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_card_id ON quiz_questions(card_id);

CREATE TABLE IF NOT EXISTS quiz_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  total_questions INT NOT NULL,
  correct_answers INT NOT NULL,
  taken_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz_id ON quiz_results(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_taken_at ON quiz_results(user_id, taken_at DESC);

CREATE TABLE IF NOT EXISTS import_export_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('IMPORT', 'EXPORT')),
  file_name VARCHAR(255),
  cards_processed INT DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_export_logs_user_id ON import_export_logs(user_id, created_at DESC);
