import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

import { appSiteData } from './src/js/appSiteData.js';
import { initializeDatabase, healthCheck } from './src/db/connection.mjs';

// Define the application environment.
const NODE_ENV = process.env.NODE_ENV?.toLocaleLowerCase() || 'production';
// Define the port the server will listen on (Fixed: Changed from 'let' to 'const').
const port = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const siteData = new appSiteData();
const app = express();

/**
 * Configure Express middleware.
 */
app.use(express.static(path.join(__dirname, 'public')));
// Set EJS as the templating engine
app.set('view engine', 'ejs');
// Tell Express where to find your templates
app.set('views', path.join(__dirname, 'src/views'));

/**
 * Define routes for the application
 * (Fixed: Added 'async' to every route handler arrow function)
 */
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
  res.render('login', { siteData });
});

app.get('/profile', async (req, res) => {
  siteData.setTitle('Profile');
  res.render('profile', { siteData });
});

app.get('/logout', async (req, res) => {
  siteData.setTitle('Logout');
  res.render('logout', { siteData });
});

/**
 * API Routes
 */

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
