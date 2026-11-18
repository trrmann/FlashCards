Follow the repository root `AGENTS.md` and `documents/CODING_STANDARDS.md`; both are binding. The global
standard (https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md, local copy `/usr/local/share/ai-skills/standards/PLATFORM_PROJECT_STANDARDS.md`) is authoritative: all JavaScript is classes and methods, every entity is
fully encapsulated with all business rules inside the domain objects, other projects are used through their
services (GitHub libraries only as authorized fallbacks, never local copies), no SQL in JavaScript, no inline
styles, and documentation only in `documents/`.
