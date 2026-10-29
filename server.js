import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import session from 'express-session';

import { appSiteData } from './src/js/appSiteData.js';
import { initializeDatabase, healthCheck, query } from './src/db/connection.mjs';
import authRoutes from './src/routes/auth.mjs';
import userRoutes from './src/routes/users.mjs';
import adminRoutes from './src/routes/admin.mjs';
import systemRoutes from './src/routes/system.mjs';

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

const siteData = new appSiteData();
const app = express();

/**
 * Configure Express middleware.
 */

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'flashcards-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

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
    res.locals.username = req.session.username;
    res.locals.isLoggedIn = true;

    try {
      const user = await query('SELECT is_admin FROM users WHERE user_id = $1', [
        req.session.userId,
      ]);
      res.locals.isAdmin = user.rows.length > 0 && user.rows[0].is_admin;
    } catch (error) {
      console.error('Error checking admin status:', error.message);
      res.locals.isAdmin = false;
    }
  } else {
    res.locals.userId = null;
    res.locals.username = null;
    res.locals.isLoggedIn = false;
    res.locals.isAdmin = false;
  }
  next();
});

app.get('/', async (req, res) => {
  siteData.setTitle('Home');
  res.render('home', { siteData });
});

app.get('/practice', async (req, res) => {
  siteData.setTitle('Practice');
  res.render('practice', { siteData });
});

app.get('/quiz', async (req, res) => {
  siteData.setTitle('Quiz');
  res.render('quiz', { siteData });
});

app.get('/entries', async (req, res) => {
  siteData.setTitle('Entries');
  res.render('entries', { siteData });
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
  }
});
