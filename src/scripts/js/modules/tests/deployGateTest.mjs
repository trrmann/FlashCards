import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The required-key check itself is tested in server-service-management; this tests the deploy gate that uses it.
test('production deploy refuses to push when required Render keys are missing', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'flashcards-deploy-test-'));
  const binDir = path.join(tempDir, 'bin');
  const commandLog = path.join(tempDir, 'commands.log');
  const pushLog = path.join(tempDir, 'push.log');
  const npmPath = path.join(binDir, 'npm');
  const gitPath = path.join(binDir, 'git');

  try {
    const npmScript = `#!/bin/bash
printf '%s\\n' "$*" >> "$DEPLOY_TEST_COMMAND_LOG"
if [ "$1" = run ] && [ "$2" = render:env ]; then
  exit 1
fi
`;
    const gitScript = `#!/bin/bash
if [ "$1" = push ]; then
  printf '%s\\n' "$*" >> "$DEPLOY_TEST_PUSH_LOG"
fi
`;

    mkdirSync(binDir);
    writeFileSync(npmPath, npmScript);
    writeFileSync(gitPath, gitScript);
    chmodSync(npmPath, 0o755);
    chmodSync(gitPath, 0o755);
    writeFileSync(pushLog, '');

    const result = spawnSync(
      'bash',
      [path.join(projectRoot, 'src/scripts/sh/deploy.sh'), '-prod'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          DEPLOY_TEST_COMMAND_LOG: commandLog,
          DEPLOY_TEST_PUSH_LOG: pushLog,
        },
      }
    );

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(readFileSync(commandLog, 'utf8'), /run render:env -- check/);
    assert.equal(readFileSync(pushLog, 'utf8'), '');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
