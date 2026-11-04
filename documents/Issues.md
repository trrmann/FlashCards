# issues

## high pri

### 1. Verify current production functionality (gate: do this before other changes)

No new features or refactors until production has been checked end to end. Smoke check on
2026-11-03 (read-only): `/api/health` healthy, 7 users, no DB expiry warning, all pages respond
(`/practice` redirects to login when signed out, as expected).

Decide first: deploy the pending review fixes (backup-import user merge + schema order) before
verifying, since the failed backup import on Render needs the merge fix to complete.

> ✅ **Released 2026-11-04** (merge `5b0e79a`). What happened, for the record:
>
> - A `deploy.sh -dev` run of the branch (2026-11-03, nodemon restarting on file edits) had already moved production's
>   tables into `iam`/`flashcards`. The live `main` code then recreated empty `public` tables: the site showed 0 users
>   and offered "initial setup" to anyone. The service was suspended and `prod-readonly-check.sh` confirmed the data
>   was intact in the new schemas.
> - Backup taken through the release code run locally against production: 7 users, 137 cards, 5 media, 8 quizzes.
>   Then merge, push, resume.
> - Verified on Render: `/api/health` 200; all pages 200 (`/practice` 302 signed out); setup status ready with 7 users;
>   row counts unchanged.
>
> **Still to do:**
>
> - The signed-in checklist below (owner, as user and admin).
> - Drop the empty leftover `public` tables, after a fresh backup.
> - A guard so `deploy.sh -dev`/`-preview` can't run schema migrations against production.
> - Rotate the database password (it is in public git history).

> ⚠️ **Release plan for the `review-and-data-safety` branch.** It contains a schema migration (IAM phase 1:
> tables move from `public` into `iam`/`flashcards`). Dev, preview, and production share one database, so the
> **first start of this branch with `deploy.sh -dev` or `-preview` migrates the production database**, and the
> code currently live on Render (which expects `public`) stops working until the branch is deployed there.
> Do it in one sitting:
>
> 0. **Shared packages: published 2026-11-04.** `trrmann/platform-db` (`v0.1.2`) and `trrmann/request-queue` (`v0.1.1`)
>    are public, `trrmann/iam-service` (`v0.1.1`) is private; FlashCards depends on the tags. **Before step 2, on Render:**
>    add the `GITHUB_TOKEN` environment variable, set the Build Command to the fallback form in
>    RENDER_ENVIRONMENT_VARIABLES.md (it runs `render-build.sh` when present, else `npm install`, so it is safe for
>    today's `main`), and set the Health Check Path to `/api/health`. Without the first two the build cannot install
>    iam-service.
> 1. `backup.sh` (production backup, both files).
> 2. Merge the branch into `main`, then `deploy.sh -preview` (migrates the shared DB; the live site is down from here).
> 3. When preview passes, `deploy.sh -prod` right away (Render runs the new code; the site is back).
> 4. Run the checklist below on Render.
>
> If anything goes wrong: restore with `restore.sh` from step 1's files (the database layout can be rebuilt from
> any backup). Until then, keep using `main` for `-dev`/`-preview`, or use `local-db.sh serve` for this branch.

Checklist (signed in on the Render URL, as a normal user and as an admin):

- [ ] Login / logout; redirect to last page visited after login
- [ ] Home: Study Status dashboard (overall, class → lesson, category)
- [ ] Entries: create each question type (standard, true/false, multiple choice incl. select-all, audio),
      with image / recorded audio / TTS blocks; edit; delete; storage bar
- [ ] Entries: make public / private (bulk), share to users (bulk), Public Cards remove/restore
- [ ] Entries: export (JSON + ZIP) and re-import
- [ ] Profile: accept / reject pending shares; profile + password change; directory visibility
- [ ] Practice: filters, due cards, repetitions (3/2/1), none/all of the above, listen mode, catch-up
- [ ] Quiz: start with filters, answer, submit, history
- [ ] Admin: create / disable / enable / promote / demote / reset stats / storage limit
- [ ] Admin: backup download (JSON + ZIP) and import (re-run of the failed import after the fix)

### 2. Data safety for the monthly database reset (after the gate; most urgent)

The Render free database's data is deleted every month ([CODING_STANDARDS.md § 0.7](./CODING_STANDARDS.md)).

- [x] Add `public_card_removals` to backup/restore (2026-11-03)
- [x] Automated round-trip test: `npm run test:roundtrip` (local DB; also run by `deploy.sh -preview`) (2026-11-03)
- [x] One-command recovery onto an empty database: `restore.sh <url> <json> <zip>` creates the admin, then imports (2026-11-03)
- [x] Backup before every prod release: `deploy.sh -prod` runs `backup.sh` against `RENDER_URL` first and stops if it fails (2026-11-03)
- [ ] Monthly routine (owner): run `backup.sh` before each `DB_PG_EXPIRE`, and set `DB_PG_EXPIRE` for each new database
- [x] Import is all-or-nothing (one transaction; any failing row rolls back everything) (2026-11-03)

### 3. Separate the IAM and make it multi-app, with organizations and groups, and bring in WurmTools' IAM

Requirement: [CODING_STANDARDS.md § 0.8](./CODING_STANDARDS.md). Design, owner decisions, and phases:
[IAM_MULTI_APP_DESIGN.md](./IAM_MULTI_APP_DESIGN.md). Built and tested first on the local scratch DB
([LOCAL_DATABASE.md](./LOCAL_DATABASE.md)). Nothing reaches the shared DB before items 1–2.

- [x] Owner decisions: separate schemas in one DB; groups as proposed; management only first (group isolation later); admin levels approved; local scratch DB approved
- [x] Local scratch PostgreSQL set up (`local-db.sh`), fresh-bootstrap verified
- [x] WurmTools IAM reviewed and mapped into the design
- [x] Decided: separate IAM service (2026-11-03)
- [x] Phase 1: `iam`/`flashcards` schemas, no cross-domain SQL, cascade deletes via FK (2026-11-03, local DB; reaches production with the branch)
- [x] Phase 2 backend: applications, app access, app-scoped roles, orgs/groups API, backup v3 (2026-11-03, local DB)
- [x] Phase 2 UI: `/organizations` management page (2026-11-03)
- [x] Phase 3 design written (IAM_MULTI_APP_DESIGN.md → Phase 3), with 3 owner decisions listed (2026-11-04)
- [x] Phase 3a: IAM service process, application credentials, tokens (login, refresh rotation + reuse detection, logout, `/v1/me`) (2026-11-04, local DB)
- [ ] **Owner decisions for phase 3:** Render plan for the IAM service (free-tier cold starts), same repo or separate, token lifetimes
- [x] Phase 3b (part 1): organization/group API served by the IAM service with bearer tokens (2026-11-04, local DB)
- [ ] Phase 3b (part 2): user admin and directory endpoints in the service
- [ ] Phase 3c: FlashCards switches to `IamClient` over HTTP; FlashCards session table moves to `flashcards`
- [ ] Phase 3d: per-service backups (format 4.0), deploy scripts start both services, Render setup
- [ ] Phase 3e: MFA, invitations, role requests, impersonation + audit, login throttling, resource grants
- [ ] Phase 4: WurmTools on the shared IAM (in the WurmTools refactor) + import of its local identity files
- [ ] Phase 5: group-level data isolation

### 4. Bring the code into line with the core coding standards (after the gate)

[CODING_STANDARDS.md § 0](./CODING_STANDARDS.md) was adopted on 2026-11-03. The audit at the end of that
document lists every current violation by file and line. Suggested order:

- [ ] Deploy pipeline (0.5): dev runs no checks; prod commits with a real message (no blanket `git add .`
      or hard-coded co-author); post-deploy verification on Render (health, every page, read-only API checks)
- [ ] Test isolation first (0.6): dedicated test accounts and cleanup, because the database is shared with production
- [ ] Preview suite (0.6): signed-in page coverage (user and admin), OOP API test suite for every endpoint,
      Firefox equivalents (axe, memory, CSS), W3C Nu HTML Checker and W3C CSS Validator on every page and stylesheet
- [ ] Inline SQL → nullable-parameter queries in the `.sql` files (practice, entries, quiz, users, backup)
- [ ] Responsive: convert `max-width` rules to mobile-first, split out `large-screen.css`, review pages at 5 tiers
- [ ] OOP: move inline page scripts into classes in `public/js/`; turn helper closures into methods

### 5. Generated audio voices with Kokoro (after the gate)

From notes.md: "ai generated audio voices library: kakoro ai - open source". This is assumed to be
**Kokoro**, the open-weight text-to-speech model (Kokoro-82M, Apache-2.0). Confirm before starting.

Goal: natural-sounding generated voices for `text_tts` question/answer/option blocks, which today use
the browser's Web Speech voices (quality varies by device). To evaluate first:

- Where inference runs: in the browser (JS/ONNX port) vs. on the server. Render free-tier memory/CPU
  limits may rule out server-side inference.
- Language coverage vs. card `lang` / `answer_lang` (TTS currently follows these per side).
- Generate on demand vs. pre-generate and store as `audio` media (counts against the storage quota).
- Licensing of the chosen voices; fallback to Web Speech when unavailable.

### 6. Copilot skills and tasks on Fedora, with sync back to the Windows work laptop (done; follow-ups open)

Received and imported 2026-11-04 (receipt: `~/Documents/fedora-skill-migration-RECEIPT.md`).

| What                     | Where on Fedora                | Access                         | GitHub (private)    |
| ------------------------ | ------------------------------ | ------------------------------ | ------------------- |
| 197 skills               | `/usr/local/share/ai-skills`   | all users read; owner edits    | `trrmann/ai-skills` |
| Tasks (208 + 1 template) | `/usr/local/share/ai-tasks`    | owner only                     | `trrmann/ai-tasks`  |
| Project data             | `/usr/local/share/ai-projects` | owner only; configs not in git | local only          |
| Notes                    | `/usr/local/share/ai-notes`    | owner only                     | none                |
| Tool credentials         | `~/.config/ai-tools`           | owner only                     | never               |

- Claude loads the skills in every session: a SessionStart hook in `~/.claude/settings.json` runs
  `.tools/link-claude-skills.sh`. Not yet confirmed from a new session.
- All Copilot paths in the skills are mapped by `.tools/path-map.json` and `apply_path_map.py`, which works in both
  directions; a round trip against the received copy is exact. All 67 PowerShell helpers parse under `pwsh`;
  36 are portable (`.tools/FEDORA-COMPATIBILITY.md`).
- **Sync back:** skill `ai-sync-back` exports only work skills and work tasks (`sync-scope.json`; personal and review
  skills and personal tasks never leave). Paths are mapped back to Windows form. The PowerShell importer verifies
  hashes, backs files up, and detects conflicts. Tested end to end, including a rerun and a second sync round.

Follow-ups:

1. Confirm in a new Claude session that the skills are listed.
2. Classify the 16 "review" skills (math, sciences, study topics) as work or personal in `sync-scope.json`.
3. Give the 31 Windows-only helpers Linux equivalents, or mark them Windows-only (FEDORA-COMPATIBILITY.md).
4. Deleting the Windows source needs the owner's separate confirmation.

## resolved

- **Start-up when the database isn't ready (2026-11-04, owner request: all three packages need a clean start-up).**
  - Before: FlashCards tried the database once, logged a warning and never ran the schema bootstrap again.
  - Now it listens at once, answers 503 "starting" with `Retry-After`, waits with backoff and retries until the
    database is up, then bootstraps.
  - Uses platform-db `v0.1.2` (connection wait, bootstrap lock, no process exit on a dropped idle connection) and
    iam-service `v0.1.1` (with request-queue `v0.1.1`, whose worker no longer dies on a database drop).
  - Render: Health Check Path `/api/health`.

  **Resolved:** `npm run test:startup` 7/7 (database behind a TCP relay that starts after a full wait round gave up);
  `test:roundtrip` 152/152 and `test:iam` 79/79 unchanged; `npm run verify` clean. The package suites pass too:
  platform-db 36/36, request-queue 27/27, iam-service 49 + 41 + 15. The design for per-app database logins,
  rotatable app credentials and queued database work is in iam-service `documents/PLATFORM_ACCESS_AND_STARTUP.md`.

The items below were resolved on 2026-11-03 (commit `5b5be62`).

- ~~public cards are not available to all users like it should be~~
  **Resolved:** Public cards are auto-approved into every user's practice, quiz, and
  filters (owned OR accepted-share OR public-and-not-removed). Users can remove a
  public card from their study set on the entries page (Public Cards section) and
  restore it later from the collapsible Removed list.
- ~~the approve entries part in the profile should have the ability to do a multi select and approval all selected and a reject all selected.~~
  **Resolved:** Pending Shares in the profile has per-card checkboxes with
  Accept Selected / Reject Selected buttons and per-item failure reporting.
- ~~the multi selects need an ability to select all, this is both in the share and in the profile for accept or reject.~~
  **Resolved:** Select All checkboxes added to the entries header (share and bulk
  visibility selection) and to the profile Pending Shares controls.
- ~~the quiz questions need to also me multiple choice like the practice sessions.~~
  **Resolved:** Quiz questions are multiple choice, generated by the same engine as
  practice (same class/category distractors, none-of-the-above logic), with a
  fallback to other quiz answers when the distractor pool is insufficient.
- ~~the quiz drop down selectors are not loading the lessons or the categories when available in the same way the header filter does.~~
  **Resolved:** Quiz lessons load from `GET /api/quiz/metadata/lessons` (owned +
  shared + public cards) and cascade on class selection like the header filter,
  including resetting to all lessons when the class is cleared.
- ~~the study filter is not filtering the owned entries on the entries page.~~
  **Resolved:** Entries filtering now uses case-insensitive ILIKE matching with
  trailing-`*` wildcard support, matching the header filter/practice semantics
  (was exact string equality).
- ~~the entries page needs the multi select ability to make private or make public for all selected as well.~~
  **Resolved:** Make Public / Make Private buttons act on the selected cards via
  `POST /api/entries/visibility-batch` (owner-scoped).

Also fixed in the same pass (reported separately):

- ~~console error on render in prod about statusMsg is not defined on the practice page~~
  **Resolved:** `statusMsg` was declared inside one branch of `loadNextCard` and
  referenced in a sibling branch; it is now declared once at the top of the
  function, and the no-card branch properly reveals the status message box.

Resolved on 2026-11-03 (round 2):

- ~~the card lists even with a filter get long they need to be collapsable by class, lesson and category (if a distinction exists)~~
  **Resolved:** Entries lists (Your Flashcards, Shared with Me, Public Cards) render
  as nested collapsible groups by class -> lesson -> category; a grouping level is
  only created when more than one distinct value exists at that level, and group
  headers show card counts.
- ~~also need a multi select ability (with the action buttons available) in the accept / reject / remove options of the shared cards and the remove public cards.~~
  **Resolved:** Shared with Me and Public Cards sections each have per-card
  checkboxes, a Select All toggle, and a Remove Selected action (profile Pending
  Shares already had Accept/Reject Selected).
- ~~when a record is rejected or removed from share or public the action of share is teh share record needs to be deleted, the public records need to have the ability to reallow the record back for that user~~
  **Resolved:** Rejecting or removing a share now deletes the flashcard_shares
  record outright (previously it was only marked rejected, which also blocked the
  owner from ever re-sharing); owner revocation deletes the record too. Public-card
  removals remain reversible: the Removed list's Restore button reallows the card
  for that user. Also fixed in this pass: the quiz lesson dropdown failed for class
  names containing spaces (server double-encoded the class name), and the Shared
  with Me section now clears when the last shared card is removed.

Resolved on 2026-11-03 (round 3):

- ~~the home page should show a status dashbaord for study for this user with breakdowns for overall, per class (collapsable) + per lesson (collapsable) - integrating a catagoray status (collapsable) as well indepedenant of the class areas whereas teh lesson is dependant on the class.~~
  **Resolved:** The home page shows a Study Status dashboard for logged-in users:
  overall stat cards (cards, box 1/2/3, accuracy), a collapsible per-class
  breakdown with nested per-lesson groups (lesson dependent on class), and an
  independent collapsible per-category breakdown. Served by
  GET /api/practice/dashboard over the user's accessible cards (owned + accepted
  shares + public).
- ~~there should be guidelines for teh groups on the entries page to meet a studyable count of cards (min and max)~~
  **Resolved:** A guideline note and per-group status chips were added to the
  entries lists. Pools are measured per class + category (lesson-independent,
  matching the distractor rule): fewer than 2 cards = "not studyable", 2-3 =
  "add N for full choice" (playable but degraded multiple choice), 4-20 =
  "studyable", over 20 = "quiz subsets" (a quiz uses at most 20 cards).
- ~~verify that this is still the actual study model based on the available cards and fix it if it is not~~
  **Verified (no fix needed):** Empirically confirmed against the live code: a
  1-card pool returns the insufficient-entries diagnostic; 2-3 card pools play
  with degraded 2-3 option multiple choice; 4+ distinct-answer cards in the same
  class + category produce full 4-option questions (lesson does not partition the
  distractor pool); quizzes use all cards up to 20 and subset larger pools to at
  most 20 by difficulty distribution. The guideline chips reflect exactly these
  numbers.

Resolved on 2026-11-03 (round 4):

- ~~the mass remove public records failed to work on render~~
  **Resolved:** Mass remove previously issued one HTTP request per card from the
  browser (100+ sequential round-trips), which was slow and fragile under
  production latency. It now posts a single batch request to
  POST /api/entries/public/remove-batch backed by one set-based statement
  (verified: 105 cards removed in under 100 ms). Restore uses
  POST /api/entries/public/restore-batch the same way.
- ~~the restore also needs multi select with select all and restore selected capabilities~~
  **Resolved:** The Removed public cards list now has per-card checkboxes, a
  Select All toggle, and a Restore Selected button using the batch restore
  endpoint; the list also clears correctly after restoring the last card.

## open

Found in the code/documentation review of 2026-11-03 (not yet fixed):

- **Security: live DB password in public git history.** `.env.backup` (tracked despite being
  git-ignored) and `documents/RENDER_ENVIRONMENT_VARIABLES.md` contained the real `DB_PG_PASSWORD`.
  The repo is public. Both are now cleaned/untracked, but the history still has it: **rotate the
  Render DB password**, then optionally purge history (`git filter-repo`). The committed
  `documents/flashcards-backup-2026-11-02.json` (users' emails + password hashes) is likewise untracked now but in history.
- **New cards are always private.** `insert_flashcard` hard-codes `is_private = true`, so the
  create form's "Private" checkbox (sent as `is_private`) is ignored; entries import also creates private cards.
- **`GET /api/entries/shared-by-me` is unreachable.** It is registered after `GET /:flashcardId`,
  which captures it (non-UUID id → 500). Unused by the UI; move it above `/:flashcardId` or remove it.
- **Short quizzes.** `selectRandomQuestions` takes `floor(target/3)` cards per difficulty bucket with
  no backfill; since difficulty rarely changes (next item) most cards sit at 3.00 ("medium"), so a
  pool of 40 cards yields only 6 questions.
- **Difficulty never updates in normal practice.** Only the legacy (no `sessionStartTime`) answer path
  calls `updateDifficultyScore`; the UI always uses session mode, and nothing calls the difficulty endpoints.
- **Review schedule vs. due cards disagree on Fridays.** `getReviewSchedule` shows Box 2 as due on
  Friday but `getDueCardsForToday` excludes it (Box 2 = even `getDay()`: Sun/Tue/Thu/Sat). The code
  comment claiming "Mon, Wed, Fri, Sun" is wrong.
- **Catch-up mode ignores filters.** `getNextCatchUpCard(userId)` is not passed the active filters.
- **`GET /api/entries/:id/options` has no access check** (any logged-in user can read any card's options).
- **Grading is client-side.** Practice and quiz trust `isCorrect` / `is_correct` from the browser.
- **Password change does not require the current password** (`PUT /api/users/password`).
- **`/api/quiz/:id/results` `best_score` is the most recent result**, not the highest.
- **`appSiteData` is a shared singleton**: concurrent requests can see each other's page title / user name.
- **`deploy.sh -prod` runs `git add .`**, committing all pending (incl. untracked) work as "Auto-format".
- **`.env.example` lists many unused keys** (`DATABASE_URL`, `JWT_*`, `DB_SCHEMA`, `CORS_*`, …).
- **Missing favicon:** every page requests `/favicon.ico` and gets 404 (the header's favicon link is commented out).
- **Footer title:** reads "root' personal Flash Card Service" (stray apostrophe from `appSiteData.getNameHeadingHelp()`).
- **Shared partials fail html-validate:** trailing whitespace in the header's inline script, and buttons without
  `type` in `partials/filter-panel.ejs`.
- **Shared `<main>` grid:** from 1024px, `laptop.css`/`styles.css` make every page's `<main>` a multi-column grid
  meant for the home page (see CODING_STANDARDS 0.4 violations).
- **Unused leftovers:** `src/data/test.db`, `leitner_boxes` and `lessons` tables, `flashcards.is_public`/
  `difficulty`/`lesson_id`, `flashcard_leitner_progress.session_streak`, `user_rights`/`rights` (no routes).

Resolved on 2026-11-04 (IAM phase 3b, part 1):

- ~~organizations/groups API only inside FlashCards~~
  **Resolved:** `IamRouter` takes `authenticate` and `actorOf` options (defaults: FlashCards session, unchanged);
  the IAM service mounts the same router under `/v1` with bearer-token authentication, so both share one
  implementation of the routes and rules. Verified: test:iam-service 49/49 (12 new wiring checks; with the bearer
  check removed, the new checks fail); test:iam 79/79 unchanged; lint and format pass.

Resolved on 2026-11-04 (IAM phase 3a, service foundation):

- ~~the IAM has no service of its own and no tokens~~
  **Resolved (foundation):** `iam-server.js` + `src/scripts/js/modules/iam/` (`IamServer`, `IamV1Router`,
  `TokenService`, `ApplicationCredentials`); `iam.access_tokens` (SHA-256 hashes only, token families);
  `/v1/health`, `/v1/auth/login`, `/v1/auth/refresh` (rotation, reuse revokes the family), `/v1/auth/logout`, `/v1/me`;
  application secrets from `IAM_CLIENT_SECRET_<APP_KEY>` (constant-time compare). `npm run test:iam-service`
  (in `deploy.sh -preview`), `npm run start:iam`. Verified: test:iam-service 37/37 (with reuse detection disabled,
  3 checks fail); test:roundtrip 147/147 and test:iam 79/79 unchanged; the standalone entry point starts, bootstraps
  the IAM schema, reports healthy, and refuses logins without a configured secret; lint and format pass.

Resolved on 2026-11-03 (IAM phase 2, management page):

- ~~no UI for organizations and groups~~
  **Resolved:** `/organizations` page (nav link for signed-in users): organizations list (all for platform admins) and
  create form; per organization: settings, delete (platform admins), members with role menus and remove, groups,
  group members, and group roles. Built to the standards: no inline script (`OrganizationsPage` class in
  `public/js/pages/`), no inline styles, user data via `textContent`, mobile-first `pages/organizations.css` with the
  five tiers; members see no management controls. ESLint gains a browser-scripts block; the preview suite now
  includes `/organizations`; the shared nav wraps on tablet (an extra link overflowed at 768px).
  Verified in headless Chrome against the local server: 27/27 checks (create organization, add member, create group,
  add group member, grant group role, server error shown, member and signed-out views, no inline styles, no console
  errors besides the site-wide favicon 404, page markup valid, no horizontal overflow at 375/768/1024/1280/1920 px);
  screenshots reviewed at phone and desktop width.

Resolved on 2026-11-03 (IAM phase 2, backend):

- ~~IAM has no applications, organizations, or groups; roles are global~~
  **Resolved (backend):** `applications` + `application_users` (signing in requires FlashCards access; first user is
  FlashCards admin and platform admin); roles/rights scoped by app (`NULLS NOT DISTINCT` unique index); organizations,
  members, groups, group members, group roles; view `effective_user_roles` used by every admin check (so group roles
  count); `OrganizationService` + `/api/iam` router; backup format 3.0 with composite natural keys and format 2.0
  compatibility; `LocalTestCase` base class; `npm run test:iam`; `deploy.sh -preview` runs both local-DB tests.
  Verified: `test:iam` 79/79 (negative check: disabling the manager authorization fails 4 checks); `test:roundtrip`
  147/147 including a format 2.0 restore; migration of a populated old-layout database through phases 1 and 2
  (roles converted, existing admin made platform admin once, all users enrolled, logins and every page working),
  started twice with no repeated changes; lint, format, page smoke test.

Resolved on 2026-11-03 (IAM phase 1):

- ~~IAM and app data share the `public` schema; app SQL joins IAM tables; the IAM deletes app data~~
  **Resolved:** each schema file creates its schema (`iam`, `flashcards`) and moves its tables out of `public`
  in a guarded block, so existing databases migrate in place. Adapters set `search_path` per schema
  (`PostgresDatabase.SCHEMA`); app foreign keys reference `iam.users`; `user_rights` moved to `iam`;
  `app-user-data-queries.sql` removed; `deleteUser` deletes only the identity (FK cascade does the rest);
  the 6 `JOIN users` queries replaced by `userAuthService.getUserSummaries()`; introspection, system status,
  backup/restore (schema-qualified import), and the round-trip test made schema-aware.
  Verified on the local DB: (1) **migration** — a database built and populated by the previous commit
  (22 tables in `public`) moved to 7 `iam` + 15 `flashcards` tables with identical row counts, no errors;
  logins and sessions, usernames on shares/public cards, shared-card reads, system status, admin user list,
  every page, and a user delete (their card removed by cascade) all worked; (2) **fresh database** —
  round-trip test 106/106.

Resolved on 2026-11-03 (data safety, part 2):

- ~~recovery needs manual steps; backups are manual; the import can leave a partial restore~~
  **Resolved:** `PostgresDatabase.withTransaction()` (transaction commands in `transaction-queries.sql`);
  `BackupService.importApplicationData` runs every write in one transaction and throws (naming the table) on the
  first failing row. The upsert SQL now takes only identifier lists (`SET (cols) = (SELECT cols FROM (SELECT
EXCLUDED.*) …)`), removing the last inline-SQL fragment in the backup service; its helper closures became methods.
  New `tools/backupClient.mjs` (`BackupClient`, `BackupCli`) with `src/scripts/sh/backup.sh` and `restore.sh`;
  `deploy.sh -prod` takes a production backup before releasing. Verified: round-trip test 106/106 (new step 4: a
  corrupt backup that also renames a user is rejected and nothing changes; with the transaction bypassed the test
  fails). End to end on the local server: `backup.sh` → wipe → `restore.sh` created the admin and restored every
  table (users 3, flashcards 3, media 2, removals 1, progress 1); a restored user logged in with their original
  password; a second restore changed nothing.

Resolved on 2026-11-03 (data safety, part 1):

- ~~backups omit `public_card_removals`~~ and ~~no automated proof that a backup restores~~
  **Resolved:** `public_card_removals` added to `BackupService.appTables`. New OOP test
  `tests/backupRoundTripTest.mjs` (`npm run test:roundtrip`, which runs via `local-db.sh run` and refuses any non-local
  target) seeds synthetic data into every written table, exports JSON + ZIP, wipes the schema, bootstraps, re-creates
  the admin under a new id, imports, and compares every database table (read directly, not via the backup's own
  table list) plus the media bytes; then re-imports to prove idempotency. Result: 84/84 checks. Negative checks:
  removing the table from the backup fails 2 checks; disabling the user merge reproduces the Render error
  (`users_username_key` + FK failures). `deploy.sh -preview` now runs it after the preview suite.

Resolved on 2026-11-03 (scripts folder):

- ~~move deploy.sh into a new src/scripts/sh folder and make every script in it runnable from anywhere in the VS Code terminal, keeping the existing `deploy` command~~
  **Resolved:** `git mv deploy.sh src/scripts/sh/deploy.sh`; the script now resolves the project root
  from its own (symlink-resolved) location instead of assuming it lives at the root.
  `.vscode/settings.json` and `FlashCards.code-workspace` prepend `${workspaceFolder}/src/scripts/sh`
  to the terminal `PATH`. The `deploy` alias and `PATH` line in `~/.bashrc` were repointed to the new
  folder (backup: `~/.bashrc.bak-flashcards-2026-11-03`). Verified from `/tmp`: `deploy`, `deploy.sh`,
  and a throwaway new script all ran, both via `.bashrc` and via the VS Code `PATH` alone
  (no `.bashrc`), and the deploy log still resolved to `<project>/.deployment/`.

Resolved on 2026-11-03 (review pass):

- ~~admin backup import into a new Render database fails: "Failed to import row in flashcards: … violates
  foreign key constraint flashcards_user_id_fkey" (141 warnings)~~
  **Resolved:** users were upserted by `user_id` only; an admin re-created in the new database has the
  same username but a new id, so the backup's user row hit the `users` unique constraint and every
  dependent row lost its foreign key. `BackupService.importApplicationData` now matches backup users to
  existing accounts by username (case-insensitive, then email) and rewrites `user_id`, `created_by`,
  `owner_id`, `recipient_id` throughout the backup before importing. Verified with the 2026-11-02
  backup against a simulated DB holding a re-created `tmann`: 500 failed rows before → 0 after
  (134 flashcards, 119 shares, 222 progress rows imported).
- ~~fresh database: first start reports schema bootstrap failure~~
  **Resolved:** `ALTER TABLE flashcard_options …` ran before `CREATE TABLE flashcard_options`; moved after it.
- Documentation rewritten/corrected against the code (API, schema, architecture, structure, Leitner,
  difficulty, options, repetitions, setup, env vars, deploy, testing); point-in-time reports and
  superseded plans are bannered.

Resolved on 2026-11-03 (round 8):

- ~~the views have a lot of style information in them; this needs to be refactored to use the CSS files correctly and maintain the responsive design; there should be no inline style info in the views or in the JS (JS may perform class modifications but no inline styling)~~
  **Resolved:** All styling now lives in the public/css files: every per-page
  `<style>` block was extracted to css/pages/&lt;page&gt;.css (home, login,
  logout, entries, practice, profile, quiz), the header and filter-panel
  partial styles moved to a shared css/app.css (with a .hidden utility,
  text utilities, and stepped .progress-wN width classes), and the header
  links styles.css + app.css + the active page's stylesheet. Every inline
  style="..." attribute (including HTML built in JS template strings) was
  replaced with semantic classes, and all JS element.style manipulation was
  converted to classList operations; dynamic progress-bar widths use the
  stepped width classes. Verified with zero remaining style attributes,
  style blocks, or .style. references across views and public/js, plus
  browser tests of the filter toggle, question-type panels, edit modal,
  full practice answer flow, quiz setup/progress, profile storage bar, and
  home dashboard. Responsive design preserved (existing core/desktop/
  tablet/mobile files untouched) — and improved: the practice options grid's
  mobile single-column layout had been overridden by an inline display:flex,
  which the class-based approach removes.
- ~~when I attached an image for the question it did not show up with the text as a caption~~
  **Resolved:** The /api/practice/next card payload whitelisted only
  question/answer/box fields and dropped question_form/question_media_data
  (and the lang/answer_lang/answer_mode/question_type fields the practice UI
  reads), so attached question media never rendered in practice. The payload
  now carries all block, type, and language fields; verified in-browser that
  the question image renders together with its text caption in practice (the
  entries list and quiz already showed both).

Resolved on 2026-11-03 (round 7):

- ~~export and import should use two linked file types: a JSON for the data and a zip of the media for the media, bidirectional, at all import and export points in the app (entries export/import and admin backup download/import)~~
  **Resolved:** Both import/export points now use the two-file model, linked by
  media id (the JSON references media ids; the ZIP stores each item as
  media/&lt;media_id&gt;.&lt;ext&gt; with real binary content), bidirectionally:
  - **Entries:** GET /api/entries/export produces a v2 JSON (blocks, languages,
    answer modes, authored options, media manifest) and
    GET /api/entries/export/media the linked ZIP, both honoring the same
    filters; the Export button downloads both files when media exists. Import
    accepts the JSON plus the ZIP selected together (file picker takes
    .json/.zip, multiple); media references resolve against the archive,
    imports are quota-checked including media bytes, and a JSON-only import
    still brings in all text content with a per-media skip count.
  - **Admin backup:** the backup JSON now includes the media table (previously
    missing from backups entirely) with binary data stripped into the linked
    ZIP (GET /api/admin/backup/download-media, download button next to the
    JSON one); import accepts the optional ZIP, restores media data by id, and
    when the ZIP is absent it scrubs dangling media references so card/option
    upserts never fail on foreign keys (warned per item, nothing else lost).
    Shared machinery is the new MediaArchiveService (dataURL&lt;-&gt;binary, ZIP
    build/parse, manifest). Verified by full roundtrips: entries exported
    (3 cards, 4 media), wiped, reimported from the two files with all forms and
    media intact; JSON-only import skipped exactly the 4 media; admin backup
    exported both files (data stripped from JSON, 4 ZIP items), wiped, restored
    140 flashcards + 4 media with FK references intact and 0 warnings; scrub
    path produced warnings instead of failures; browser test confirmed the
    Export button downloads both files and the import picker accepts both.

### multimedia question/answer unified model

**Implemented 2026-11-03 (round 6).** Every content slot (question, answer, each
authored option) is a media block with a form of text / image / text+TTS /
audio (recorded). Media lives in a `media` table referenced by id
(question_media_id / answer_media_id / option_media_id); the v1 inline columns
(question_image / answer_image / question_audio) were migrated into media rows
and dropped (no legacy). Each card has a question language (`lang`, drives TTS,
speech recognition, and localized True/False buttons) and an optional answer
language (`answer_lang`, used for answer-side TTS and listen-mode recognition;
defaults to the question language — the card builder decides whether the two
sides share a language). `answer_mode` 'listen' replaces the choices with a
Say-the-Answer flow: the browser's SpeechRecognition (configured to the answer
language) transcribes the user's speech and matches it against the answer text
as a pronunciation test. Non-text answer blocks draw same-form distractors
(images compete with images, audio with audio) from the same class+category.

Follow-up fixes (2026-11-03, round 6b):

- ~~when you choose an audio question, is the text block for the question used at all? if not it will cause confusion~~
  **Resolved:** It is used — the text is shown (and read aloud) alongside the
  audio — but it is now explicitly optional: for audio questions the form
  relabels the field to "Question caption (optional)", drops the required flag,
  and the hint explains that the recording is the question. The server accepts
  an empty question when the question block is recorded audio (and still
  rejects audio cards with neither text nor a recording). Practice, quiz, and
  the entries lists hide the empty text (lists show a "🔊 Audio question"
  placeholder instead).
- ~~when there are multiple possible answers, the image answer needs to allow multiple images with the same capabilities as text multiple-option answers~~
  **Resolved:** Each authored option row (create and edit forms) now has a 📷
  image attach button (2MB max, preview + remove); image options post as
  {form: 'image', media} blocks, mix freely with text options, keep the same
  correct/wrong marking (including All/None-of-the-above), and the edit dialog
  loads existing option images back for re-editing. Verified end-to-end: a
  multiple-choice card with two image options and one text option plays in
  practice with the images rendered as the answer buttons. Also fixed in this
  pass: replacing a card's options or deleting a card now garbage-collects
  media rows that are no longer referenced (previously they were orphaned and
  kept counting against the user's storage quota).

Original design notes follow.

Concept: every content slot is a "media block" that can take one of four forms:

1. text
2. image
3. text + text-to-audio (TTS reads the text aloud; language/voice selectable)
4. audio (recorded)

Applied to the question kinds:

- **Standard (Question / Answer):** the question is a media block and the answer
  is a media block - any form on either side.
- **True/False:** the question is a media block (including audio forms); the
  answer remains the True/False toggle buttons, but the button labels/speech
  should follow the language of the question (e.g. localized True/False and TTS
  in that language).
- **Multiple choice (preselected options):** the question is a media block and
  every authored option is itself a media block - options can be text, images,
  text+TTS, or recorded audio clips.

Design points carried from the v1 review (all addressed by the implementation
except the media library/reuse UI and the say-the-question pronunciation
variant, which remain future follow-ups):

- options table must gain media columns (option image/audio + form marker)
- an answer_audio slot / answer-side TTS falls out of the model naturally
  (answer is a media block)
- image-form answers require authored options (pool text-matching does not
  apply to images)
- TTS language/voice selection per card (question language) so listening and
  the T/F buttons follow the question's language
- media library/reuse should be designed together with the JSON + media-zip
  export so media is referenced by id rather than duplicated per card
- pronunciation variant: say the question (reading) vs say the answer (recall)

Confirmed decisions (2026-11-03):

- standard-type scoring with non-text answer blocks: distractors are drawn from
  other cards' answer blocks of the same form in the same class+category
  (images compete with images, audio with audio); text pool behavior unchanged
- one lang per card (the question language) drives TTS voice selection and
  True/False button localization (built-in label map + TTS in that language)
- media is stored in a media table and referenced by id from blocks, so the
  JSON + media-zip export references media files by id instead of duplicating
  data per card; v1 inline columns (question_image/answer_image/question_audio)
  are migrated into blocks and dropped (no legacy)
- NEW answer type "listen": the user answers by speaking; the recording is
  converted via speech recognition and the transcript is matched against the
  answer text - testing pronunciation. This is an answer mode on the card
  (choice vs listen) available for any question form whose answer has text to
  match against.

Follow-up fixes (2026-11-03, round 6c):

- ~~the audio and multiple choice card types still do not allow multiple images to be added as possible answers with a track on which are correct or not (only allow 1); it needs the same multi-answer ability as the text answers~~
  **Resolved:** Verified working in the current code — every option row has its
  own 📷 image attach, any number of image options can be added, and each keeps
  its own correct/wrong checkbox (confirmed by browser test: a card with
  multiple image options plus correct flags stored and played). The behavior
  was missing on Render only because the feature wave had not been deployed
  yet. Additionally, several-correct now plays properly (next item).
- ~~the images also need to allow multiple to be correct, so the answer needs to accommodate that~~
  **Resolved:** When several options (but not all) are marked correct, the
  question plays as select-all-that-apply in both practice and quiz: options
  toggle instead of radio-select, a note says "Select all correct answers",
  practice gains a Check Answers button, and the answer is correct only when
  the selected set matches the correct set exactly (verified: superset
  selection scores incorrect with correct options highlighted; exact set
  scores correct; quiz scored 100% on an exact-set answer). All-correct and
  all-wrong sets keep their All/None-of-the-above behavior.
- ~~in the question display (practice / quiz) it should be either text entries or images, not both~~
  **Resolved:** Answer options must now be homogeneous — all text or all
  images. Enforced client-side (create and edit forms show an error before
  posting) and server-side (EntriesService.validateOptionForms throws a
  400 "Answer options must be all text or all images, not a mix" on create
  and update).
- ~~a quiz should only present a form of a question that was practiced; if text or image was presented, only the version practiced will be available in quiz~~
  **Resolved:** The quiz card pool now requires at least one practice attempt
  on the card by this user (flashcard_leitner_progress with recorded attempts).
  Because question/answer/option forms are stored on the card and quiz renders
  from the same stored blocks practice uses, a practiced card always appears in
  the quiz in exactly the form (text/image/TTS/audio) it was practiced in.
  Verified: an unpracticed card is excluded ("No flashcards available for
  quiz"); after one practice attempt the card appears in the quiz with the
  same image options.

Resolved on 2026-11-03 (round 5 follow-up):

- ~~the true false should not force the user to type true or false; the answer should be a toggle button in the setup, and practice and quiz should follow this UX standard~~
  **Resolved:** The create and edit forms show a True/False toggle button pair for
  true/false cards (the answer textarea is hidden and populated from the toggle);
  practice and quiz already presented True/False as clickable option buttons, and
  this was re-verified. Also fixed: the single-card fetch used by the edit dialog
  did not return question_type/media, so edits loaded as 'standard'.

Resolved on 2026-11-03 (round 5):

- ~~true/false questions~~
  **Resolved:** question_type 'true_false' renders a fixed True/False pair scored
  from the answer text, in both practice and quiz.
- ~~multiple choice where the card provides its own wrong options~~
  **Resolved:** question_type 'multiple_choice' with an authored options editor
  (create and edit forms); a mixed correct/wrong set plays exactly as authored.
- ~~list-of-correct-answers questions with an "All of the above" option~~
  **Resolved:** when every authored option is marked correct, the generator
  appends "All of the above" as the correct answer.
- ~~list-of-all-wrong-options questions with "None of the above" functionality~~
  **Resolved:** when every authored option is marked wrong, the generator appends
  "None of the above" as the correct answer.
- ~~audio-recording questions~~
  **Resolved:** question_type 'audio' records in-browser (MediaRecorder), stores
  the clip with the card, plays it in practice and quiz, and is answered through
  the same option machinery as the other types.
- ~~investigate audio reading (text-to-speech) of any question~~
  **Resolved (implemented):** speaker buttons on practice and quiz questions use
  the browser speechSynthesis API - free, no keys, all modern browsers.
- ~~investigate requiring a question to be answered with audio and testing pronunciation~~
  **Resolved (browser tier implemented):** a "Say answer" button on practice uses
  SpeechRecognition (Chrome/Edge/Safari) and matches the transcript against the
  correct option as a practical pronunciation check, auto-selecting on a match.
  Phoneme-level scoring would require a paid cloud service (e.g. Azure Speech
  pronunciation assessment) and remains a possible future upgrade.
- ~~image upload as the question or the answer in all card forms~~
  **Resolved:** question and answer image uploads (2MB each) on the card forms,
  stored in Postgres and rendered on practice, quiz, and entries lists.
- ~~the sys admin should be able to limit a user's storage max...~~
  **Resolved:** users.storage_max_bytes (default 25MB) adjustable via
  PUT /api/admin/users/:userId/storage-limit; the profile shows a used/max/
  remaining usage bar; card creation is blocked with a clear message when over;
  if an admin reduces the limit below current usage the profile shows a red
  over-limit notice telling the user to remove elements (deeper enforcement
  deferred as agreed). All question types are also verified available in the
  quiz via the shared option generator.
