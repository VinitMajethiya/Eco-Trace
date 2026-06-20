/**
 * Migration 004 — Add city and streak fields to users
 * city: used for city-specific carbon benchmarks
 * current_streak / longest_streak / last_log_date: gamification daily streak
 */
async function up(db) {
  await db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_log_date DATE DEFAULT NULL;
  `);
}

module.exports = { up };
