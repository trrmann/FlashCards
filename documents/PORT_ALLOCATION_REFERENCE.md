# Port allocation reference

The shared target table, current migration status, and rollout gate are
maintained in the
[canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md#coordinated-ports).

FlashCards uses local `PORT_DEV=2010` and `PORT_PREVIEW=5010`. Render supplies
the hosted production `PORT`. The app's server selection is implemented in
`src/scripts/js/modules/server.mjs`; deploy behavior is in
`src/scripts/sh/deploy.sh`.
