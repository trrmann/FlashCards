# Running Project Scripts from Anywhere

All project shell scripts live in **`src/scripts/sh/`**. That folder is on the `PATH` of the VS Code
integrated terminal, so every script in it runs from any directory by name:

```bash
cd /anywhere
deploy.sh -dev
deploy.sh -h
```

`deploy` (without `.sh`) also works, through a shell alias (see below).

## How it works

### 1. VS Code terminal `PATH` (part of the repo)

`.vscode/settings.json` (used when the folder is opened) and `FlashCards.code-workspace` (used when
the workspace file is opened) both set:

```json
"terminal.integrated.env.linux": {
  "PATH": "${workspaceFolder}/src/scripts/sh:${env:PATH}"
}
```

(and the same for `osx`). Every terminal VS Code opens for this project gets the folder on its `PATH`.
This needs no per-machine setup, and **any script added to `src/scripts/sh/` is reachable immediately**.

After changing these settings, open a **new** terminal. Existing terminals keep their old environment,
and VS Code may show a "relaunch terminal" prompt. If the workspace isn't trusted, VS Code
ignores `terminal.integrated.env.*`; trust the workspace to enable it.

### 2. `~/.bashrc` (this machine, every terminal)

```bash
# FlashCards deploy script alias
alias deploy='$HOME/Documents/Projects/FlashCards/src/scripts/sh/deploy.sh'

# Add FlashCards shell scripts (src/scripts/sh) to PATH
export PATH="$HOME/Documents/Projects/FlashCards/src/scripts/sh:$PATH"
```

These lines make the scripts available outside VS Code as well, and provide the short `deploy` alias.
They aren't part of the repo; set them up on each machine if you want them. If the project moves,
update both lines. A stale alias takes precedence over `PATH` and breaks the `deploy` command.

## Adding a new script

1. Put it in `src/scripts/sh/` with a `.sh` extension and a `#!/bin/bash` shebang.
2. Make it executable: `chmod +x src/scripts/sh/<name>.sh` (git keeps the executable bit).
3. If it needs the project root, resolve it from the script's own location, not the current directory:

   ```bash
   SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
   PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
   cd "${PROJECT_ROOT}" || exit 1
   ```

4. Run it from anywhere in a new VS Code terminal: `<name>.sh`.

## Troubleshooting

| Symptom                                    | Fix                                                      |
| ------------------------------------------ | -------------------------------------------------------- |
| `deploy.sh: command not found` in VS Code  | Open a new terminal; check that the workspace is trusted |
| `deploy` runs an old path / "No such file" | Update the alias in `~/.bashrc`, then `source ~/.bashrc` |
| `Permission denied`                        | `chmod +x src/scripts/sh/<name>.sh`                      |
| Check what will run                        | `type deploy` · `command -v deploy.sh`                   |
