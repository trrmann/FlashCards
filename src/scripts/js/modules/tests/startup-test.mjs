/**
 * Start-up test entry point (npm run test:startup).
 * All behavior lives in the class-based StartupTest module.
 */

import { startupTest } from './startupTest.mjs';

process.exitCode = (await startupTest.execute()) ? 0 : 1;
