/**
 * Admin page test entry point (npm run test:admin-page).
 * All behavior lives in the class-based AdminPageTest module.
 */

import { adminPageTest } from './adminPageTest.mjs';

process.exitCode = (await adminPageTest.execute()) ? 0 : 1;
