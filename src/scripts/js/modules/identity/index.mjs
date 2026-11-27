/**
 * Identity gateways (IAM phase 3c) and the factory that picks one for the environment.
 */

import { IdentityGateway, IdentityError } from './identityGateway.mjs';
import { RemoteIdentityGateway } from './remoteIdentityGateway.mjs';

/**
 * The gateway to the IAM service over HTTP at IAM_URL (there is no in-process IAM; iam-service MIGRATION.md L3).
 * @param {object} [env=process.env]
 */
export function createIdentityGateway(env = process.env) {
  if (!env.IAM_URL) {
    throw new Error('IAM_URL is not set; FlashCards signs users in through the IAM service');
  }
  if (!env.IAM_CLIENT_SECRET) {
    throw new Error('IAM_URL is set but IAM_CLIENT_SECRET is not');
  }
  return new RemoteIdentityGateway({
    baseUrl: env.IAM_URL,
    appKey: env.IAM_CLIENT_ID || IdentityGateway.APP_KEY,
    clientSecret: env.IAM_CLIENT_SECRET,
  });
}

export { IdentityGateway, IdentityError, RemoteIdentityGateway };
