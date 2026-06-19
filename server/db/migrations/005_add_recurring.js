/**
 * Migration 005 — Add recurring log fields to activities
 * is_recurring: 1 = this log should auto-repeat
 * recurring_days: comma-separated JS day numbers (0=Sun, 1=Mon, ..., 6=Sat)
 *   e.g. "1,2,3,4,5" = weekdays only
 */
function up(db) {
  const cols = db.pragma('table_info(activities)');
  const colNames = cols.map(c => c.name);

  if (!colNames.includes('is_recurring')) {
    db.exec(`ALTER TABLE activities ADD COLUMN is_recurring INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('recurring_days')) {
    db.exec(`ALTER TABLE activities ADD COLUMN recurring_days TEXT DEFAULT NULL`);
  }
}

module.exports = { up };
