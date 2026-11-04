/**
 * Backup round-trip test entry point (npm run test:roundtrip).
 * All behavior lives in the class-based BackupRoundTripTest module.
 */

import { backupRoundTripTest } from './backupRoundTripTest.mjs';

process.exitCode = (await backupRoundTripTest.execute()) ? 0 : 1;
