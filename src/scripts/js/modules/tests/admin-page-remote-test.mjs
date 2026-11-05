/**
 * Admin pages test with identity over HTTP (npm run test:admin-page:remote).
 * All behavior lives in the class-based AdminPageTest module.
 */

import { AdminPageTest } from './adminPageTest.mjs';

process.exitCode = (await new AdminPageTest({ remoteIam: true }).execute()) ? 0 : 1;
