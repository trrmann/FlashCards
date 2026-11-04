/**
 * Identity gateways (IAM phase 3c) and the factory that picks one for the environment.
 */

import { IdentityGateway, IdentityError } from './identityGateway.mjs';
import { LocalIdentityGateway } from './localIdentityGateway.mjs';
import { RemoteIdentityGateway } from './remoteIdentityGateway.mjs';

/**
 * Remote (the IAM service over HTTP) when IAM_URL is set, else local (in-process).
 * @param {object} [env=process.env]
 */
export function createIdentityGateway(env = process.env) {
  if (!env.IAM_URL) return new LocalIdentityGateway();
  if (!env.IAM_CLIENT_SECRET) throw new Error('IAM_URL is set but IAM_CLIENT_SECRET is not');
  return new RemoteIdentityGateway({
    baseUrl: env.IAM_URL,
    appKey: env.IAM_CLIENT_ID || IdentityGateway.APP_KEY,
    clientSecret: env.IAM_CLIENT_SECRET,
  });
}

export { IdentityGateway, IdentityError, LocalIdentityGateway, RemoteIdentityGateway };
