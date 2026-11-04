/**
 * Backup round-trip test with identity over HTTP (npm run test:roundtrip:remote): the same
 * checks as test:roundtrip, with the identity part going through the IAM service.
 */

import { BackupRoundTripTest } from './backupRoundTripTest.mjs';

process.exitCode = (await new BackupRoundTripTest({ remoteIam: true }).execute()) ? 0 : 1;
