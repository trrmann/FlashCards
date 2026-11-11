/**
 * MFA sign-in test entry point (npm run test:mfa).
 * All behavior lives in the class-based MfaSignInTest module.
 */

import { mfaSignInTest } from './mfaSignInTest.mjs';

process.exitCode = (await mfaSignInTest.execute()) ? 0 : 1;
