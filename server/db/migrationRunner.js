const path = require('path');
const fs = require('fs');
const db = require('./database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  // Ensure the migrations tracker table exists in Postgres
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discover migration files sorted by name
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(filename => filename.endsWith('.js'))
      .sort();
  } catch (err) {
    console.warn('Migration directory not found — skipping versioned migrations.');
    return;
  }

  // Check which have already been run
  const result = await db.query('SELECT name FROM schema_migrations');
  const ran = new Set(result.rows.map(row => row.name));

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
      await migration.up(db);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
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
  runMigrations().then(() => {
    console.log('Migrations complete.');
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = runMigrations;
