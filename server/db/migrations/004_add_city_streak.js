/**
 * Migration 004 — Add city and streak fields to users
 * city: used for city-specific carbon benchmarks
 * current_streak / longest_streak / last_log_date: gamification daily streak
 */
function up(db) {
  const cols = db.pragma('table_info(users)');
  const colNames = cols.map(c => c.name);

  if (!colNames.includes('city')) {
    db.exec(`ALTER TABLE users ADD COLUMN city TEXT DEFAULT NULL`);
  }
  if (!colNames.includes('current_streak')) {
    db.exec(`ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('longest_streak')) {
    db.exec(`ALTER TABLE users ADD COLUMN longest_streak INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('last_log_date')) {
    db.exec(`ALTER TABLE users ADD COLUMN last_log_date TEXT DEFAULT NULL`);
  }
}

module.exports = { up };
