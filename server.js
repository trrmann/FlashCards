import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';
import pgSession from 'connect-pg-simple';

import { appSiteData } from './src/scripts/js/modules/appSiteData.mjs';
import { flashCardsDb } from './src/scripts/js/modules/db/flashCardsDatabase.mjs';
import { userAuthService } from './src/scripts/js/modules/auth/userAuthService.mjs';
import authRouter from './src/scripts/js/modules/routes/authRouter.mjs';
import usersRouter from './src/scripts/js/modules/routes/usersRouter.mjs';
import adminRouter from './src/scripts/js/modules/routes/adminRouter.mjs';
import systemRouter from './src/scripts/js/modules/routes/systemRouter.mjs';
import navigationRouter from './src/scripts/js/modules/routes/navigationRouter.mjs';
import entriesRouter from './src/scripts/js/modules/routes/entriesRouter.mjs';
import practiceRouter from './src/scripts/js/modules/routes/practiceRouter.mjs';
import quizRouter from './src/scripts/js/modules/routes/quizRouter.mjs';

// Define the application environment.
const NODE_ENV = process.env.NODE_ENV?.toLocaleLowerCase() || 'production';
// Define the port based on environment
// For production (Render), support both PORT_PROD and legacy PORT variable
const portMap = {
  development: process.env.PORT_DEV || 5000,
  preview: process.env.PORT_PREVIEW || 4000,
  production: process.env.PORT_PROD || process.env.PORT || 3000,
};
const port = portMap[NODE_ENV] || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log startup info
console.log('═══════════════════════════════════════════════════════════');
console.log(`🚀 FlashCards Server Starting`);
console.log(`   NODE_ENV: ${NODE_ENV}`);
console.log(`   PORT: ${port}`);
console.log(
  `   Cookie Security: ${NODE_ENV === 'production' ? 'SECURE (HTTPS only)' : 'INSECURE (HTTP)'}`
);
console.log(`   Session Store: PostgreSQL (connect-pg-simple)`);
console.log('═══════════════════════════════════════════════════════════');

const siteData = new appSiteData();
const app = express();

// Trust the reverse proxy (Render/Cloudflare) for secure cookie handling
// This ensures X-Forwarded-Proto: https is properly recognized
app.set('trust proxy', 1);

/**
 * Configure Express middleware.
 */

// Session configuration with PostgreSQL store for persistence across restarts
const PgSession = pgSession(session);

// In production, use secure cookies if behind HTTPS proxy. In dev, allow HTTP.
const isSecure = NODE_ENV === 'production';

const sessionConfig = {
  store: new PgSession({
    pool: flashCardsDb.pool,
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
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  },
};

console.log(
  `✅ Session Config: secure=${sessionConfig.cookie.secure}, sameSite=${sessionConfig.cookie.sameSite}`
);

app.use(session(sessionConfig));

// Parse JSON request bodies for API endpoints
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
// Set EJS as the templating engine
app.set('view engine', 'ejs');
// Tell Express where to find your templates
app.set('views', path.join(__dirname, 'src/views'));

/**
 * Define routes for the application
 * (Fixed: Added 'async' to every route handler arrow function)
 */

// Middleware to populate user info on every page
app.use(async (req, res, next) => {
  if (req.session.userId) {
    res.locals.userId = req.session.userId;
    res.locals.isLoggedIn = true;

    try {
      const user = await userAuthService.getUserDisplayInfo(req.session.userId);
      if (user) {
        res.locals.fullName = user.full_name;
        res.locals.isAdmin = user.is_admin;
        siteData.setName(user.full_name);
      } else {
        res.locals.fullName = '';
        res.locals.isAdmin = false;
        siteData.setName('');
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
    siteData.setName('');
  }
  next();
});

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

/**
 * API Routes
 */

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
  const health = await flashCardsDb.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

app.listen(port, async () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${port}`);

  // Initialize database connection and bootstrap the idempotent schema
  const dbReady = await flashCardsDb.initializeDatabaseConnection();
  if (!dbReady) {
    console.warn('⚠️ Warning: Database connection failed. Some features may be unavailable.');
    return;
  }

  try {
    await flashCardsDb.initializeSchema();
  } catch (error) {
    console.error('❌ Schema initialization failed:', error.message);
  }
});
