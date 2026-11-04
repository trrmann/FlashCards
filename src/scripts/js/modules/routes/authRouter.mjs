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

  /** Sign in through the gateway (it may keep tokens in the session) and start the session. */
  static async signIn(req, username, password) {
    const user = await BaseRouter.identity(req).login(req, username, password);
    req.session.userId = user.user_id;
    req.session.username = user.username;
    await AuthRouter.saveSession(req);
    return user;
  }

  registerRoutes() {
    const router = this.router;

    /**
     * POST /api/auth/register
     * Register a new user and sign them in. The install's first user becomes admin.
     */
    router.post('/register', express.json(), async (req, res) => {
      try {
        const { username, email, password, passwordConfirm, fullName } = req.body;

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
        });
        await AuthRouter.signIn(req, username, password);

        return res.status(201).json({
          status: 'success',
          message: 'User registered successfully' + (isFirstUser ? ' as system admin' : ''),
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
