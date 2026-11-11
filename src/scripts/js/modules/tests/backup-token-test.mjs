/**
 * Backup token test entry point (npm run test:backup-token).
 * All behavior lives in the class-based BackupTokenTest module.
 */

import { BackupTokenTest } from './backupTokenTest.mjs';

process.exitCode = (await new BackupTokenTest({ remoteIam: false }).execute()) ? 0 : 1;
