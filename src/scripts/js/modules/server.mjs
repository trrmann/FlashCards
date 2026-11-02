/**
 * FlashCards HTTP Server
 * Class-based server implementation: configures the express application,
 * PostgreSQL-backed sessions, view engine, page routes, and API routers,
 * and manages startup (database connection + idempotent schema bootstrap).
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import pgSession from 'connect-pg-simple';

import { appSiteData } from './appSiteData.mjs';
import { flashCardsDb } from './db/flashCardsDatabase.mjs';
import { userAuthService } from './auth/userAuthService.mjs';
import authRouter from './routes/authRouter.mjs';
import usersRouter from './routes/usersRouter.mjs';
import adminRouter from './routes/adminRouter.mjs';
import systemRouter from './routes/systemRouter.mjs';
import navigationRouter from './routes/navigationRouter.mjs';
import entriesRouter from './routes/entriesRouter.mjs';
import practiceRouter from './routes/practiceRouter.mjs';
import quizRouter from './routes/quizRouter.mjs';

export class Server {
  static filePath = fileURLToPath(import.meta.url);
  static directory = path.dirname(this.filePath);
  static projectRoot = path.resolve(this.directory, '../../../..');
  static DEFAULT_PORT = 3000;
  static SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours

  /**
   * Resolve the listening port for an environment.
   * For production (Render), supports both PORT_PROD and the legacy PORT variable.
   */
  static resolvePort(env) {
    const portMap = {
      development: process.env.PORT_DEV || 5000,
      preview: process.env.PORT_PREVIEW || 4000,
      production: process.env.PORT_PROD || process.env.PORT || this.DEFAULT_PORT,
    };
    return portMap[env] || this.DEFAULT_PORT;
  }

  constructor({ env, port, database = flashCardsDb } = {}) {
    this.env = env ?? (process.env.NODE_ENV?.toLocaleLowerCase() || 'production');
    this.port = port ?? this.constructor.resolvePort(this.env);
    this.database = database;
    this.siteData = new appSiteData();
    this.app = express();

    this.logStartupInfo();
    this.configureMiddleware();
    this.registerPageRoutes();
    this.registerApiRoutes();
  }

  get isProduction() {
    return this.env === 'production';
  }

  logStartupInfo() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`🚀 FlashCards Server Starting`);
    console.log(`   NODE_ENV: ${this.env}`);
    console.log(`   PORT: ${this.port}`);
    console.log(
      `   Cookie Security: ${this.isProduction ? 'SECURE (HTTPS only)' : 'INSECURE (HTTP)'}`
    );
    console.log(`   Session Store: PostgreSQL (connect-pg-simple)`);
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Session configuration with PostgreSQL store for persistence across restarts.
   * In production, secure cookies are used behind the HTTPS proxy; dev allows HTTP.
   */
  buildSessionConfig() {
    const PgSession = pgSession(session);

    return {
      store: new PgSession({
        pool: this.database.pool,
        tableName: 'session',
        errorLog: (error) => {
          console.error('❌ Session store error:', error.message);
        },
      }),
      secret: process.env.SESSION_SECRET || 'flashcards-dev-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: this.isProduction,
        sameSite: 'lax',
        maxAge: this.constructor.SESSION_MAX_AGE_MS,
      },
    };
  }

  configureMiddleware() {
    // Trust the reverse proxy (Render/Cloudflare) for secure cookie handling.
    // This ensures X-Forwarded-Proto: https is properly recognized.
    this.app.set('trust proxy', 1);

    const sessionConfig = this.buildSessionConfig();
    console.log(
      `✅ Session Config: secure=${sessionConfig.cookie.secure}, sameSite=${sessionConfig.cookie.sameSite}`
    );
    this.app.use(session(sessionConfig));

    // Parse JSON request bodies for API endpoints
    this.app.use(express.json());

    this.app.use(express.static(path.join(this.constructor.projectRoot, 'public')));

    // EJS templating
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(this.constructor.projectRoot, 'src/views'));

    // Populate user info on every page
    this.app.use(this.userContextMiddleware.bind(this));
  }

  /**
   * Middleware: populate res.locals and site data with the session user's info.
   */
  async userContextMiddleware(req, res, next) {
    if (req.session.userId) {
      res.locals.userId = req.session.userId;
      res.locals.isLoggedIn = true;

      try {
        const user = await userAuthService.getUserDisplayInfo(req.session.userId);
        if (user) {
          res.locals.fullName = user.full_name;
          res.locals.isAdmin = user.is_admin;
          this.siteData.setName(user.full_name);
        } else {
          res.locals.fullName = '';
          res.locals.isAdmin = false;
          this.siteData.setName('');
        }
      } catch (error) {
        console.error('Error fetching user info:', error.message);
        res.locals.fullName = '';
        res.locals.isAdmin = false;
      }
    } else {
      res.locals.userId = null;
      res.locals.fullName = '';
      res.locals.isLoggedIn = false;
      res.locals.isAdmin = false;
      this.siteData.setName('');
    }
    next();
  }

  registerPageRoutes() {
    const app = this.app;
    const siteData = this.siteData;

    app.get('/', async (req, res) => {
      siteData.setTitle('Home');
      res.render('home', { siteData });
    });

    app.get('/quiz', async (req, res) => {
      siteData.setTitle('Quiz');
      res.render('quiz', { siteData });
    });

    app.get('/entries', async (req, res) => {
      siteData.setTitle('Entries');
      res.render('entries', { siteData, isLoggedIn: !!req.session.userId });
    });

    app.get('/login', async (req, res) => {
      siteData.setTitle('Login');

      let needsSetup;
      let userCount = 0;

      try {
        // Check if any users exist
        userCount = await userAuthService.countUsers();
        needsSetup = userCount === 0;
      } catch (error) {
        console.error('Error checking user count:', error);
        // If we can't check, assume setup is not needed
        needsSetup = false;
      }

      res.render('login', {
        siteData,
        needsSetup,
        userCount,
      });
    });

    app.get('/profile', async (req, res) => {
      siteData.setTitle('Profile');
      res.render('profile', {
        siteData,
        isAdmin: res.locals.isAdmin || false,
        currentUserId: req.session.userId,
      });
    });

    app.get('/logout', async (req, res) => {
      siteData.setTitle('Logout');
      res.render('logout', { siteData });
    });
  }

  registerApiRoutes() {
    const app = this.app;

    // System routes (setup status, database status)
    app.use('/api/system', systemRouter);

    // Authentication routes
    app.use('/api/auth', authRouter);

    // User routes
    app.use('/api/users', usersRouter);

    // Navigation routes (page tracking, history)
    app.use('/api/navigation', navigationRouter);

    // Entries/Flashcards routes (CRUD and sharing)
    app.use('/api/entries', entriesRouter);

    // Practice Study routes (Leitner system)
    app.use('/practice', practiceRouter);
    app.use('/api/practice', practiceRouter);

    // Quiz routes
    app.use('/api/quiz', quizRouter);

    // Admin routes
    app.use('/api/admin', adminRouter);

    // Health check endpoint
    app.get('/api/health', async (req, res) => {
      const health = await this.database.healthCheck();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });
  }

  /**
   * Connect to the database and bootstrap the idempotent schema.
   */
  async initializeDatabase() {
    const dbReady = await this.database.initializeDatabaseConnection();
    if (!dbReady) {
      console.warn('⚠️ Warning: Database connection failed. Some features may be unavailable.');
      return false;
    }

    try {
      await this.database.initializeSchema();
    } catch (error) {
      console.error('❌ Schema initialization failed:', error.message);
    }
    return true;
  }

  /**
   * Start listening and initialize the database.
   * @returns {Promise<import('http').Server>} The underlying HTTP server.
   */
  start() {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, async () => {
        console.log(`Server running in ${this.env} mode on port ${this.port}`);
        await this.initializeDatabase();
        resolve(this.httpServer);
      });
    });
  }

  /**
   * Stop the HTTP server and close the database pool.
   */
  async stop() {
    if (this.httpServer) {
      await new Promise((resolve, reject) => {
        this.httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = null;
    }
    await this.database.close();
  }
}

export const server = new Server();

export default server;
