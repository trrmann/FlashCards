/**
 * Own-login end-to-end test entry point (npm run test:own-login).
 * All behavior lives in the class-based OwnLoginTest module.
 */

import { ownLoginTest } from './ownLoginTest.mjs';

process.exitCode = (await ownLoginTest.execute()) ? 0 : 1;
