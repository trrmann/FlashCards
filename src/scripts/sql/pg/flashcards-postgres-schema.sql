-- FlashCards application domain: its own PostgreSQL schema.
-- The app adapter connects with search_path = flashcards, public. Identity tables
-- live in the iam schema, owned by the IAM. Since phase 3d there is no link at all:
-- user_id columns hold the IAM's user ids without foreign keys, and a deleted user's rows
-- are removed when the IAM's 'user.deleted' notice arrives (UserDataService).
-- Created only when missing: CREATE SCHEMA IF NOT EXISTS checks the database-level CREATE right even
-- when the schema exists, and FlashCards' own login (flashcards_svc, from iam-provision) doesn't have it.
DO $create_flashcards_schema$
BEGIN
  IF to_regnamespace('flashcards') IS NULL THEN
    CREATE SCHEMA flashcards;
  END IF;
END
$create_flashcards_schema$;

-- One-time move of this domain's tables out of the shared public schema
-- (IAM phase 1). Moves only tables still in public and not yet in flashcards;
-- data, indexes, constraints, and foreign keys move with each table.
DO $move_flashcards_tables$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lessons', 'media', 'flashcards', 'flashcard_options', 'public_card_removals', 'flashcard_shares', 'leitner_boxes', 'flashcard_leitner_progress', 'practice_history', 'session_card_attempts', 'difficulty_history', 'quizzes', 'quiz_questions', 'quiz_results', 'import_export_logs'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('flashcards.' || t) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA flashcards', t);
    END IF;
  END LOOP;
END
$move_flashcards_tables$;

-- Drop empty leftover copies in public (incident of 2026-11-04: a server from before the move
-- recreated empty app tables in public after they had moved to flashcards). A public table is
-- dropped only when its moved twin exists in flashcards, it holds no rows, and nothing outside
-- public references it; CASCADE then removes only foreign keys from other public leftovers.
-- Does nothing on a clean database.
DO $drop_public_flashcards_leftovers$
DECLARE
  t TEXT;
  has_data BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ARRAY['flashcard_options', 'flashcard_shares', 'public_card_removals', 'flashcard_leitner_progress', 'practice_history', 'session_card_attempts', 'difficulty_history', 'quiz_results', 'quiz_questions', 'quizzes', 'import_export_logs', 'leitner_boxes', 'media', 'flashcards', 'lessons'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL OR to_regclass('flashcards.' || t) IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', t) INTO has_data;
    CONTINUE WHEN has_data;
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace cn ON cn.oid = cl.relnamespace
      WHERE con.contype = 'f' AND con.confrelid = to_regclass('public.' || t) AND cn.nspname <> 'public'
    );
    EXECUTE format('DROP TABLE public.%I CASCADE', t);
    RAISE NOTICE 'Dropped empty leftover table public.%', t;
  END LOOP;
END
$drop_public_flashcards_leftovers$;

CREATE TABLE IF NOT EXISTS lessons (
  lesson_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lessons_user_id ON lessons(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_name ON lessons(user_id, name);

CREATE TABLE IF NOT EXISTS flashcards (
  flashcard_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  difficulty INT CHECK (difficulty >= 1 AND difficulty <= 5),
  class VARCHAR(255),
  lesson VARCHAR(255),
  lesson_id UUID REFERENCES lessons(lesson_id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  difficulty_score DECIMAL(3, 2) DEFAULT 3.00 CHECK (difficulty_score >= 1.0 AND difficulty_score <= 5.0),
  last_difficulty_update TIMESTAMP DEFAULT NOW(),
  difficulty_calc_base VARCHAR(10) DEFAULT 'individual' CHECK (difficulty_calc_base IN ('individual', 'shared')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_category ON flashcards(category, user_id);

CREATE TABLE IF NOT EXISTS media (
  media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'audio')),
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id);

-- Unified media-block model: every content slot has a form and optional media.
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS lang VARCHAR(16) NOT NULL DEFAULT 'en-US';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_lang VARCHAR(16);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_mode VARCHAR(10) NOT NULL DEFAULT 'choice';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS question_form VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_form VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS question_media_id UUID REFERENCES media(media_id) ON DELETE SET NULL;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_media_id UUID REFERENCES media(media_id) ON DELETE SET NULL;

-- One-time migration of v1 inline media columns into the media table.
-- Runs only while the legacy columns exist; the DROPs make it a no-op after.
DO $migrate_v1_media$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flashcards' AND column_name = 'question_image'
  ) THEN
    INSERT INTO media (user_id, kind, data)
    SELECT created_by, 'image', question_image FROM flashcards
    WHERE question_image IS NOT NULL AND question_media_id IS NULL;

    UPDATE flashcards f
    SET question_media_id = m.media_id, question_form = 'image'
    FROM media m
    WHERE f.question_image IS NOT NULL AND f.question_media_id IS NULL
      AND m.user_id = f.created_by AND m.kind = 'image' AND m.data = f.question_image;

    INSERT INTO media (user_id, kind, data)
    SELECT created_by, 'audio', question_audio FROM flashcards
    WHERE question_audio IS NOT NULL AND question_media_id IS NULL;

    UPDATE flashcards f
    SET question_media_id = m.media_id, question_form = 'audio'
    FROM media m
    WHERE f.question_audio IS NOT NULL AND f.question_media_id IS NULL
      AND m.user_id = f.created_by AND m.kind = 'audio' AND m.data = f.question_audio;

    INSERT INTO media (user_id, kind, data)
    SELECT created_by, 'image', answer_image FROM flashcards
    WHERE answer_image IS NOT NULL AND answer_media_id IS NULL;

    UPDATE flashcards f
    SET answer_media_id = m.media_id, answer_form = 'image'
    FROM media m
    WHERE f.answer_image IS NOT NULL AND f.answer_media_id IS NULL
      AND m.user_id = f.created_by AND m.kind = 'image' AND m.data = f.answer_image;

    ALTER TABLE flashcards DROP COLUMN question_image;
    ALTER TABLE flashcards DROP COLUMN answer_image;
    ALTER TABLE flashcards DROP COLUMN question_audio;
  END IF;
END
$migrate_v1_media$;

ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS flashcard_options (
  option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_options_card ON flashcard_options(flashcard_id, sort_order);

ALTER TABLE flashcard_options ADD COLUMN IF NOT EXISTS option_form VARCHAR(10) NOT NULL DEFAULT 'text';
ALTER TABLE flashcard_options ADD COLUMN IF NOT EXISTS option_media_id UUID REFERENCES media(media_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public_card_removals (
  user_id UUID NOT NULL,
  flashcard_id UUID NOT NULL REFERENCES flashcards(flashcard_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, flashcard_id)
);

CREATE TABLE IF NOT EXISTS flashcard_shares (
  share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
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
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('IMPORT', 'EXPORT')),
  file_name VARCHAR(255),
  cards_processed INT DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_export_logs_user_id ON import_export_logs(user_id, created_at DESC);
-- Backups run by a service account (an app token, iam-service MIGRATION.md L12) have no user: the account is
-- recorded as `<app>/<name>` instead, so it is never taken for an orphaned user.
ALTER TABLE import_export_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE import_export_logs ADD COLUMN IF NOT EXISTS service_account VARCHAR(160);

-- ---------------------------------------------------------------------------
-- IAM phase 3c: FlashCards' own per-user data and sessions live in this schema,
-- so FlashCards needs no access to iam tables except the users foreign key.
-- ---------------------------------------------------------------------------

-- Per-user settings that belong to FlashCards (they used to be columns of iam.users).
-- On first creation, the values still in iam.users are copied once, when readable.
DO $create_user_settings$
BEGIN
  IF to_regclass('flashcards.user_settings') IS NULL THEN
    CREATE TABLE flashcards.user_settings (
      user_id UUID PRIMARY KEY,
      last_page_visited VARCHAR(255) NOT NULL DEFAULT '/',
      storage_max_bytes BIGINT NOT NULL DEFAULT 26214400,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    IF has_table_privilege('iam.users', 'SELECT')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'iam' AND table_name = 'users' AND column_name = 'storage_max_bytes')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'iam' AND table_name = 'users' AND column_name = 'last_page_visited') THEN
      INSERT INTO flashcards.user_settings (user_id, last_page_visited, storage_max_bytes)
      SELECT user_id, last_page_visited, storage_max_bytes FROM iam.users;
    END IF;
  END IF;
END
$create_user_settings$;

-- Session store (connect-pg-simple). On first creation, live sessions are copied once from
-- iam.session, so nobody is signed out by the move. Transient: not part of backups.
DO $create_session_table$
BEGIN
  IF to_regclass('flashcards.session') IS NULL THEN
    CREATE TABLE flashcards.session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP NOT NULL
    );
    CREATE INDEX "IDX_flashcards_session_expire" ON flashcards.session (expire);
    IF to_regclass('iam.session') IS NOT NULL AND has_table_privilege('iam.session', 'SELECT') THEN
      INSERT INTO flashcards.session (sid, sess, expire)
      SELECT sid, sess, expire FROM iam.session WHERE expire > NOW();
    END IF;
  END IF;
END
$create_session_table$;

-- Phase 3d (owner decision): no foreign keys to iam.users. Drop the ones earlier versions created;
-- found through the catalog, which needs no rights on the iam schema. Does nothing once done.
DO $drop_user_foreign_keys$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT cl.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE con.contype = 'f' AND n.nspname = 'flashcards'
      AND con.confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
                            WHERE ns.nspname = 'iam' AND c.relname = 'users')
  LOOP
    EXECUTE format('ALTER TABLE flashcards.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END
$drop_user_foreign_keys$;
