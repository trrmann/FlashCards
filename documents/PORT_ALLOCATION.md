# Coordinated port allocation

**Status:** target plan; implementation is pending. Until the coordinated code and configuration update, the current
ports remain in effect.

This plan covers Heros Companion, FlashCards, Wurm Tools web, the Wurm Tools helper, iam-service, platform-db, and
request-queue. The old `WurmTools` repository and CSE340 are outside this service plan.

## Convention

- Local development uses the `20xx` band; local preview uses `50xx`.
- `80xx` is reserved for self-hosted production only. Render supplies each web service's `PORT`; do not override it
  with these fixed values.
- The final two digits are the stable service slot. Ports must be unique among processes running on the same host.

| Service | Slot | Development | Preview | Self-hosted production | Current state / notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Heros Companion web | `00` | `2000` | `5000` | `8000` | Current local ports: `5200` / `4200`; Render uses `PORT`. |
| FlashCards web | `10` | `2010` | `5010` | `8010` | Current local ports: `5000` / `4000`; Render uses `PORT`. Do not set `PORT_PROD` on Render while it takes precedence over Render's `PORT`. |
| Wurm Tools web | `20` | `2020` | `5020` | `8020` | Current local ports: `5300` / `4300`; Render uses `PORT`. |
| Wurm Tools helper | — | `5180` | `5180` | `5180` | Local agent only; keep bound to `127.0.0.1`. Its port is independent of which website environment connects to it. |
| IAM web service | `30` | `2030` | `5030` | `8030` | Current local ports: `5100` / `5101`; Render uses `PORT`. Local app-to-IAM URLs should use `2030` after rollout. |
| platform-db / PostgreSQL | `40` reserved | `5433` shared | `5433` shared | `5432` remote DB | platform-db is a library, not a listening app. Dev and preview use the shared local PostgreSQL cluster; production uses the managed database endpoint. |
| request-queue / messaging | `60` reserved | `2060` reserved | `5060` reserved | `8060` reserved | request-queue is a library with no listener today. If a standalone service is added, use this slot. Slot `50` is reserved for tools such as pgAdmin (`5050`). |

## Configuration and rollout

- Web services use their development/preview port settings (`PORT_DEV`, `PORT_PREVIEW`; IAM currently uses `IAM_PORT`).
  Production web processes bind to the host-provided `PORT`.
- The Wurm helper uses `WURM_HELPER_PORT`; retain `5180` as its default and keep its loopback-only binding.
- PostgreSQL uses `LOCAL_PG_PORT` for the shared local cluster and `DB_PG_PORT` for database connections. Do not
  assign a separate database port per app while they share that cluster.
- Apply each project's ports together with its deploy scripts, tests, inter-service URLs, and documentation. Verify
  each phase before starting the next.
- These are planned assignments, not evidence that the new ports are already configured.

## Required rollout sequence and development gate

Before Phase 1, finish any active in-flight work that cannot safely be paused. Then perform these phases in order:

1. **platform-db:** verify the shared local PostgreSQL and provider-supplied production port contract.
2. **request-queue:** after platform-db, verify queue storage and the portless library contract.
3. **iam-service:** after both libraries, adopt IAM's ports and prove IAM, PostgreSQL, and request-queue interoperate.
4. **FlashCards:** after the foundation passes, adopt its ports and verify its integration with the foundation.
5. **Heros Companion:** after FlashCards passes, adopt its ports and verify its integration with the foundation.
6. **Wurm Tools web:** after Heros passes, adopt its ports and verify its integration with the foundation.
7. **Wurm Tools helper:** after Wurm Tools web passes, verify the helper's `5180` loopback connection and pairing.

Once Phase 1 begins, all unrelated development across the seven projects is blocked. Only work in this sequence or
changes required to clear its blockers may proceed. The gate ends after Phase 7 and final cross-project health and
interoperability checks pass.
