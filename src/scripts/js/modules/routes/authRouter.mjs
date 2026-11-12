/**
 * Authentication Routes
 * Registration, sign-in, sign-out and the current user, through the identity gateway
 * (in-process IAM or the IAM service). The gateway validates; these routes add the
 * FlashCards parts: the password confirmation, the session, and the post-login page.
 */

import express from 'express';
import { BaseRouter } from './baseRouter.mjs';
import { userSettingsService } from '../auth/userSettingsService.mjs';
import { IdentityGateway } from '../identity/identityGateway.mjs';

class AuthRouter extends BaseRouter {
  /** Save the session, as a promise. */
  static saveSession(req) {
    return new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Sign in through the gateway (it may keep tokens in the session) and start the session. When the IAM asks
   * for MFA the session is not started yet: the answer is `{ mfa: 'verify' | 'enroll' }` and the browser goes on
   * to /mfa, where the second step (the gateway's mfaSignInRouter → startSession) finishes it.
   */
  static async signIn(req, username, password) {
    const answer = await BaseRouter.identity(req).login(req, username, password);
    if (answer.mfa_required || answer.mfa_enrollment_required) {
      await AuthRouter.saveSession(req);
      return { mfa: answer.mfa_required ? 'verify' : 'enroll' };
    }
    await AuthRouter.startSession(req, answer);
    return answer;
  }

  /** Start FlashCards' session for a signed-in user (password sign-in, or the end of MFA). */
  static async startSession(req, user) {
    req.session.userId = user.user_id;
    req.session.username = user.username;
    await AuthRouter.saveSession(req);
  }

  /** Where the browser goes for the MFA step. */
  static mfaPage(step) {
    return `/mfa?mode=${step === 'enroll' ? 'enroll' : 'verify'}`;
  }

  registerRoutes() {
    const router = this.router;

    /**
     * POST /api/auth/register
     * Register a new user and sign them in. The install's first user becomes admin.
     */
    router.post('/register', express.json(), async (req, res) => {
      try {
        const { username, email, password, passwordConfirm, fullName, invitation } = req.body;

        if (!username || !email || !password || !passwordConfirm) {
          return res.status(400).json({
            status: 'error',
            message: 'Missing required fields: username, email, password, passwordConfirm',
          });
        }
        if (password !== passwordConfirm) {
          return res.status(400).json({ status: 'error', message: 'Passwords do not match' });
        }

        const { user, is_admin: isFirstUser } = await BaseRouter.identity(req).register({
          username,
          email,
          password,
          full_name: fullName || null,
          // An invitation code (iam-service phase 3e): its roles, and joining when sign-ups are closed.
          ...(invitation ? { invitation: String(invitation).trim() } : {}),
        });
        const signedIn = await AuthRouter.signIn(req, username, password);

        return res.status(201).json({
          status: 'success',
          message: 'User registered successfully' + (isFirstUser ? ' as system admin' : ''),
          // The install's first user is a domain admin: with MFA on, they set it up next.
          ...(signedIn.mfa ? { redirectTo: AuthRouter.mfaPage(signedIn.mfa) } : {}),
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            is_admin: isFirstUser,
            created_at: user.created_at,
          },
        });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Registration failed. Please try again.');
      }
    });

    /**
     * POST /api/auth/login
     * Authenticate a user and create a session
     */
    router.post('/login', express.json(), async (req, res) => {
      try {
        const { username, password } = req.body;
        if (!username || !password) {
          return res.status(400).json({
            status: 'error',
            message: 'Missing required fields: username, password',
          });
        }

        const user = await AuthRouter.signIn(req, username, password);
        if (user.mfa) {
          return res.status(200).json({
            status: 'success',
            message: 'Enter your two-factor code',
            redirectTo: AuthRouter.mfaPage(user.mfa),
          });
        }
        const lastPage = await userSettingsService.getLastPageVisited(user.user_id);

        return res.status(200).json({
          status: 'success',
          message: 'Login successful',
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
          },
          redirectTo: lastPage,
        });
      } catch (error) {
        return IdentityGateway.respond(res, error, 'Login failed. Please try again.');
      }
    });

    /**
     * POST /api/auth/logout
     * End the IAM session (remote mode) and destroy the FlashCards session
     */
    router.post('/logout', async (req, res) => {
      await BaseRouter.identity(req)
        .logout(req)
        .catch((error) => console.error('IAM logout error:', error.message));
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout error:', err.message);
          return res.status(500).json({ status: 'error', message: 'Logout failed' });
        }
        return res.status(200).json({ status: 'success', message: 'Logged out successfully' });
      });
    });

    /**
     * GET /api/auth/current
     * Get current logged-in user
     */
    router.get('/current', async (req, res) => {
      try {
        if (!req.session.userId) {
          return res.status(401).json({ status: 'error', message: 'Not authenticated' });
        }
        const user = await BaseRouter.identity(req).currentUser(req);
        return res.status(200).json({ status: 'success', user });
      } catch (error) {
        if (IdentityGateway.errorAnswer(error)?.status === 401) req.session.destroy(() => {});
        return IdentityGateway.respond(res, error, 'Failed to get current user');
      }
    });
  }
}

export const authRouter = new AuthRouter();

export { AuthRouter };
export default authRouter.router;
