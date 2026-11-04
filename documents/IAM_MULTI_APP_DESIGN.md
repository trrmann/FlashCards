# IAM Separation and Multi-App IAM: Requirements and Design

**Status:** design approved (2026-11-03). Not implemented. Work happens first against the local scratch
database ([LOCAL_DATABASE.md](./LOCAL_DATABASE.md)), never first on the shared production database. The binding rule is [CODING_STANDARDS.md § 0.8](./CODING_STANDARDS.md).

## Requirements (owner)

1. The IAM (identity and access management) model is **separated from the FlashCards model in the database**,
   not only in code (the database adapter objects are already separate).
2. The IAM serves **more than one application**. FlashCards is the first app; others (e.g. Todos, Notes) can be added.
3. The IAM manages **organizations** and **groups**. Management only is the first phase; **group-level
   data isolation** (data visible only within a group) is the long-term goal.
4. The IAM used by **WurmTools** (`../WurmTools/wurm-tools`) is brought into this IAM. WurmTools itself is
   due for a refactor (see "WurmTools" below).

## Current state (as of 2026-11-03, after phase 1)

| Aspect             | Today                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Code               | Separate adapters: `IdentityManagementDatabase` (IAM SQL file) and `FlashCardsDatabase` (app SQL file)            |
| Physical storage   | **Separated (phase 1, 2026-11-03):** `iam` and `flashcards` schemas, one per adapter `search_path`                |
| App → IAM coupling | Foreign keys to `iam.users` only. Usernames via `userAuthService.getUserSummaries()` (no app SQL on IAM tables)   |
| IAM → app coupling | None: `deleteUser` deletes the identity; app rows cascade via their foreign keys                                  |
| Rights             | `roles`/`rights`/`role_rights`/`user_roles`/`user_rights` all in `iam`. Only `admin` role membership is checked   |
| Multi-app          | **Phase 2 (backend):** `applications`, `application_users` (sign-in requires access), app-scoped roles and rights |
| Orgs / groups      | **Phase 2:** organizations, members, groups, group roles; `/api/iam` API and the `/organizations` management page |
| Sessions           | `session` table created by the IAM schema, used by FlashCards' `express-session`                                  |

## Proposed design

### 1. Physical separation: one PostgreSQL schema per domain

```text
<database>
├── iam         # identity and access: users, apps, orgs, groups, roles, rights, sessions
└── flashcards  # FlashCards app data (all current app tables)
(future apps get their own schema: todos, notes, …)
```

- Each adapter connects with its own `search_path` (`iam` or `flashcards`), so table names stay unqualified
  within a domain. The schema SQL files create and own their schema.
- This works within the single free Render database. A separate database per domain would need another
  instance, which would also expire, and it would rule out foreign keys between app data and users.
- App tables keep foreign keys to `iam.users(user_id) ON DELETE CASCADE`. Deleting an identity then
  removes that user's data in every app automatically, and the IAM no longer needs to know any app's tables.
- **Coupling rule:** app SQL never reads IAM tables, and IAM code never reads app tables. Apps get user
  details (username, display name, memberships, effective rights) through the IAM service class
  (in-process today, could become an API later). The only cross-schema link is the `user_id` foreign key.

### 2. Multi-application IAM model (`iam` schema)

| Table                  | Purpose                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `applications`         | `app_id`, `app_key` (unique, e.g. `flashcards`), name, status                              |
| `users`                | Global identity (as today). One account works across all apps                              |
| `application_users`    | Which users may use which app (`app_id`, `user_id`, status, joined_at)                     |
| `organizations`        | `org_id`, name, unique slug, status, created_by                                            |
| `organization_members` | `org_id`, `user_id`, `org_role` (`owner` / `admin` / `member`)                             |
| `groups`               | `group_id`, `org_id` (owning organization), name (unique within the org), description      |
| `group_members`        | `group_id`, `user_id`                                                                      |
| `roles`                | `role_id`, `app_id` (NULL = platform-wide), `role_name`. Unique on (`app_id`, `role_name`) |
| `rights`               | `right_id`, `app_id`, `right_key`. Unique on (`app_id`, `right_key`)                       |
| `role_rights`          | Rights granted by a role                                                                   |
| `user_roles`           | `user_id`, `role_id`, optional `org_id` scope (role held within one organization)          |
| `group_roles`          | `group_id`, `role_id`. Every member of the group holds the role                            |
| `user_rights`          | Per-user grant/deny overrides (moved here from the app schema)                             |
| `session`              | `express-session` store. Each app uses its own cookie name                                 |

**Effective rights** for (user, app, optional org) = rights from the user's direct roles, plus roles of
the groups the user belongs to, then per-user overrides applied, limited to the app (plus platform-wide roles).

**Administration levels:**

- **Platform admin** (platform-wide role): manages applications, all users, and all organizations.
- **App admin** (e.g. FlashCards `admin`): manages that app's users and settings. This is today's `admin`.
- **Organization owner/admin**: manages that organization's members and groups.

### 3. Migration (from the current single-schema layout)

Every step is an idempotent statement appended to the schema files (CODING_STANDARDS § 5), and must
keep a current backup restorable (§ 0.7):

1. **Develop and test on the local database first.** Before any step runs on the shared database, the gate
   (Issues item 1) and data safety (item 2) must be done, and a fresh full backup taken.
2. Create the `iam` and `flashcards` schemas. Move existing tables with guarded
   `ALTER TABLE public.<t> SET SCHEMA <schema>`. Foreign keys, indexes, and data move with the table.
3. Point each adapter's `search_path` at its schema. Remove the 6 `JOIN users` queries in favor of IAM
   service lookups. Replace `deleteUser`'s app-table deletes with the cross-schema cascade.
4. Create the new IAM tables. Seed `applications` with `flashcards`. Scope the existing `admin`/`user` roles
   to the FlashCards app, and create `platform_admin` (granted to the current admins). Enroll all existing
   users in `application_users`. Move `user_rights` into `iam`.
5. Backup format **v3**: separate IAM and per-app sections, including the new tables. Restore keeps accepting v2.
6. UI: organization and group management (platform/org admins), and app-access management (app admins).
7. Tests (§ 0.6): API tests for every new endpoint, plus a v2 → v3 restore round trip.

> **Shared-database risk:** `deploy.sh -dev` and `-preview` use the production database, so starting either
> with the new schema migrates production. Until the migration is approved for production, run the work in
> progress only with `local-db.sh serve`.

## Owner decisions (2026-11-03)

| #   | Question                | Decision                                                                                          |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Physical separation     | **Separate schemas in the one database** (`iam`, one schema per app)                              |
| 2   | Groups                  | **Approved as proposed:** groups belong to an organization; users can be in several organizations |
| 3   | Orgs/groups inside apps | **Management only for now.** Group-level data isolation is a later phase                          |
| 4   | Admin levels            | **Approved:** platform admin, app admin, organization owner/admin                                 |
| 5   | Scratch database        | **Approved:** a local PostgreSQL (set up as `local-db.sh`, see LOCAL_DATABASE.md)                 |

## WurmTools: the second application

Reviewed read-only on 2026-11-03 at `../WurmTools/wurm-tools` (GitHub `trrmann/wurm-tools`, v1.5.3).

**Architecture today:** a static Vite site deployed on Render, plus a **local helper** process
(`scripts/wurm-local.js`) on each player's machine. The helper serves the APIs and stores data in local
files (`heroes.db`, and the identity store `heroes.db.identity`, an encrypted JSON file).

**Its IAM (scripts/heroes-identity.js, heroes-access.js, heroes-subscriptions.js; ≈ 2,600 lines server side,
≈ 3,100 lines client side in `src/js/tools/heroes/`):**

| Capability                                                   | WurmTools today                                                                          | Place in the shared IAM                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Accounts                                                     | username, scrypt password hash + salt, personal name, preferences, disabled              | `users` (+ app profile data stays in the app)                                                |
| App roles                                                    | `visitor`, `player`, `game-master`, `admin`; user selects an **active role** per session | app-scoped `roles` for app `wurm-tools`; active role is a session attribute                  |
| MFA                                                          | TOTP + hashed recovery codes; **required for admins**                                    | new IAM capability: `user_mfa`, recovery codes                                               |
| Sessions                                                     | bearer tokens, 8 h (10 min until MFA completes), per origin                              | IAM-issued tokens (see the service decision)                                                 |
| First admin                                                  | one-time setup code                                                                      | same as FlashCards initial setup, per app                                                    |
| Invitations                                                  | admin invites with preset roles; redeem; revoke                                          | new: `invitations` (app, org, roles, expiry)                                                 |
| Role requests                                                | user requests a role; admin reviews; cancel                                              | new: `role_requests`                                                                         |
| Impersonation                                                | start/respond/release with **approval** and an **audit log**                             | new: `impersonation_sessions` + `audit_log`                                                  |
| Account closure                                              | request / accept / reject workflow                                                       | new: user lifecycle states + requests                                                        |
| Login throttling                                             | per-label attempt counters                                                               | new: `login_attempts`                                                                        |
| Directory / presence                                         | public listing, online status                                                            | IAM directory (`is_public`) + app presence                                                   |
| Resource permissions                                         | ownership, transfers, grants, per-object permissions, subscriptions, scope invitations   | new generic ACL: `resource_grants` (principal = user/group/role, resource type + id, action) |
| Game data (worlds, play relationships, messages, wurmAccess) | in the app store                                                                         | **stays in the app** (`wurm_tools` schema)                                                   |

The C# classes in `src/misc/identityAccessManagement/` (AclEngine, AceEntry, SecurityRole, SystemRoles,
PermissionAction, DynamicIdentityManager) describe the same resource ACL idea: a role is granted an action
(Create/Read/Update/Delete/Execute) on a resource, and `Admin` bypasses checks. The generic
`resource_grants` table is the database form of those ACEs. It's also the mechanism for the later
group-level isolation phase (a grant to a group on a resource scope). Note that each C# class exists twice
with different filename casing, and the copies differ.

**Additional IAM tables this adds to the model:**

| Table                    | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `user_mfa`               | TOTP secret (encrypted), enrollment state, last used step                          |
| `user_recovery_codes`    | Hashed one-time recovery codes                                                     |
| `invitations`            | Token hash, app, optional org, preset roles, expiry, created/redeemed/revoked      |
| `role_requests`          | User, app, requested role, status, reviewer, timestamps                            |
| `impersonation_sessions` | Actor, target, approval state, start/end                                           |
| `audit_log`              | Who did what to whom (admin actions, impersonation, role changes)                  |
| `login_attempts`         | Throttling counters per identifier/IP                                              |
| `access_tokens`          | Hashed bearer/refresh tokens for non-cookie clients (the WurmTools helper/site)    |
| `resource_grants`        | Generic ACL entries: principal (user/group/role) × app × resource type/id × action |

**Password hashes:** FlashCards uses bcrypt and WurmTools uses scrypt. The shared IAM stores the
algorithm with each hash, verifies either one, and rehashes to the standard algorithm on the next successful login.

**Migrating WurmTools users:** each installation has its own local identity file, so the same person can
exist in several installs. Migration imports each file through an IAM import endpoint, matched by
username/email (the same merge rule as backup import), with conflicts reported for an admin to resolve.

**The WurmTools refactor itself** (a separate project and repository, planned there) should, when it
happens: remove the duplicate C# sources and the committed installer cache / build artifacts; replace
the local identity store with the shared IAM; and adopt these same coding standards. The project already has
tooling worth reusing here (local W3C HTML/CSS validators in `scripts/w3c-local.js`, Lighthouse/memory/
CSS-overview scripts, a `bigscreen.css` tier).

## Architecture decision: separate IAM service (owner, 2026-11-03)

The IAM runs as its **own service** (a small Node app on Render using the `iam` schema), with a token-based
HTTP API: login, MFA, refresh, user info, effective rights, and admin endpoints. FlashCards and WurmTools are
both clients, and one login works across apps. The alternative (the IAM API hosted inside FlashCards) was rejected:
it would make every app depend on FlashCards being up.

Phase 1 (schema separation inside FlashCards) comes first and is unchanged by this decision.

## Phase 3 design: the IAM service

**Status:** design written 2026-11-04. Step 3a (service foundation and token model) is built on the local
database. Steps 3b–3e follow. Defaults below stay within the approved decisions. The questions that are the
owner's call are listed at the end of this section.

### Shape

- **Process:** a separate Node/Express process, `iam-server.js` (entry point), with its code in
  `src/scripts/js/modules/iam/`. It is the only process that reads or writes the `iam` schema once phase 3
  is complete. It reuses the IAM domain services (`userAuthService`, `organizationService`) that already
  live in the IAM domain.
- **Repository:** same repository as FlashCards for now, deployed as a second Render web service from the
  same repo with a different start command. It can move to its own repo later without code changes, because it
  shares no modules with FlashCards except the generic database base class.
- **Versioned API** under `/v1`, JSON in and out, the same `{ status, message }` error shape as FlashCards.
- **Port:** `IAM_PORT`, default 5100 locally. Render assigns `PORT` in production.

### Who is calling: application credentials and user tokens

| Caller                                                      | Credential                                                               | Used for                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| An application's server (FlashCards today, WurmTools later) | `X-IAM-Client-Id: <app_key>` and `X-IAM-Client-Secret: <secret>` headers | Login, registration, refresh, and app-level lookups (user summaries, directory) |
| A signed-in user, through an application                    | `Authorization: Bearer <access token>`                                   | `/v1/me`, organizations/groups management, logout                               |

- **Application secrets** come from the IAM service's environment: `IAM_CLIENT_SECRET_<APP_KEY>`
  (e.g. `IAM_CLIENT_SECRET_FLASHCARDS`), compared in constant time. Nothing secret is stored in the database,
  and rotation is an environment change on both services.
- **Tokens are opaque** random values (32 bytes, base64url). The database keeps only a SHA-256 hash
  (`iam.access_tokens`), so a database leak doesn't reveal usable tokens, and any token can be revoked
  immediately. JWTs were not chosen: they can't be revoked before expiry without a lookup anyway.
- **Access tokens** last 1 hour. **Refresh tokens** last 30 days and **rotate** on every use. Each login starts
  a token _family_. Presenting an already-used refresh token is treated as theft and revokes the whole family.
- A token belongs to one application (the one that logged the user in). `/v1/me` reports admin status for
  that application.
- Tokens are transient, like sessions: they are **not** in backups. After a restore, users sign in again.

### How FlashCards uses it (step 3c)

FlashCards keeps its own browser session cookie (the browser never sees IAM tokens; this is the
backend-for-frontend pattern). On login, FlashCards calls `POST /v1/auth/login` with its application
credentials and stores the returned tokens in its server-side session. `userAuthService` is replaced by an
`IamClient` class with the same methods, implemented as HTTP calls. Admin and role checks call `/v1/me`, cached in
the session for a short time. The `/api/iam` routes and `organizationService` move into the service, and the
`/organizations` page calls FlashCards, which forwards to the service with the user's token. The FlashCards
session table moves from `iam` to the `flashcards` schema, because it belongs to the app.

### Backups (step 3d)

Each service backs up its own domain. The IAM service gets `/v1/admin/backup` (IAM tables, minus
`session` and `access_tokens`), and FlashCards' backup covers the `flashcards` schema. `backup.sh` and
`restore.sh` handle both files, and the round-trip test covers both. Backup format 4.0, with 3.0 and 2.0 still accepted.

### Steps

| Step | Content                                                                                                                                                                     | Status                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 3a   | Service process, health, application credentials, token model (login, refresh with rotation and reuse detection, logout, `/v1/me`), `iam.access_tokens`, service test suite | Built (local DB)                                                                                             |
| 3b   | Move `/api/iam` (organizations, groups, platform admins, app access) and user admin/directory endpoints into the service                                                    | Organizations/groups API served by the service (shared `IamRouter`); user admin and directory endpoints next |
| 3c   | FlashCards switches to `IamClient` over HTTP; FlashCards session table moves to `flashcards`                                                                                |                                                                                                              |
| 3d   | Per-service backups (format 4.0), deploy scripts start both services, Render setup                                                                                          |                                                                                                              |
| 3e   | MFA (TOTP + recovery codes), invitations, role requests, impersonation + audit, login throttling, `resource_grants`                                                         |                                                                                                              |

### Owner decisions for phase 3

1. **Render plan for the IAM service.** On the free plan a web service sleeps after 15 minutes idle and takes
   about 50 seconds to wake. Every FlashCards login would then wait for the IAM service to wake as well.
   The options are the free plan (accept cold starts), a paid instance for the IAM service, or keeping the IAM
   in-process until traffic justifies a second service. The decision to separate stands; this is only about when
   and how it is hosted.
2. **Repository:** keep the IAM service in this repository (the default above), or create its own repository now?
3. **Token lifetimes:** 1 hour access / 30 days refresh by default. Should "remember me" be longer, or idle
   sessions shorter?

## Phases

1. **Separation (FlashCards only):** `iam`/`flashcards` schemas, adapters on their own `search_path`,
   remove cross-domain SQL, cascade deletes via FK. Developed and tested on the local database.
2. **Multi-app core:** applications, app access, app-scoped roles/rights, platform/app/org admin levels,
   organizations and groups (management UI and APIs), backup format v3. _Done (2026-11-03, local DB): backend, API, backup v3, tests, and the `/organizations` management page._
3. **IAM as a separate service**, tokens, MFA, invitations, role requests, impersonation +
   audit, throttling, `resource_grants`.
4. **WurmTools onto the shared IAM** (in that repo's refactor), plus migration of its local identity files.
5. **Group-level data isolation** using `resource_grants` scopes.
