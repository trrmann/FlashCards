/**
 * Schema clean-up test entry point (npm run test:cleanup).
 * All behavior lives in the class-based SchemaCleanupTest module.
 */

import { schemaCleanupTest } from './schemaCleanupTest.mjs';

process.exitCode = (await schemaCleanupTest.execute()) ? 0 : 1;
