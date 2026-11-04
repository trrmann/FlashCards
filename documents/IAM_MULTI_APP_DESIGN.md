# IAM Separation and Multi-App IAM

The IAM design (requirements, data model, owner decisions, phases, token lifetimes) moved with the code to the
**iam-service** repository. The canonical copy is `iam-service/documents/IAM_DESIGN.md`; its API is
`iam-service/documents/API.md`.

What stays in FlashCards:

- the `flashcards` schema and its foreign keys to `iam.users` ([DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md));
- `/api/iam`, served in-process from iam-service's `OrganizationRouter` with the FlashCards session
  ([API_ENDPOINTS.md](./API_ENDPOINTS.md)), until phase 3c moves FlashCards onto `IamClient`;
- the full backup, which still covers both schemas (format 3.0, including `token_policies`) until per-service backups (3d);
- the binding rule [CODING_STANDARDS.md § 0.8](./CODING_STANDARDS.md).
