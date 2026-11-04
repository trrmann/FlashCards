/**
 * IAM service test entry point (npm run test:iam-service).
 * All behavior lives in the class-based IamServiceTest module.
 */

import { iamServiceTest } from './iamServiceTest.mjs';

process.exitCode = (await iamServiceTest.execute()) ? 0 : 1;
