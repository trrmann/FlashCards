import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';
import pgSession from 'connect-pg-simple';

import { appSiteData } from './src/scripts/js/appSiteData.js';
import {
  initializeDatabase,
  healthCheck,
  query,
  pool,
} from './src/scripts/js/modules/db/connection.mjs';
import { runMigrations } from './src/scripts/js/modules/db/migrations.mjs';
import authRoutes from './src/scripts/js/modules/routes/auth.mjs';
import userRoutes from './src/routes/users.mjs';
import adminRoutes from './src/routes/admin.mjs';
import systemRoutes from './src/routes/system.mjs';
import navigationRoutes from './src/routes/navigation.mjs';
import entriesRoutes from './src/routes/entries.mjs';
import practiceRoutes from './src/routes/practice.mjs';
import quizRoutes from './src/routes/quiz.mjs';

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
    pool: pool,
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
      const user = await query('SELECT full_name, is_admin FROM users WHERE user_id = $1', [
        req.session.userId,
      ]);
      if (user.rows.length > 0) {
        res.locals.fullName = user.rows[0].full_name;
        res.locals.isAdmin = user.rows[0].is_admin;
        siteData.setName(user.rows[0].full_name);
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
    const result = await query('SELECT COUNT(*) as count FROM users');
    userCount = parseInt(result.rows[0].count, 10);
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
app.use('/api/system', systemRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);

// User routes
app.use('/api/users', userRoutes);

// Navigation routes (page tracking, history)
app.use('/api/navigation', navigationRoutes);

// Entries/Flashcards routes (CRUD and sharing)
app.use('/api/entries', entriesRoutes);

// Practice Study routes (Leitner system)
app.use('/practice', practiceRoutes);
app.use('/api/practice', practiceRoutes);

// Quiz routes
app.use('/api/quiz', quizRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = await healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

app.listen(port, async () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${port}`);

  // Initialize database connection
  const dbReady = await initializeDatabase();
  if (!dbReady) {
    console.warn('⚠️ Warning: Database connection failed. Some features may be unavailable.');
  } else {
    // Run database migrations
    await runMigrations();
  }
});
