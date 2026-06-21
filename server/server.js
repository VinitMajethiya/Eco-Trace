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

// Recurring log job: auto-create recurring activities at midnight and on startup
const db = require('./db/database');
async function processRecurringLogs(dateOverride) {
  try {
    const today = dateOverride ? new Date(dateOverride) : new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDayNum = today.getDay().toString(); // 0=Sun, 1=Mon...

    // Perform bulk check and insert in a single SQL statement to avoid N+1 query loop
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      SELECT a.user_id, a.category, a.sub_type, a.quantity, a.unit, a.co2e_kg, $1::date, 1, a.recurring_days
      FROM activities a
      WHERE a.is_recurring = 1
        AND a.activity_date < $2::date
        AND (a.recurring_days IS NULL OR position(',' || $3 || ',' in ',' || a.recurring_days || ',') > 0)
        AND NOT EXISTS (
          SELECT 1 FROM activities today_act
          WHERE today_act.user_id = a.user_id
            AND today_act.sub_type = a.sub_type
            AND today_act.activity_date = $4::date
        )
      GROUP BY a.user_id, a.category, a.sub_type, a.quantity, a.unit, a.co2e_kg, a.recurring_days
      HAVING MAX(a.activity_date) < $5::date
    `, [todayStr, todayStr, todayDayNum, todayStr, todayStr]);
  } catch (err) {
    // Gracefully skip if recurring columns not yet migrated
    if (!err.message.includes('column') && !err.message.includes('relation')) {
      console.error('Recurring log job error:', err.message);
    }
  }
}

// Run database migrations on startup (versioned, idempotent) - bypass on Vercel
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const runMigrations = require('./db/migrationRunner');
  runMigrations()
    .then(() => {
      console.log('Database migrations completed successfully.');
      return processRecurringLogs();
    })
    .then(() => {
      console.log('Recurring logs processed on startup.');
      // Schedule cron job to run at midnight every day
      cron.schedule('0 0 * * *', () => {
        processRecurringLogs().catch(err => console.error('Cron recurring log job failed:', err));
      });
    })
    .catch(err => {
      console.error('Failed to initialize database and run startup migrations:', err);
      process.exit(1);
    });
}

// Attach helper for testing recurring logs
app.processRecurringLogs = processRecurringLogs;

// Run server - bypass on Vercel serverless environments
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`EcoTrace server running on port ${PORT}`);
  });
}

module.exports = app;
