require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');

const connectDB = require('./config/db');
const { globalLimiter } = require('./middlewares/rateLimiter');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

const authRoutes = require('./routes/authRoutes');
const businessRoutes = require('./routes/businessRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const summaryRoutes = require('./routes/summaryRoutes');
const legalRoutes = require('./routes/legalRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const profileRoutes = require('./routes/profileRoutes');
const requirementRoutes = require('./routes/requirementRoutes');
const contactRoutes = require('./routes/contactRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const moderationRoutes = require('./routes/moderationRoutes');
const websiteRoutes = require('./routes/websiteRoutes');
const dns = require('dns');
dns.setServers(["1.1.1.1","8.8.8.8"]);
const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Behind a proxy (e.g. for correct client IPs in rate limiting).
app.set('trust proxy', 1); 

// --- Security & parsing middleware --- 
app.use(helmet());

// CORS: allow the configured frontend URL. In development, also allow any
// localhost/127.0.0.1 port so the app still works if Vite picks 5174, etc.
const corsOrigin = (origin, callback) => {
  // Non-browser requests (curl, server-to-server) have no origin.
  if (!origin) return callback(null, true);
  if (origin === FRONTEND_URL) return callback(null, true);
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`Origin not allowed by CORS: ${origin}`));
};

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (!isProd) {
  app.use(morgan('dev'));
}

// Global rate limiter applies to everything under /api.
app.use('/api', globalLimiter);

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/website', websiteRoutes);

// --- Serve Frontend in Production ---
if (isProd) {
  const path = require('path');
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// --- 404 + error handling ---
app.use(notFound);
app.use(errorHandler);

let server;

const start = async () => {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT} (${
      isProd ? 'production' : 'development'
    })`);
  });
  
  // Increase timeout to 5 minutes to prevent connection drops during long AI generations
  server.setTimeout(300000);
};

// --- Graceful shutdown ---
const shutdown = (signal) => {
  console.log(`\n[server] ${signal} received. Shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log('[server] HTTP server closed.');
      process.exit(0);
    });
    // Force-exit if it hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}; 

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM')); 
 
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught Exception:', err);
  shutdown('uncaughtException');
});

start();

module.exports = app; 

// Trigger nodemon restart

// Trigger nodemon restart 2

// Trigger nodemon restart for new prompts

// Trigger nodemon restart 3

// Trigger nodemon restart 4

// Trigger nodemon restart 5

// Trigger nodemon restart 6

// Trigger nodemon restart 7

// Trigger nodemon restart 8 

// Trigger nodemon restart 9
