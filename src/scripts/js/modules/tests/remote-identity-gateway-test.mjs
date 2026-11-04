/**
 * RemoteIdentityGateway test entry point (npm run test:identity).
 * All behavior lives in the class-based RemoteIdentityGatewayTest module.
 */

import { remoteIdentityGatewayTest } from './remoteIdentityGatewayTest.mjs';

process.exitCode = (await remoteIdentityGatewayTest.execute()) ? 0 : 1;
