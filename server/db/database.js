const { Pool, types } = require('pg');
const dotenv = require('dotenv');

// Parse PostgreSQL DATE (1082), TIMESTAMP (1114), and TIMESTAMPTZ (1184) as string to match SQLite behaviour
types.setTypeParser(1082, val => val);
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

dotenv.config();

// Determine connection URL based on environment
let connectionString = process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'test') {
  connectionString = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecotrace_test';
} else if (!connectionString) {
  connectionString = 'postgres://postgres:postgres@localhost:5432/ecotrace';
}

const pool = new Pool({
  connectionString,
  max: 10, // Sane limit for Render free tier connection counts
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production' || connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  exec: (text) => pool.query(text),
  pool,
  close: () => pool.end()
};
