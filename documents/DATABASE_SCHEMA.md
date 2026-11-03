# Database Schema for FlashCards

The schema is defined in two idempotent SQL files. They are the source of truth; this
document summarizes them.

| File                                                | Owner adapter                | Contents                                                                                           |
| --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/scripts/sql/pg/iam-postgres-schema.sql`        | `IdentityManagementDatabase` | `users`, `roles`, `rights`, `role_rights`, `user_roles`, `session`; seeds roles `admin` and `user` |
| `src/scripts/sql/pg/flashcards-postgres-schema.sql` | `FlashCardsDatabase`         | All application tables (below)                                                                     |

Both adapters connect to the **same PostgreSQL database** with the same credentials, and all
tables live in the `public` schema. The split is about ownership and bootstrap order, not
physical separation. (`DB_SCHEMA` in `.env.example` is not read by the code.)

## Bootstrap and migrations

There is no migration runner. On every server start, `Server.initializeDatabase()`:

1. connects (`IdentityManagementDatabase.initializeDatabaseConnection`),
2. runs every statement of the IAM schema file,
3. checks that `users` exists, then runs every statement of the app schema file.

Every statement is idempotent (`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`, and guarded `DO $$ … $$` blocks). When a statement fails, the
remaining statements still run, and then bootstrap throws. Startup logs the error and the
server keeps running.

Schema changes are made by **appending** idempotent statements to the schema file.
For example, the v1 media migration moved the inline `question_image`/`answer_image`/`question_audio`
columns into `media` inside a guarded `DO $migrate_v1_media$` block.

Statements must appear after the objects they depend on: a fresh database executes the file top to bottom
exactly once. For example, an `ALTER TABLE x ADD COLUMN` must come after `CREATE TABLE IF NOT EXISTS x`.

## Entity overview

```text
users ─┬─< user_roles >─ roles ─< role_rights >─ rights          (IAM)
       ├─< user_rights
       ├─< media
       ├─< flashcards ─┬─< flashcard_options
       │               ├─< flashcard_shares (owner_id, recipient_id → users)
       │               ├─< public_card_removals
       │               ├─< flashcard_leitner_progress
       │               ├─< practice_history
       │               ├─< session_card_attempts
       │               ├─< difficulty_history
       │               └─< quiz_questions >─ quizzes
       ├─< quizzes ─< quiz_results
       ├─< lessons            (legacy; not used by the routes)
       ├─< leitner_boxes      (legacy; superseded by flashcard_leitner_progress)
       └─< import_export_logs
session                       (express-session store)
```

---

## IAM tables

### `users`

| Column                                        | Type         | Notes                                                          |
| --------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `user_id`                                     | UUID PK      | `gen_random_uuid()`                                            |
| `username`                                    | VARCHAR(255) | UNIQUE, NOT NULL. App rule: 3–50 chars, `[A-Za-z0-9_-]`        |
| `email`                                       | VARCHAR(255) | UNIQUE, NOT NULL                                               |
| `password_hash`                               | VARCHAR(255) | bcrypt                                                         |
| `full_name`                                   | VARCHAR(255) |                                                                |
| `status`                                      | VARCHAR(50)  | `active` (default) or `disabled`. Disabled users cannot log in |
| `is_public`                                   | BOOLEAN      | Listed in the share directory (default false)                  |
| `storage_max_bytes`                           | BIGINT       | Per-user storage quota, default 26 214 400 (25 MB)             |
| `last_page_visited`                           | VARCHAR(255) | Default `/`; used as the post-login redirect                   |
| `last_visited_at`, `created_at`, `updated_at` | TIMESTAMP    |                                                                |

### `roles`, `rights`, `role_rights`, `user_roles`

- `roles(role_id, role_name UNIQUE, description)`, seeded with `admin` and `user`.
- `rights(right_id, right_key UNIQUE, description)` and `role_rights(role_id, right_id)` exist for future
  fine-grained permissions. **Authorization today checks only `admin` role membership.**
- `user_roles(user_id, role_id)` PK on both. The first user (initial setup or first registration) gets `admin`.

### `session`

`connect-pg-simple` store: `sid` PK, `sess` JSON, `expire` (indexed).

---

## Application tables

### `flashcards`

| Column                                               | Type           | Notes                                                             |
| ---------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| `flashcard_id`                                       | UUID PK        |                                                                   |
| `user_id`, `created_by`                              | UUID → users   | Both set to the creator; ownership checks use `created_by`        |
| `question`, `answer`                                 | TEXT NOT NULL  | `question` may be `''` for audio questions                        |
| `class`, `lesson`                                    | VARCHAR(255)   | Free-text grouping                                                |
| `category`                                           | VARCHAR(100)   | Free-text grouping                                                |
| `is_private`                                         | BOOLEAN        | Default true. `false` = public (visible to all users' study sets) |
| `is_public`                                          | BOOLEAN        | Legacy, unused (visibility uses `is_private`)                     |
| `difficulty`                                         | INT 1–5        | Legacy, unused                                                    |
| `lesson_id`                                          | UUID → lessons | Legacy, unused                                                    |
| `question_type`                                      | VARCHAR(20)    | `standard` · `true_false` · `multiple_choice` · `audio`           |
| `lang`                                               | VARCHAR(16)    | Default `en-US` (question side)                                   |
| `answer_lang`                                        | VARCHAR(16)    | Answer-side language (null = same as `lang`)                      |
| `answer_mode`                                        | VARCHAR(10)    | `choice` (default) or `listen`                                    |
| `question_form`, `answer_form`                       | VARCHAR(10)    | `text` · `text_tts` · `image` · `audio`                           |
| `question_media_id`, `answer_media_id`               | UUID → media   | ON DELETE SET NULL                                                |
| `difficulty_score`                                   | DECIMAL(3,2)   | 1.00–5.00, default 3.00. See DIFFICULTY_SCORING.md                |
| `difficulty_calc_base`                               | VARCHAR(10)    | `individual` or `shared`                                          |
| `last_difficulty_update`, `created_at`, `updated_at` | TIMESTAMP      |                                                                   |

Indexes: `(user_id)`, `(category, user_id)`.

### `media`

`media_id` UUID PK, `user_id` → users, `kind` (`image` | `audio`), `data` TEXT (base64 **data URL**), `created_at`.
Media rows that no card or option references are deleted after card deletion and option replacement.
Storage usage per user = `SUM(LENGTH(question)+LENGTH(answer))` over owned cards + `SUM(LENGTH(data))` over owned media.

### `flashcard_options`

`option_id` PK, `flashcard_id` → flashcards (CASCADE), `option_text`, `is_correct`, `sort_order`,
`option_form` (default `text`), `option_media_id` → media.
These are the authored options for `multiple_choice`/`audio` cards. If every option is correct, practice adds
"All of the above" as the answer. If none is correct, it adds "None of the above".

### `flashcard_shares`

`share_id` PK; `owner_id`, `recipient_id`, `flashcard_id`; `status` (written as `active`);
`recipient_status` (`pending` → `accepted`); `shared_at`, `accepted_at`, `rejected_at`, `revoked_at`.
UNIQUE `(owner_id, recipient_id, flashcard_id)`. Reject and revoke **delete** the row, so the
`rejected_at`/`revoked_at` columns are never written.

### `public_card_removals`

PK `(user_id, flashcard_id)`. Records that a user removed a public card from their study set.

### `flashcard_leitner_progress` (active Leitner state)

| Column                             | Notes                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| `id`                               | SERIAL PK                                                          |
| `flashcard_id`, `user_id`          | UNIQUE pair                                                        |
| `current_box`                      | 1, 2, or 3 (default 1)                                             |
| `last_reviewed`                    | Set when a session's repetitions complete                          |
| `next_review`                      | Midnight of now + 1/3/7 days for box 1/2/3; initialized to `NOW()` |
| `times_correct`, `times_incorrect` | Incremented on every attempt                                       |
| `none_of_above_count`              | Times "None of the above" was presented                            |
| `session_streak`                   | Unused                                                             |

Rows are created lazily for every accessible card by `initializeAllCardsForUser`,
which runs when the practice page loads and on `/api/practice/next` and `/api/practice/dashboard`.

### `practice_history`

One row per answered attempt: `flashcard_id`, `user_id`, `leitner_box` (the box at attempt time),
`correct`, `response_time_ms` (currently always null), `class`, `lesson`, `category`, `created_at`.
`class`/`lesson`/`category` hold the active practice filter if one was set, otherwise the card's own values.
Used for the streak, today's summary, attempt totals, and difficulty scoring.

### `session_card_attempts`

`flashcard_id`, `user_id`, `session_start_time` (from the client), `attempt_number`, `was_correct`, `response_time_ms`.
Indexed on `(user_id, flashcard_id, session_start_time)`. Drives the per-session repetition rule.

### `difficulty_history`

`flashcard_id`, `old_score`, `new_score`, `calculation_basis`, `sample_size`, `success_rate`, `created_at`.
Written only when a recalculation changes the score.

### `quizzes`, `quiz_questions`, `quiz_results`

- `quizzes(quiz_id, user_id, name, description, …)`. `name` = `Quiz - <date> <time>`; `description` = JSON of the filters used, or null.
- `quiz_questions(quiz_question_id, quiz_id, card_id → flashcards, order_index)`.
- `quiz_results(result_id, user_id, quiz_id, score 0–100, total_questions, correct_answers, taken_at)`.

### `import_export_logs`

`action` ∈ `IMPORT`/`EXPORT`; `status` ∈ `pending`/`completed`/`failed`; `cards_processed`, `file_name`, `error_message`.
Written by the admin backup routes only.

### `user_rights`

PK `(user_id, right_key)`, `granted`. Per-user right overrides. The service methods exist,
but no route uses them yet.

### Legacy tables

- `leitner_boxes`: the original Leitner design. Nothing writes to it; it is still counted by
  `/api/system/database-status`, cleared on user delete, and included in backups.
- `lessons`: an unused normalized lesson table. Lessons are stored as text on `flashcards.lesson`.

## Cascade behavior

Deleting a user cascades to all user-owned rows. `userAuthService.deleteUser` first deletes
the app data explicitly in a transaction, then deletes the identity row.
Deleting a flashcard cascades to its options, shares, removals, progress, history, attempts,
difficulty history, and quiz questions. Media references are set to NULL, and orphaned media is then
garbage-collected by the service.

## Query files

All SQL used at runtime lives in named-query files under `src/scripts/sql/pg/`
(`-- Query: <name>` sections, one statement each, loaded by `PostgresDatabase.loadNamedSqlStatements`):
`entries-queries.sql`, `practice-queries.sql`, `quiz-queries.sql`, `backup-queries.sql`,
`iam-user-queries.sql`, `app-user-data-queries.sql`, `system-queries.sql`, `postgres-introspection.sql`.
Templates use `{{placeholders}}` for dynamic filter clauses; values are always bound parameters.

## Backup and recovery

- In-app: admin **Backup & Restore** on the Profile page (JSON + media ZIP), or from a terminal with `backup.sh` /
  `restore.sh` (SYSTEM_INITIAL_SETUP.md → restoring into a new database). Import is all-or-nothing.
  Every table except the transient `session` table is included. The automated round-trip test
  (`npm run test:roundtrip`, also run by `deploy.sh -preview`) proves a wipe → bootstrap → re-created admin → import
  rebuilds every table and media item.
- Render: free-tier databases expire (`DB_PG_EXPIRE` drives the header warning). Take an in-app backup before expiry.
- Manual: `pg_dump "$DB_PG_EXTERNAL_URL" > backup.sql`.
