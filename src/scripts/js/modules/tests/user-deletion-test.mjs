/**
 * User deletion test entry point (npm run test:deletion).
 * All behavior lives in the class-based UserDeletionTest module.
 */

import { UserDeletionTest } from './userDeletionTest.mjs';

process.exitCode = (await new UserDeletionTest({ remoteIam: false }).execute()) ? 0 : 1;
