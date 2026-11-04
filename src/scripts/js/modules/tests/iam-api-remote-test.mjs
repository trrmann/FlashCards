/**
 * IAM API test with identity over HTTP (npm run test:iam:remote): the same checks as
 * test:iam, with FlashCards using the IAM service through a RemoteIdentityGateway.
 */

import { IamApiTest } from './iamApiTest.mjs';

process.exitCode = (await new IamApiTest({ remoteIam: true }).execute()) ? 0 : 1;
