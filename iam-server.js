/**
 * IAM service entry point (IAM phase 3).
 * All service behavior lives in the class-based IamServer module.
 */

import { iamServer } from './src/scripts/js/modules/iam/iamServer.mjs';

await iamServer.start();
