/**
 * Backup command-line entry point (used by src/scripts/sh/backup.sh and restore.sh).
 * All behavior lives in the class-based BackupCli module.
 */

import { backupCli } from './backupClient.mjs';

process.exitCode = await backupCli.run(process.argv.slice(2));
