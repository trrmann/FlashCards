# Port configuration

The shared target allocation and staged rollout sequence are maintained in the
[canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md#coordinated-ports).

FlashCards uses `PORT_DEV=2010` and `PORT_PREVIEW=5010` for local runs. Hosted
production must bind to Render's provider-supplied `PORT`; do not set a fixed
`PORT_PROD` that overrides it. Test runners may use isolated ports documented
with their test configuration.

The server port selector is in `src/scripts/js/modules/server.mjs`; deploy
selection and browser opening are in `src/scripts/sh/deploy.sh`.
