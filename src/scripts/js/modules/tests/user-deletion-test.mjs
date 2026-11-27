/**
 * User deletion test entry point (npm run test:deletion), identity over HTTP.
 */

import { userDeletionTest } from './userDeletionTest.mjs';

process.exitCode = (await userDeletionTest.execute()) ? 0 : 1;
