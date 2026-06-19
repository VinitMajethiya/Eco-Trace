/**
 * Migration Runner
 * 
 * Replaces the monolithic migrate.js with a versioned, idempotent migration system.
 * 
 * - Maintains a `schema_migrations` table tracking which migrations have been run.
 * - Discovers migration files in ./migrations/ ordered by filename (001_, 002_, ...).
 * - Runs only pending migrations on each startup.
 * - Each migration exports a single `up(db)` function.
 */
const path = require('path');
const fs = require('fs');
const db = require('./database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function runMigrations() {
  // Ensure the migrations tracker table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discover migration files sorted by name
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js'))
      .sort();
  } catch (err) {
    console.warn('Migration directory not found — skipping versioned migrations.');
    return;
  }

  // Check which have already been run
  const ran = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name)
  );

  let count = 0;
  for (const file of migrationFiles) {
    if (ran.has(file)) continue;

    const migration = require(path.join(MIGRATIONS_DIR, file));

    if (typeof migration.up !== 'function') {
      console.warn(`[migrations] Skipping ${file}: no 'up' function exported`);
      continue;
    }

    try {
      console.log(`[migrations] Running ${file}...`);
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      count++;
      console.log(`[migrations] ✓ ${file}`);
    } catch (err) {
      console.error(`[migrations] ✗ Failed on ${file}:`, err.message);
      throw err; // Stop server startup on migration failure
    }
  }

  if (count === 0) {
    console.log('[migrations] All migrations already applied.');
  } else {
    console.log(`[migrations] Applied ${count} migration(s).`);
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
