# Coordinated port allocation

The cross-project target table and staged rollout gate are maintained in the
[canonical platform and Wurm standards](https://github.com/trrmann/ai-skills/blob/main/standards/PLATFORM_PROJECT_STANDARDS.md#coordinated-ports).

Do not copy the shared port table into this repository. FlashCards' local
development and preview ports are configured through `PORT_DEV` and
`PORT_PREVIEW`; hosted production must use Render's provider-supplied `PORT`.
