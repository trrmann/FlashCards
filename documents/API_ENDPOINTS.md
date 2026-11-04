# API Endpoints for FlashCards

This reference is generated from the route modules in
`src/scripts/js/modules/routes/` and `src/scripts/js/modules/server.mjs`.
When a route changes, update this file in the same commit.

## Base URLs

| Environment | URL                                        | Port source                   |
| ----------- | ------------------------------------------ | ----------------------------- |
| Development | `http://localhost:5000`                    | `PORT_DEV` (default 5000)     |
| Preview     | `http://localhost:4000`                    | `PORT_PREVIEW` (default 4000) |
| Production  | value of `RENDER_URL` (Render web service) | `PORT_PROD` → `PORT` → 3000   |

## Authentication model

- Authentication is **cookie-based server sessions** (`express-session`), stored in
  PostgreSQL by `connect-pg-simple` (table `session`). There are no JWTs or bearer tokens.
- A successful `POST /api/auth/login`, `POST /api/auth/register`, or
  `POST /api/system/initial-setup` sets `req.session.userId` and `req.session.username`.
- Cookie: `httpOnly`, `sameSite=lax`, `secure` only when `NODE_ENV=production`,
  `maxAge` 24 hours. Browser clients must send `credentials: 'include'` (same-origin
  fetches do this by default).
- Unauthenticated API calls return `401`. Admin-only calls return `403` when the
  session user lacks the `admin` role (role membership via `user_roles`).

## Conventions

- JSON bodies are parsed globally with a 50 MB limit (media is sent as base64 data URLs).
  Card create/update routes apply a 15 MB per-route limit.
- Most responses carry `status: "success" | "error"` and a `message`.
  The practice routes report failures as `{ status: "error", error: "..." }` instead of `message`.
- There is no pagination and no rate limiting.
- IDs are UUIDs except the serial `id` columns of progress/history tables.

### Filter semantics (`class`, `lesson`, `category`)

Several endpoints accept `class`, `lesson`, and `category` query parameters.

- Matching is case-insensitive (`ILIKE`).
- A trailing `*` is a prefix wildcard: `Bio*` matches `Biology 101`.
- Empty or missing values mean "no filter".
- **Exception:** `POST /api/quiz/start` uses exact, case-sensitive equality and no wildcards.

### Card visibility ("accessible cards")

Practice, quiz, distractor, and metadata queries operate on cards the user can access:

1. cards the user created, **or**
2. cards shared to the user where the share is not revoked and the recipient accepted it, **or**
3. public cards (`is_private = false`) the user has not removed (`public_card_removals`).

`GET /api/entries` and the entries export return **only cards the user created**.

---

## Page routes (HTML, EJS)

| Method | Path        | Notes                                                                                  |
| ------ | ----------- | -------------------------------------------------------------------------------------- |
| GET    | `/`         | Home. Shows the study dashboard when logged in.                                        |
| GET    | `/entries`  | Create, edit, share, import, and export flashcards.                                    |
| GET    | `/practice` | Leitner practice. Redirects to `/login` when not logged in. Initializes progress rows. |
| GET    | `/quiz`     | Quiz builder and history.                                                              |
| GET    | `/login`    | Login / registration. Shows "First User Setup" when no users exist.                    |
| GET    | `/profile`  | Profile, password, directory visibility, pending shares, admin panel.                  |
| GET    | `/logout`   | Logout confirmation page (the actual logout is `POST /api/auth/logout`).               |

> The practice router is mounted at both `/practice` and `/api/practice`, so every practice
> path below also answers under the other prefix (e.g. `GET /api/practice/` renders the page,
> and `GET /practice/next` returns JSON). Clients use `/api/practice/*` for JSON.

---

## Health and system — `/api/health`, `/api/system`

### GET /api/health

No auth. Runs `SELECT 1`-style probe.

- `200` `{ "status": "healthy", "database": "<name>", "timestamp": "..." }`
- `503` `{ "status": "unhealthy", "error": "...", "timestamp": "..." }`

### GET /api/system/setup-status

No auth. `{ status, needsSetup: boolean, userCount, message }`.

### POST /api/system/initial-setup

No auth; only allowed while there are zero users (otherwise `403`).
Body: `{ username, email, password, passwordConfirm, fullName? }`.
Creates the user, grants the `admin` role, starts a session. `201` with `{ user: { user_id, username, email, full_name, created_at } }`.
Validation is the same as registration.

### GET /api/system/database-status

No auth. Row counts for `users, flashcards, leitner_boxes, quizzes, quiz_questions, quiz_results, import_export_logs`.
`{ status, database, allTablesExist, tables: { <name>: { exists, rowCount } } }`.

### GET /api/system/db-expiration-warning

No auth. Based on `DB_PG_EXPIRE`.
`{ status: "success", warning: { message: string|null, level: null|"warning"|"critical"|"critical-1day"|"expired" } }`.
Levels: `warning` ≤ 10 days, `critical` ≤ 3 days, `critical-1day` = 1 day, `expired` ≤ 0 days.

---

## Authentication — `/api/auth`

### POST /api/auth/register

Body: `{ username, email, password, passwordConfirm, fullName? }`

Validation (`validationService`):

- username: 3–50 characters, `[A-Za-z0-9_-]` only; must be unused
- email: `x@y.z` shape; must be unused
- password: ≥ 8 characters, with at least one uppercase letter, one lowercase letter, one digit, and one of `!@#$%^&*`
- `password === passwordConfirm`

If this is the first user, they are also granted `admin`. Starts a session.

- `201` `{ status, message, user: { user_id, username, email, full_name, is_admin, created_at } }`
- `400` on validation failure (`errors: string[]` for username/password rules), including "already taken" / "already registered"

### POST /api/auth/login

Body: `{ username, password }`. Disabled users (`status = 'disabled'`) cannot log in.

- `200` `{ status, message, user: { user_id, username, email, full_name }, redirectTo: "<last page visited>" }`
- `401` invalid credentials
- `403` the account has no active access to FlashCards (`application_users`); platform admins are exempt

### POST /api/auth/logout

Destroys the session. `200` `{ status, message }`.

### GET /api/auth/current

`200` `{ status, user }` where `user` = `{ user_id, username, email, full_name, status, is_public, created_at, updated_at, is_admin, is_platform_admin }`. `is_admin` is true for FlashCards admins (directly or through a group) and platform admins.
`401` if not logged in (session destroyed if the user no longer exists).

---

## Current user — `/api/users` (all require auth)

| Method | Path                    | Body                    | Response                                                                      |
| ------ | ----------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/users/profile`    | —                       | `{ user }` (same shape as `/api/auth/current`)                                |
| PUT    | `/api/users/profile`    | `{ fullName?, email? }` | `{ user }`. `fullName` must be non-empty; email validated.                    |
| PUT    | `/api/users/password`   | `{ password }`          | Password rules as registration. **The current password is not required.**     |
| PUT    | `/api/users/visibility` | `{ isPublic: boolean }` | `{ isPublic }`. Controls listing in the share directory.                      |
| GET    | `/api/users/directory`  | —                       | `{ users: [{ username, full_name }] }`: active users with `is_public = true`. |

---

## Navigation — `/api/navigation` (auth)

| Method | Path                        | Body / Response                                                                                             |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/api/navigation/track`     | `{ page }` (≤ 255 chars). Query string and hash are stripped; `/login`, `/logout`, `/register` are skipped. |
| GET    | `/api/navigation/last-page` | `{ lastPage }` (`/` by default).                                                                            |

`public/js/navigation-tracker.js` calls `track` on page load and link clicks; login uses the result as `redirectTo`.

---

## Flashcards — `/api/entries` (all require auth)

### Card model (request fields)

| Field                          | Values / notes                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `question`                     | Text. May be empty only when `questionBlock` is an audio recording (text becomes an optional caption).                                                       |
| `answer`                       | Text, required.                                                                                                                                              |
| `class`, `lesson`, `category`  | Optional free text, used for grouping, filters, and distractor matching.                                                                                     |
| `questionType`                 | `standard` (default) · `true_false` · `multiple_choice` · `audio`                                                                                            |
| `lang` / `answerLang`          | BCP-47 tags (default `en-US` / `null`, max 16 chars). Used for TTS, speech input, and True/False labels.                                                     |
| `answerMode`                   | `choice` (default; pick an option) · `listen` (the user answers aloud and self-grades)                                                                       |
| `questionBlock`, `answerBlock` | `{ form, media? }`, where `form` ∈ `text` · `text_tts` · `image` · `audio` and `media` is a base64 data URL.                                                 |
| `options`                      | `[{ text, isCorrect, form?, media? }]`: authored options for `multiple_choice`/`audio`/`true_false`. All text-like or all images; mixing them returns `400`. |

### POST /api/entries

Creates a card owned by the session user. `201` `{ flashcard }`.

- **New cards are always created private** (`is_private = true`, hard-coded in `insert_flashcard`). An `is_private` value in the body is ignored. Use `PUT /api/entries/:id` or `visibility-batch` to publish.
- Storage quota: rejects with `413` when `used + payload > users.storage_max_bytes` (default 25 MB). Usage = question+answer text length + stored media data length.
- `400` when the question/answer is missing or the options mix text and image forms.

### GET /api/entries

The user's own cards, newest first. Optional `?class=&lesson=&category=` (wildcard semantics).
`{ status, count, filters, entries: [ { flashcard_id, question, answer, lesson, category, class, is_private, question_type, lang, answer_lang, answer_mode, question_form, answer_form, question_media_id, answer_media_id, question_media_data, answer_media_data, created_at } ] }`

### GET /api/entries/:flashcardId

A single card the user owns or has an accepted share of (public cards are **not** readable here). Includes the owner's `username`/`full_name`. `404` if none.

### GET /api/entries/:flashcardId/options

`{ options: [ { option_id, option_text, is_correct, sort_order, option_form, option_media_id, option_media_data } ] }`.
Note: this route checks only that the caller is logged in, not that they can access the card.

### PUT /api/entries/:flashcardId

Owner only (`403` otherwise). The body uses **snake_case column names**; allowed keys:
`question, answer, lesson, category, class, is_private, question_type, lang, answer_lang, answer_mode, question_form, answer_form, question_media_id, answer_media_id`.
If `options` is an array, the card's options are replaced (and option media stored). Media no longer referenced by any card or option is then deleted.
Question/answer media blocks cannot be replaced through this route (it takes media ids, not data URLs).

### DELETE /api/entries/:flashcardId

Owner only (`403` otherwise). Deletes the card (options, shares, progress, and history cascade) and garbage-collects unreferenced media.

### GET /api/entries/storage

`{ usedBytes, maxBytes, remainingBytes, overLimit }`.

### Visibility and public cards

| Method | Path                                       | Body                              | Notes                                                                                        |
| ------ | ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/api/entries/visibility-batch`            | `{ flashcardIds: [], isPrivate }` | Only owned cards change. Returns `{ updated, skipped }`.                                     |
| GET    | `/api/entries/public`                      | —                                 | Other users' public cards not removed by me. `{ cards }` with owner `username`, `full_name`. |
| GET    | `/api/entries/public/removed`              | —                                 | Public cards I removed.                                                                      |
| POST   | `/api/entries/public/:flashcardId/remove`  | —                                 | Hide a public card from my study set.                                                        |
| POST   | `/api/entries/public/:flashcardId/restore` | —                                 | Undo the above.                                                                              |
| POST   | `/api/entries/public/remove-batch`         | `{ flashcardIds: [] }`            | `{ removed }`                                                                                |
| POST   | `/api/entries/public/restore-batch`        | `{ flashcardIds: [] }`            | `{ restored }`                                                                               |

Public cards are auto-included in every user's practice and quiz pool unless removed.

### Sharing

Shares have `status` (`active`) and `recipient_status` (`pending` → `accepted`).
Accepted shares are treated as owned for practice, quiz, and metadata. Rejecting or revoking
**deletes** the share row (the owner is not notified and may re-share).

| Method | Path                                  | Body                                           | Notes                                                                                                                     |
| ------ | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/entries/:flashcardId/share`     | `{ recipientUsername }` (or `username`)        | Case-insensitive username lookup. `201` `{ share }`; `404` unknown user; `400` not owner / sharing with self.             |
| POST   | `/api/entries/share-batch`            | `{ flashcardIds: [], recipientUsernames: [] }` | Every card × recipient pair. `{ shared, failures, unknownUsernames }`; `201` if any shared else `400`.                    |
| POST   | `/api/entries/:flashcardId/revoke`    | `{ recipientId }`                              | Owner deletes the share.                                                                                                  |
| POST   | `/api/entries/shares/:shareId/accept` | —                                              | Recipient only.                                                                                                           |
| POST   | `/api/entries/shares/:shareId/reject` | —                                              | Recipient only; deletes the share.                                                                                        |
| GET    | `/api/entries/shares/pending`         | —                                              | Shares awaiting my decision (with owner and card text).                                                                   |
| GET    | `/api/entries/shares/accepted`        | —                                              | Shares I accepted.                                                                                                        |
| GET    | `/api/entries/shared-by-me`           | —                                              | ⚠️ Unreachable: registered after `GET /:flashcardId`, which captures it and fails on the non-UUID id. Not used by the UI. |

### Metadata (for filter dropdowns)

All return values from **accessible** cards, sorted ascending, nulls excluded.

| Path                                           | Response             |
| ---------------------------------------------- | -------------------- |
| `GET /api/entries/metadata/classes`            | `{ classes: [] }`    |
| `GET /api/entries/metadata/lessons`            | `{ lessons: [] }`    |
| `GET /api/entries/metadata/lessons/:className` | `{ lessons: [] }`    |
| `GET /api/entries/metadata/categories`         | `{ categories: [] }` |

### Export / import (two-file model)

Every export point produces **two linked files**: a data JSON and a media ZIP. The JSON references
media by `media_id`; the ZIP stores each item as `media/<media_id>.<ext>` (real binary, so it
opens outside the app). Supported MIME types: png, jpg, gif, webp, svg, webm, ogg, mp3, m4a, wav.

#### GET /api/entries/export

Optional `?class=&lesson=&category=`. Downloads `flashcards-export-<ts>.json`:

```json
{
  "version": "2.0",
  "exportedAt": "…",
  "exportedBy": "<username>",
  "filters": null,
  "count": 1,
  "media": [{ "id": "<media_id>", "kind": "image", "ext": "png" }],
  "entries": [
    {
      "question": "…",
      "answer": "…",
      "lesson": "…",
      "category": "…",
      "class": "…",
      "is_private": true,
      "question_type": "standard",
      "lang": "en-US",
      "answer_lang": null,
      "answer_mode": "choice",
      "question_form": "image",
      "question_media": "<media_id>",
      "answer_form": "text",
      "answer_media": null,
      "options": [{ "text": "…", "isCorrect": true, "form": "text", "media": null }]
    }
  ]
}
```

#### GET /api/entries/export/media

Same filters. Downloads `flashcards-media-<ts>.zip`.

#### POST /api/entries/import

Body: `{ entries: [...], mediaArchive?: "<base64 zip>" }` (50 MB limit).

- An entry needs `answer` plus either `question` text or an audio question whose media is in the archive.
- **Upsert by question text:** if the user already owns a card with the same `question`, it is updated (including blocks and options); otherwise a new card is created (private).
- Media references that are missing from the archive are skipped and counted, and that slot falls back to `text`.
- Storage quota applies to the whole payload (`413`).
- `201` `{ count, created, updated, errors, skippedMedia, imported, updatedEntries }`.

---

## Practice (Leitner) — `/api/practice` (all require auth)

See [LEITNER_SYSTEM.md](./LEITNER_SYSTEM.md) for the scheduling rules.

### GET /api/practice/next

Query: `catchUp=true` (any box-1/2 card, ignoring the schedule) and `class`, `lesson`, `category` filters.
**In catch-up mode the filters are ignored.**

The server first creates missing `flashcard_leitner_progress` rows for every accessible card.
It then picks a random due card and builds its options:

```json
{
  "status": "success",
  "card": {
    "flashcard_id": "…",
    "question": "…",
    "answer": "…",
    "question_type": "standard",
    "lang": "en-US",
    "answer_lang": null,
    "answer_mode": "choice",
    "question_form": "text",
    "question_media_data": null,
    "answer_form": "text",
    "answer_media_data": null,
    "current_box": 1,
    "times_correct": 0,
    "times_incorrect": 0
  },
  "options": [
    { "text": "…", "isCorrect": true, "form": "text", "media": null, "isNoneOfAbove": false }
  ],
  "showingNoneOfAbove": false
}
```

- No card due: `{ card: null, options: null, message, catchUpMode }`.
- Too few distractors: `{ card: null, insufficientEntries: true, diagnostic: { currentCard, availableWrongAnswers, neededWrongAnswers, totalOptionsNeeded, message } }`.
- The response includes `answer` and each option's `isCorrect`; **grading happens in the browser**.

### POST /api/practice/answer

Body: `{ flashcardId, selectedAnswer, isCorrect, sessionStartTime?, filterClass?, filterLesson?, filterCategory? }`

- With `sessionStartTime` (what the UI always sends): session-aware repetitions. The card must be answered 3× (box 1), 2× (box 2), or 1× (box 3) in the session before the box changes. All correct → promote one box; any incorrect → back to box 1.
- Without it: legacy single-attempt mode (promote/demote immediately, and recalculate difficulty).
- `200` `{ isCorrect, message, correctAnswer, progress, session: { needsMoreAttempts, attemptNumber, totalNeeded, feedback } }`

### Stats and schedule

| Path                          | Query filters | Response                                                                                                                                                                                                                |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/practice/daily`     | —             | `{ count, cards }`: all cards due today                                                                                                                                                                                 |
| `GET /api/practice/stats`     | yes           | `{ stats: { box1, box2, box3, total, totalCorrect, totalIncorrect, totalAttempts, accuracy }, streak }`                                                                                                                 |
| `GET /api/practice/schedule`  | —             | `{ schedule: { box1: { due, count }, box2: {…}, box3: {…} } }`                                                                                                                                                          |
| `GET /api/practice/summary`   | yes           | `{ summary: { dueTodayCount, practiceAttempts, correctToday, incorrectToday } }`                                                                                                                                        |
| `GET /api/practice/dashboard` | —             | `{ dashboard: { overall, classes: [{ class, …, lessons: [] }], categories: [] } }`. Each node has `total, box1, box2, box3, attempts, accuracy` (accuracy is `null` when there are no attempts). Used by the home page. |

`streak` = consecutive correct answers counted back from the most recent `practice_history` row.

### Difficulty

| Method | Path                                     | Body              | Notes                                                                                                        |
| ------ | ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/practice/difficulty/update-single` | `{ flashcardId }` | Recalculate one card. `{ data: { oldScore, newScore, successRate, sampleSize, calculationBasis, changed } }` |
| POST   | `/api/practice/difficulty/update-batch`  | `{ lesson? }`     | Recalculate public + own cards. `{ summary: { total, updated, errors, lesson }, details }` (first 10)        |
| GET    | `/api/practice/difficulty/stats`         | —                 | Distribution over public + own cards.                                                                        |

See [DIFFICULTY_SCORING.md](./DIFFICULTY_SCORING.md).

---

## Quiz — `/api/quiz` (all require auth)

### POST /api/quiz/start

Filters go in the **query string** (`?class=&lesson=&category=`, exact match).

Pool: accessible cards the user has **already practiced** (a progress row with attempts or `last_reviewed`).

Selection:

- ≤ 20 cards in the pool: all of them.
- Otherwise the target is `min(20, ceil(0.75 × pool))`, split into thirds across easy (≤ 2.0), medium (≤ 3.5), and hard (> 3.5) `difficulty_score` buckets.
- There is no backfill, so the quiz is shorter when the buckets are uneven.

It creates a `quizzes` row (the filters are stored as JSON in `description`) and `quiz_questions` rows.

`200` `{ quiz_id, total_questions, questions: [ { card_id, question, answer, difficulty_score, question_type, lang, answer_lang, question_form, question_media_data, options } ] }`.
Options are built the same way as in practice. If there are too few distractors, the other quiz answers are used instead.
`400` if the pool is empty.

### POST /api/quiz/:quizId/submit

Body: `{ answers: [{ card_id, is_correct }] }`. Owner only. The score is `round(correct / answers.length × 100)`.
`{ result_id, score, correct_answers, total_questions, percentage }`.

### GET /api/quiz/history

`{ quizzes: [ { quiz_id, name, description, created_at, best_score, attempt_count, last_taken } ] }`.

### GET /api/quiz/:quizId/results

`{ best_score, best_result_id, all_results, attempt_count }`. `best_*` is the **most recent** result (rows are ordered by `taken_at DESC`), not the highest score.

### Metadata

`GET /api/quiz/metadata/classes`, `/lessons`, `/lessons/:className`, `/categories`. These have the same shapes as the entries metadata routes.

---

## IAM — `/api/iam` (all require auth)

Organizations, members, groups, group roles, platform admins, and application access
(IAM phase 2, IAM_MULTI_APP_DESIGN.md). Malformed ids return `404`. Non-members get `404` for an
organization, so its existence isn't revealed.

**Who may do what:** platform admins can do everything and alone create/delete organizations.
Organization owners/admins manage that organization's members and groups. Only owners or platform
admins grant or remove `owner`, and an organization always keeps at least one owner (`409`).
Roles held by groups can be changed only by platform admins or admins of the role's application.

| Method | Path                                            | Body                             | Notes                                                                                                                                                                     |
| ------ | ----------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/iam/organizations`                        | —                                | `{ isPlatformAdmin, organizations: [{ org_id, name, slug, status, my_role, member_count, group_count }] }`. All organizations for platform admins, otherwise the caller's |
| POST   | `/api/iam/organizations`                        | `{ name, slug, ownerUsername? }` | Platform admins. Slug: 3–100 chars, `a-z 0-9 -`. Owner defaults to the caller. `201`; `409` duplicate slug                                                                |
| PUT    | `/api/iam/organizations/:orgId`                 | `{ name?, status? }`             | Owner/admin. `status`: `active`/`disabled`                                                                                                                                |
| DELETE | `/api/iam/organizations/:orgId`                 | —                                | Platform admins. Cascades to members and groups                                                                                                                           |
| GET    | `/api/iam/organizations/:orgId/members`         | —                                | Members: `user_id, username, full_name, org_role, joined_at` (owners first)                                                                                               |
| POST   | `/api/iam/organizations/:orgId/members`         | `{ username, orgRole? }`         | Owner/admin. `orgRole`: `owner`/`admin`/`member` (default). `409` already a member                                                                                        |
| PUT    | `/api/iam/organizations/:orgId/members/:userId` | `{ orgRole }`                    | Owner/admin; owner changes need an owner                                                                                                                                  |
| DELETE | `/api/iam/organizations/:orgId/members/:userId` | —                                | Owner/admin. Also removes the user from the organization's groups                                                                                                         |
| GET    | `/api/iam/organizations/:orgId/groups`          | —                                | Groups with `member_count`                                                                                                                                                |
| POST   | `/api/iam/organizations/:orgId/groups`          | `{ name, description? }`         | Owner/admin. `409` duplicate name in the organization                                                                                                                     |
| PUT    | `/api/iam/groups/:groupId`                      | `{ name?, description? }`        | Owner/admin of the group's organization                                                                                                                                   |
| DELETE | `/api/iam/groups/:groupId`                      | —                                | Owner/admin                                                                                                                                                               |
| GET    | `/api/iam/groups/:groupId/members`              | —                                | Organization members                                                                                                                                                      |
| POST   | `/api/iam/groups/:groupId/members`              | `{ username }`                   | Owner/admin. The user must already be an organization member (`400`)                                                                                                      |
| DELETE | `/api/iam/groups/:groupId/members/:userId`      | —                                | Owner/admin                                                                                                                                                               |
| GET    | `/api/iam/groups/:groupId/roles`                | —                                | `[{ role_id, role_name, app_key }]` (`app_key` null = platform-wide)                                                                                                      |
| POST   | `/api/iam/groups/:groupId/roles`                | `{ appKey, roleName }`           | Platform admins or that app's admins. Every group member then holds the role (e.g. `flashcards`/`admin`)                                                                  |
| DELETE | `/api/iam/groups/:groupId/roles/:roleId`        | —                                | Same authority as granting                                                                                                                                                |
| POST   | `/api/iam/platform-admins/:userId`              | —                                | Platform admins: grant platform admin                                                                                                                                     |
| DELETE | `/api/iam/platform-admins/:userId`              | —                                | Platform admins: revoke (not yourself, `400`)                                                                                                                             |
| GET    | `/api/iam/applications`                         | —                                | Platform admins: registered applications with active user counts                                                                                                          |
| PUT    | `/api/iam/applications/:appKey/users/:userId`   | `{ status }`                     | Platform admins or that app's admins: `active`/`disabled`. Disabled users can't sign in to that app (`403`). Not yourself                                                 |

Tested by `npm run test:iam` (79 checks against the real server on the local scratch database).

---

## Admin — `/api/admin` (auth + `admin` role)

### Users

| Method | Path                                     | Body                                                  | Notes                                                                                                         |
| ------ | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/users`                       | —                                                     | `{ users, count }`. Each user: `user_id, username, email, full_name, status, is_public, created_at, is_admin` |
| POST   | `/api/admin/users`                       | `{ username, email, password, fullName?, isPublic? }` | Same validation as registration.                                                                              |
| GET    | `/api/admin/users/:userId`               | —                                                     |                                                                                                               |
| POST   | `/api/admin/users/:userId/disable`       | —                                                     | Not yourself.                                                                                                 |
| POST   | `/api/admin/users/:userId/enable`        | —                                                     |                                                                                                               |
| DELETE | `/api/admin/users/:userId`               | —                                                     | Not yourself. Deletes app data, then the identity.                                                            |
| PUT    | `/api/admin/users/:userId/visibility`    | `{ isPublic: boolean }`                               |                                                                                                               |
| PUT    | `/api/admin/users/:userId/storage-limit` | `{ maxBytes }` (non-negative integer)                 |                                                                                                               |
| POST   | `/api/admin/users/:userId/promote`       | —                                                     | Grant `admin`.                                                                                                |
| POST   | `/api/admin/users/:userId/demote`        | —                                                     | Revoke `admin`; not yourself.                                                                                 |
| POST   | `/api/admin/users/:userId/reset-stats`   | —                                                     | Reset all of the user's Leitner progress to box 1; not yourself. `{ cardsReset, userName }`                   |

### Full-dataset backup (two-file model)

| Method | Path                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/admin/backup/download`       | Downloads `flashcards-backup-YYYY-MM-DD.json`: IAM tables + app tables. Media rows are included **without** `data`; a `mediaManifest` lists them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/api/admin/backup/download-media` | Downloads `flashcards-backup-media-YYYY-MM-DD.zip` with every media item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| GET    | `/api/admin/backup/export`         | Same backup returned inline as `{ backup }` JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| POST   | `/api/admin/backup/import`         | Body `{ backup, mediaArchive? }` (50 MB). **Upsert**: update existing rows, insert new ones, delete nothing. **All-or-nothing**: one transaction; any failing row rolls back the whole import and returns `500` with the table and error. Roles/rights are matched by name and their ids remapped. Users are matched to existing accounts by username (case-insensitive), falling back to email. A matched user's id is rewritten throughout the backup (`user_id`, `created_by`, `owner_id`, `recipient_id`), so a backup restores into a fresh database whose admin was re-created. The existing account's row is then updated from the backup, including `password_hash`. Unresolvable media references are cleared, with warnings. `{ results: { imported, failed: {}, warnings } }`. Scriptable with `backup.sh` / `restore.sh` |
| GET    | `/api/admin/backup/history`        | `?limit=` (default 100, max 1000). Rows from `import_export_logs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Tables in the backup (format **3.0**):
`users, applications, roles, rights, role_rights, user_roles, user_rights, application_users, organizations, organization_members, groups, group_members, group_roles` (IAM), then
`lessons, media, flashcards, flashcard_options, flashcard_shares, public_card_removals, leitner_boxes, flashcard_leitner_progress, practice_history, session_card_attempts, difficulty_history, quizzes, quiz_questions, quiz_results, import_export_logs`.
Only the transient `session` table is left out. Applications and roles are matched by natural key (app key; app + role name). Older format 2.0 backups still restore: their `admin`/`user` roles become FlashCards roles and every restored user is enrolled in FlashCards. `npm run test:roundtrip` proves that every other table survives a wipe and restore (see LOCAL_DATABASE.md).

> The backup JSON contains password hashes and every user's data. Treat it as a secret.

---

## Error format

```json
{ "status": "error", "message": "Human readable message", "errors": ["optional detail"] }
```

Common codes: `400` validation, `401` not logged in, `403` not owner / not admin / already set up,
`404` not found, `413` storage quota exceeded, `500` server error (some routes add `error: <exception message>`), `503` unhealthy DB.
