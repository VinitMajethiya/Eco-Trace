const Database = require('better-sqlite3');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const dbPath = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : path.join(__dirname, '..', 'ecotrace.db');

const db = new Database(dbPath, { verbose: process.env.NODE_ENV === 'development' ? console.log : null });

// Enable foreign key constraints in SQLite
db.pragma('foreign_keys = ON');

module.exports = db;
