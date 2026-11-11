/**
 * FlashCards HTTP Server
 * Class-based server implementation: configures the express application,
 * PostgreSQL-backed sessions, view engine, page routes, and API routers,
 * and manages startup (database connection + idempotent schema bootstrap).
 *
 * Start-up: the server listens at once, then waits for the database (platform-db
 * waitForConnection, with backoff) and bootstraps the schemas, retrying instead of giving up.
 * Until then every request gets 503 with Retry-After, and /api/health reports "starting",
 * so Render keeps serving the previous deploy until this one is healthy.
 *
 * Database targets: development and preview must use a local database, or a remote one
 * opened read-only (DB_PG_READ_ONLY=true). Starting them against a writable remote database
 * is refused, because dev and preview share the code's schema migrations with production
 * (2026-11-04: a dev run migrated production; platform-db DatabaseTargetGuard).
 * DB_PG_ALLOW_REMOTE_WRITES=true overrides this
 * for a deliberate owner action. A read-only server never bootstraps the schema; it only
 * checks that the schema is there.
 *
 * Identity (IAM phase 3c): every sign-in, account, directory, user-admin and organization call
 * goes through an identity gateway (app.locals.identity): in-process by default, or the IAM
 * service over HTTP when IAM_URL is set (createIdentityGateway).
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import pgSession from 'connect-pg-simple';

import { appSiteData } from './appSiteData.mjs';
import { flashCardsDb } from './db/flashCardsDatabase.mjs';
import { identityManagementDb, IamTables } from 'iam-service/db';
import { PostgresDatabase, DatabaseTargetGuard } from 'platform-db';
import { createIdentityGateway } from './identity/index.mjs';
import { entriesService } from './auth/entriesService.mjs';
import { backupService } from './auth/backupService.mjs';
import { UserEventConsumer } from './auth/userEventConsumer.mjs';
import authRouter, { AuthRouter } from './routes/authRouter.mjs';
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
  /** Pause between start-up rounds after the database wait gives up or a bootstrap fails. */
  static STARTUP_RETRY_MS = 5000;
  static RETRY_AFTER_SECONDS = 5;
  /** The IAM's shared screens (phase 3f), served from the installed iam-service package. */
  static iamUiDirectory = path.dirname(
    fileURLToPath(import.meta.resolve('iam-service/ui/iam-ui.js'))
  );
  /** Tables a read-only server needs to find, since it cannot create them. */
  static REQUIRED_TABLES = ['flashcards.flashcards'];
  /** …and, when the IAM runs in-process, its table too. */
  static REQUIRED_IAM_TABLES = ['iam.users'];

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

  constructor({
    env,
    port,
    database = flashCardsDb,
    identityDatabase = identityManagementDb,
    connectOptions = {},
    startupRetryMs = Server.STARTUP_RETRY_MS,
    identity = createIdentityGateway(process.env),
  } = {}) {
    this.env = env ?? (process.env.NODE_ENV?.toLocaleLowerCase() || 'production');
    this.port = port ?? this.constructor.resolvePort(this.env);
    this.database = database;
    this.identityDatabase = identityDatabase;
    // Before anything can touch the database (the session store is created below).
    DatabaseTargetGuard.assert(this.env, identityDatabase.config);
    DatabaseTargetGuard.assert(this.env, database.config);
    this.connectOptions = connectOptions;
    this.startupRetryMs = startupRetryMs;
    this.ready = false;
    this.stopping = false;
    this.siteData = new appSiteData();
    this.identity = identity;
    // Card lists show owners' names, looked up through the same gateway.
    entriesService.identityService = identity;
    // Backups take the identity part through the same gateway (phase 3d).
    backupService.identity = identity;
    // The IAM's notices (a deleted user's data is removed; phase 3d).
    this.userEvents = new UserEventConsumer({ identity });
    this.app = express();
    this.app.locals.identity = identity;
    this.app.locals.userEvents = this.userEvents;

    this.logStartupInfo();
    this.configureMiddleware();
    this.registerPageRoutes();
    this.registerApiRoutes();
  }

  /** The deployed commit, short form (Render's RENDER_GIT_COMMIT), or null when not on Render. */
  static deployedVersion(env = process.env) {
    return env.RENDER_GIT_COMMIT ? String(env.RENDER_GIT_COMMIT).slice(0, 7) : null;
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
    console.log(`   Identity: ${this.identity.mode}`);
    const { host, database, readOnly, user } = this.database.config;
    console.log(`   Database: ${host}/${database} as ${user}${readOnly ? ' (READ-ONLY)' : ''}`);
    console.log('═══════════════════════════════════════════════════════════');
  }

  /**
   * Session configuration with PostgreSQL store for persistence across restarts.
   * In production, secure cookies are used behind the HTTPS proxy; dev allows HTTP.
   */
  buildSessionConfig() {
    const PgSession = pgSession(session);

    return {
      // FlashCards' own session table (flashcards.session; it was iam.session before phase 3c).
      store: new PgSession({
        pool: this.database.pool,
        schemaName: 'flashcards',
        tableName: 'session',
        // Pruning deletes expired sessions; a read-only database refuses that.
        pruneSessionInterval: this.database.config.readOnly ? false : undefined,
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

    // Before anything that needs the database (sessions live there).
    this.app.use(this.readinessMiddleware.bind(this));

    const sessionConfig = this.buildSessionConfig();
    console.log(
      `✅ Session Config: secure=${sessionConfig.cookie.secure}, sameSite=${sessionConfig.cookie.sameSite}`
    );
    this.app.use(session(sessionConfig));
    this.app.use(this.identity.sessionMiddleware());

    // Parse JSON request bodies for API endpoints. The limit accommodates
    // base64 media payloads (card images/audio) and backup imports.
    this.app.use(express.json({ limit: '50mb' }));

    this.app.use(express.static(path.join(this.constructor.projectRoot, 'public')));
    this.app.use('/iam-ui', express.static(this.constructor.iamUiDirectory));

    // EJS templating
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(this.constructor.projectRoot, 'src/views'));

    // Populate user info on every page
    this.app.use(this.userContextMiddleware.bind(this));
  }

  /**
   * Middleware: until start-up has finished, answer 503 with Retry-After (JSON for /api,
   * plain text for pages) instead of failing on a database that isn't ready.
   */
  readinessMiddleware(req, res, next) {
    if (this.ready) {
      next();
      return;
    }
    res.set('Retry-After', String(this.constructor.RETRY_AFTER_SECONDS));
    res.status(503);
    if (req.path.startsWith('/api/')) {
      res.json({ status: 'starting', message: 'FlashCards is starting' });
    } else {
      res.type('text').send('FlashCards is starting. Please try again in a few seconds.');
    }
  }

  /**
   * Middleware: populate res.locals and site data with the session user's info.
   */
  async userContextMiddleware(req, res, next) {
    // Expose shared site data to all views (page routers rely on this).
    res.locals.siteData = this.siteData;

    if (req.session.userId) {
      res.locals.userId = req.session.userId;
      res.locals.isLoggedIn = true;

      try {
        const user = await this.identity.displayInfo(req);
        if (user) {
          res.locals.fullName = user.full_name || '';
          res.locals.isAdmin = user.is_admin;
          this.siteData.setName(user.full_name || '');
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
        userCount = await this.identity.countUsers();
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
      // The domain MFA switch is for domain admins, and only the IAM service has MFA.
      const mfaSwitch =
        !this.identity.runsInProcess &&
        Boolean(req.session.userId) &&
        (await this.identity.isPlatformAdmin(req).catch(() => false));
      res.render('profile', {
        siteData,
        isAdmin: res.locals.isAdmin || false,
        currentUserId: req.session.userId,
        mfaSwitch,
      });
    });

    // MFA at sign-in: a code (mode=verify), or setting it up when it is required (mode=enroll).
    app.get('/mfa', async (req, res) => {
      siteData.setTitle('Two-factor authentication');
      res.render('mfa', { siteData, mode: req.query.mode === 'enroll' ? 'enroll' : 'verify' });
    });

    app.get('/organizations', async (req, res) => {
      siteData.setTitle('Organizations');
      res.render('organizations', { siteData });
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
    // The second step of a sign-in when the IAM asks for MFA (<iam-mfa-sign-in> on /mfa).
    app.use(
      '/api/auth/mfa',
      this.identity.mfaSignInRouter({
        onSignedIn: (req, user) => AuthRouter.startSession(req, user),
      })
    );
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

    // IAM: organizations, groups, group roles, platform admins, app access
    // A user deleted from the shared user-admin screen: handle the IAM's notice now (their
    // FlashCards data goes), not at the next 10-minute pull.
    app.delete('/api/iam/admin/users/:userId', (req, res, next) => {
      res.on('finish', () => {
        if (res.statusCode === 200) {
          this.userEvents
            .pull()
            .catch((error) => console.error('User data clean-up deferred:', error.message));
        }
      });
      next();
    });
    app.use('/api/iam', this.identity.organizationRouter());

    // Health check endpoint
    // `version`: the deployed commit (Render sets RENDER_GIT_COMMIT), so release.sh can tell when
    // a new version is live.
    app.get('/api/health', async (req, res) => {
      const health = await this.database.healthCheck();
      res
        .status(health.status === 'healthy' ? 200 : 503)
        .json({ ...health, version: Server.deployedVersion() });
    });
  }

  /**
   * Connect to the database and bootstrap the idempotent schemas. With the IAM in-process its
   * schema is bootstrapped first; with the IAM service (phase 3d) FlashCards neither touches nor
   * needs the iam schema, so it can run on its own login (flashcards_svc), which has no rights
   * there.
   */
  async initializeDatabase() {
    const inProcessIam = this.identity.runsInProcess;
    if (inProcessIam) await this.identityDatabase.waitForConnection(this.connectOptions);
    await this.database.waitForConnection(this.connectOptions);
    if (this.database.config.readOnly) {
      await this.verifySchemaPresent(inProcessIam);
      return;
    }
    if (inProcessIam) await IamTables.for(this.identityDatabase).provision();
    await this.database.initializeSchema();
  }

  /**
   * Read-only start: the schema can't be bootstrapped, so check that it is already there.
   */
  async verifySchemaPresent(inProcessIam) {
    const checks = [
      ...this.constructor.REQUIRED_TABLES.map((table) => [this.database, table]),
      ...(inProcessIam
        ? this.constructor.REQUIRED_IAM_TABLES.map((table) => [this.identityDatabase, table])
        : []),
    ];
    for (const [db, table] of checks) {
      if (!(await db.tableExists(table))) {
        throw new Error(`Read-only database is missing ${table}; it cannot be created read-only`);
      }
    }
    console.log('🔒 Read-only database: schema present, bootstrap skipped');
  }

  /**
   * Repeat initializeDatabase() until it succeeds (or the server is stopped), then mark the
   * server ready. A database that is down, asleep or restarting never ends the process.
   */
  async prepare() {
    for (let round = 1; !this.stopping; round += 1) {
      try {
        await this.initializeDatabase();
        this.ready = true;
        console.log('✅ FlashCards ready');
        // A read-only server writes nothing, so it leaves the IAM's notices for production.
        if (!this.database.config.readOnly) this.userEvents.start();
        return;
      } catch (error) {
        console.error(
          `❌ FlashCards not ready (round ${round}): ${error.message}. Retrying in ${this.startupRetryMs} ms`
        );
        await PostgresDatabase.sleep(this.startupRetryMs);
      }
    }
  }

  /**
   * Listen at once, then prepare the database. Resolves once ready; until then requests
   * get 503 "starting".
   * @returns {Promise<import('http').Server>} The underlying HTTP server.
   */
  async start() {
    this.stopping = false;
    await this.identity.start();
    await new Promise((resolve) => {
      this.httpServer = this.app.listen(this.port, resolve);
    });
    console.log(`Server running in ${this.env} mode on port ${this.port} (starting)`);
    await this.prepare();
    return this.httpServer;
  }

  /**
   * Stop the HTTP server and close the database pools.
   */
  async stop() {
    this.stopping = true;
    this.ready = false;
    if (this.httpServer) {
      await new Promise((resolve, reject) => {
        this.httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      this.httpServer = null;
    }
    await this.userEvents.stop();
    await this.identity.stop();
    await this.database.close();
    await this.identityDatabase.close();
  }
}

export const server = new Server();

export default server;
