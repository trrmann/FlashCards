# FlashCards Documentation

FlashCards is an Express 5 + EJS + PostgreSQL web app for studying flashcards. It includes a 3-box
Leitner practice system, multiple-choice quizzes, card sharing and public cards, multimedia cards
(image, recorded audio, text-to-speech, voice answers), per-user storage quotas, and admin backup and restore.
It runs on Render.

All project documentation lives in this folder. The root `README.md` only points here.

## Start here

| If you want to…                       | Read                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Follow the coding standards (binding) | [CODING_STANDARDS.md](./CODING_STANDARDS.md)                                         |
| Get a local environment running       | [SETUP_QUICK_START.md](./SETUP_QUICK_START.md)                                       |
| Look up a command or URL fast         | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)                                           |
| Understand how the code is organized  | [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md), [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Call or change an endpoint            | [API_ENDPOINTS.md](./API_ENDPOINTS.md)                                               |
| Change the database                   | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)                                           |
| See what's open / recently fixed      | [Issues.md](./Issues.md)                                                             |

## Current reference (kept in sync with the code)

### System

- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md): directories, pages, npm scripts
- [ARCHITECTURE.md](./ARCHITECTURE.md): layers, data flows, security state
- [API_ENDPOINTS.md](./API_ENDPOINTS.md): every page and API route
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md): tables, bootstrap, query files
- [LOCAL_DATABASE.md](./LOCAL_DATABASE.md): local scratch PostgreSQL for schema/migration work
- [IAM_MULTI_APP_DESIGN.md](./IAM_MULTI_APP_DESIGN.md): IAM separation, multi-app support, organizations and groups, WurmTools integration (approved design, not built yet)
- [SYSTEM_INITIAL_SETUP.md](./SYSTEM_INITIAL_SETUP.md): first-user setup, system endpoints, restoring into a new DB

### Study features

- [LEITNER_SYSTEM.md](./LEITNER_SYSTEM.md): boxes, due rules, catch-up, stats
- [REPETITIONS_IMPLEMENTATION.md](./REPETITIONS_IMPLEMENTATION.md): per-session repetitions (3/2/1)
- [NONE_OF_ABOVE_FEATURE.md](./NONE_OF_ABOVE_FEATURE.md): how answer options are built (all card types)
- [DIFFICULTY_SCORING.md](./DIFFICULTY_SCORING.md): difficulty score and where it is used
- [FILTER_IMPLEMENTATION.md](./FILTER_IMPLEMENTATION.md), [FILTER_AWARE_STATS.md](./FILTER_AWARE_STATS.md),
  [DIAGNOSTIC_INSUFFICIENT_ENTRIES.md](./DIAGNOSTIC_INSUFFICIENT_ENTRIES.md): practice filters

### Operations

- [ENVIRONMENTS.md](./ENVIRONMENTS.md): dev / preview / prod
- [RENDER_ENVIRONMENT_VARIABLES.md](./RENDER_ENVIRONMENT_VARIABLES.md): every env var the code reads
- [RENDER_ENV.md](./RENDER_ENV.md): check and manage Render service variables with the local CLI
- [RENDER_ENV.md](./RENDER_ENV.md): check and manage Render service variables with the local CLI
- [PORT_CONFIGURATION.md](./PORT_CONFIGURATION.md): 5000 / 4000 / 3000
- [DEPLOY.md](./DEPLOY.md), [DEPLOY_QUICK_REFERENCE.md](./DEPLOY_QUICK_REFERENCE.md),
  [DEPLOY_AUTO_FORMAT.md](./DEPLOY_AUTO_FORMAT.md), [DEPLOY_ACCESSIBILITY.md](./DEPLOY_ACCESSIBILITY.md): `deploy.sh` and running any `src/scripts/sh` script from anywhere
- [CODING_STANDARDS.md](./CODING_STANDARDS.md): binding coding and workflow standards
- [CODE_QUALITY.md](./CODE_QUALITY.md): ESLint + Prettier tooling
- [TESTING_INDEX.md](./TESTING_INDEX.md), [TESTING_PREVIEW.md](./TESTING_PREVIEW.md),
  [TESTING_QUICK_REFERENCE.md](./TESTING_QUICK_REFERENCE.md): the preview quality suite

### Working notes

- [Issues.md](./Issues.md): open issues and resolution log

## Historical records

These are point-in-time reports, each with a banner saying what has changed since:
BUG_FIX_CATEGORY_FILTER_COMPLETE, BUG_FIX_TIMING_ISSUE_FINAL, BUG_REPORT_CATEGORY_NOT_STORED,
CORRECTED_FILTER_SEMANTICS, FILTER_NULL_HANDLING_FIX, FILTER_SCENARIOS_VERIFIED,
FINAL_IMPLEMENTATION_STATUS, FINAL_VERIFICATION_ALL_TESTS_PASSING, VERIFICATION_RESULTS,
VERIFIED_BROWSER_TEST, VERIFIED_TEST_RESULTS, SESSION_SUMMARY_FINAL, PHASE2_AUTHENTICATION_COMPLETE,
PHASE4_ENTRIES_AND_LESSONS, DATABASE_SETUP_COMPLETE, PRACTICE_FILTERING_COMPLETE, FILTERING_VISUAL_SUMMARY.

## Superseded plans and proposals

These were written before or alongside implementation and describe designs the code doesn't follow
(`DATABASE_URL`, per-app Postgres schemas, JWT, `/api/cards`, unit-test suites, Firefox testing).
Each has a banner pointing to its replacement:
DEV_ENVIRONMENT_SETUP, SETUP_CHECKLIST, SETUP_GUIDE_INDEX, README_START_HERE, MULTI_APP_ARCHITECTURE,
DEPLOYMENT_STRATEGY, ROADMAP, TESTING_STRATEGY, FIREFOX_TESTING, FIREFOX_TESTING_QUICK_SETUP,
W3C_QUICK_ANSWER, W3C_VALIDATION_STATUS.

## Sample data

`language_flashcards.json`, `flashcards-p40007y-*.json`, and `flashcards-tmann-*.json` are entries-format
exports usable with **Entries → Import**. Full admin backups (`flashcards-backup-*.json`) contain
password hashes and are git-ignored. Don't commit them.

## Keeping docs current

When you change a route, table, env var, or script, update the matching current-reference doc in the
same commit. Don't put credentials, hostnames, or real user data in any document.
