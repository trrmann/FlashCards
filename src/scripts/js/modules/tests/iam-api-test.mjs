/**
 * IAM API test entry point (npm run test:iam).
 * All behavior lives in the class-based IamApiTest module.
 */

import { iamApiTest } from './iamApiTest.mjs';

process.exitCode = (await iamApiTest.execute()) ? 0 : 1;
