/**
 * Application credentials for the IAM service.
 * Each client application (FlashCards, later WurmTools) authenticates to the IAM
 * service with its app key and a secret. Secrets live only in the IAM service's
 * environment as IAM_CLIENT_SECRET_<APP_KEY> (e.g. IAM_CLIENT_SECRET_FLASHCARDS)
 * and are compared in constant time; nothing secret is stored in the database.
 */

import crypto from 'node:crypto';

export class ApplicationCredentials {
  static ENV_PREFIX = 'IAM_CLIENT_SECRET_';
  static MIN_SECRET_LENGTH = 32;

  constructor(env = process.env) {
    this.env = env;
  }

  static envName(appKey) {
    return `${ApplicationCredentials.ENV_PREFIX}${String(appKey).toUpperCase().replace(/-/g, '_')}`;
  }

  static digest(value) {
    return crypto.createHash('sha256').update(String(value)).digest();
  }

  /**
   * The configured secret for an application, or null when none (or a too-short one) is set.
   */
  secretFor(appKey) {
    const secret = this.env[this.constructor.envName(appKey)];
    return secret && secret.length >= this.constructor.MIN_SECRET_LENGTH ? secret : null;
  }

  /**
   * True when `secret` matches the configured secret for `appKey`.
   */
  verify(appKey, secret) {
    const expected = appKey ? this.secretFor(appKey) : null;
    if (!expected || !secret) return false;
    return crypto.timingSafeEqual(
      this.constructor.digest(expected),
      this.constructor.digest(secret)
    );
  }
}

export default ApplicationCredentials;
