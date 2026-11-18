# AI instructions (FlashCards)

These instructions apply to every AI tool. `.claude/CLAUDE.md` and `.github/copilot-instructions.md` point here or
repeat it; keep them consistent.

## Binding rules for every AI tool (Claude, Copilot, Gemini and others)

1. **Global standard first.** Follow the global standard ([GitHub](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md); local copy `/usr/local/share/ai-skills/standards/PLATFORM_PROJECT_STANDARDS.md`).
   It is authoritative. This project's `documents/CODING_STANDARDS.md` adds project-specific detail and its
   known violations; it never weakens the global rules.
2. **Object-oriented design and domain objects** (global Coding rules): all JavaScript is classes and methods (no
   module-level functions, named helper closures or module-level mutable state; constants are `static` fields;
   dependencies by constructor). Every entity is fully encapsulated (`#private` fields, getters, no public setters,
   intention-revealing methods, immutable value objects), and **all business rules live in the domain objects**.
   Models persist the objects; services orchestrate; controllers, routers and views use the objects and never
   re-implement rules. JSDoc on every class and public method.
3. **Inter-project rules:** use other projects' running services first; library code only from their GitHub
   packages, never local copies; a library is a fallback only where `documents/ARCHITECTURE_DECISIONS.md`
   authorizes it. Global service-ownership rules: data through master data, authorization through IAM,
   service-to-service calls through the request/message queue, and the other owners listed in the standard.
4. **SQL, styles, layout:** no SQL in JavaScript (one statement per `.sql` file per table), no inline styles,
   documentation only in `documents/` (root `README.md` excepted), tests that write use a local scratch database.
5. Do not commit, push, release or deploy unless the owner asks. Never print or commit secrets.

## Project instructions

Follow documents/CODING_STANDARDS.md for every change in this repository (it is binding).
Shared rules: https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md
The shared standard is authoritative for coding, layout, environment, and port allocation.
Current priorities and the production-verification gate are in documents/Issues.md → "high pri".
All documentation goes in documents/; the root README.md is the only doc file allowed at the root.
