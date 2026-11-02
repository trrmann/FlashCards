/**
 * Authentication Validation Service
 * Handles password hashing and input validation as an OOP service.
 */

import bcrypt from 'bcrypt';

class ValidationService {
  static SALT_ROUNDS = 10;

  /**
   * Hash a password with bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    return bcrypt.hash(password, this.constructor.SALT_ROUNDS);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} True if passwords match
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password requirements
   * @param {string} password - Password to validate
   * @returns {object} Validation result { valid: boolean, errors: string[] }
   */
  validatePassword(password) {
    const errors = [];

    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if email is valid
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate username format
   * @param {string} username - Username to validate
   * @returns {object} Validation result { valid: boolean, errors: string[] }
   */
  validateUsername(username) {
    const errors = [];

    if (!username || username.length < 3) {
      errors.push('Username must be at least 3 characters long');
    }

    if (username.length > 50) {
      errors.push('Username must be no more than 50 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, underscores, and hyphens');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export const validationService = new ValidationService();

export { ValidationService };
export default validationService;
