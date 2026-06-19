const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const morgan = require('morgan');
const passport = require('passport');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Mount Morgan request logging middleware
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

const PORT = process.env.PORT || 5000;

// Security headers — must be first
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    }
  }
}));

// Enable CORS
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Parse cookies
app.use(cookieParser());

// Parse JSON request body
app.use(express.json());

// Initialize Passport middleware for OAuth
app.use(passport.initialize());

// Set up security rate limiter on Auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 15, // limit each IP to AUTH_RATE_LIMIT_MAX requests per windowMs
  message: { error: 'Too many authentication requests, please try again after 15 minutes.' }
});

// Setup Routers
const authRouter = require('./routes/auth');
const activitiesRouter = require('./routes/activities');
const dashboardRouter = require('./routes/dashboard');
const recommendationsRouter = require('./routes/recommendations');
const referenceRouter = require('./routes/reference');
const weeklySummaryRouter = require('./routes/weeklySummary');

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dashboard/weekly-summary', weeklySummaryRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/reference', referenceRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

// Run database migrations on startup (versioned, idempotent)
if (process.env.NODE_ENV !== 'test') {
  const runMigrations = require('./db/migrationRunner');
  runMigrations();
}

// Recurring log job: auto-create recurring activities at midnight and on startup
const db = require('./db/database');
function processRecurringLogs(dateOverride) {
  try {
    const today = dateOverride ? new Date(dateOverride) : new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDayNum = today.getDay().toString(); // 0=Sun, 1=Mon...

    // Find all recurring activities not yet logged today
    const recurring = db.prepare(`
      SELECT a.*, u.id as uid
      FROM activities a
      JOIN users u ON a.user_id = u.id
      WHERE a.is_recurring = 1
        AND a.activity_date < ?
        AND (a.recurring_days IS NULL OR instr(',' || a.recurring_days || ',', ',' || ? || ',') > 0)
      GROUP BY a.user_id, a.sub_type, a.category
      HAVING MAX(a.activity_date) < ?
    `).all(todayStr, todayDayNum, todayStr);

    if (recurring.length > 0) {
      const checkAlreadyLogged = db.prepare(
        'SELECT id FROM activities WHERE user_id = ? AND sub_type = ? AND activity_date = ?'
      );
      const insertActivity = db.prepare(`
        INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      const runTransaction = db.transaction((rows) => {
        rows.forEach(r => {
          const alreadyLogged = checkAlreadyLogged.get(r.user_id, r.sub_type, todayStr);
          if (!alreadyLogged) {
            insertActivity.run(r.user_id, r.category, r.sub_type, r.quantity, r.unit, r.co2e_kg, todayStr, r.recurring_days);
          }
        });
      });

      runTransaction(recurring);
    }
  } catch (err) {
    // Gracefully skip if recurring columns not yet migrated
    if (!err.message.includes('no such column')) {
      console.error('Recurring log job error:', err.message);
    }
  }
}

// Run database migrations on startup (versioned, idempotent)
if (process.env.NODE_ENV !== 'test') {
  const runMigrations = require('./db/migrationRunner');
  runMigrations();

  // Run once on startup
  processRecurringLogs();

  // Schedule cron job to run at midnight every day
  cron.schedule('0 0 * * *', () => processRecurringLogs());
}

// Attach helper for testing recurring logs
app.processRecurringLogs = processRecurringLogs;

// Run server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`EcoTrace server running on port ${PORT}`);
  });
}

module.exports = app;
