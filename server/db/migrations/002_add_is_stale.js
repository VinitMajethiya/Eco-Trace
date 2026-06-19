/**
 * Migration 002 — Add is_stale column to recommendations
 * Guards against re-adding if it already exists (idempotent).
 */
function up(db) {
  const cols = db.pragma('table_info(recommendations)');
  const hasIsStale = cols.some(c => c.name === 'is_stale');
  if (!hasIsStale) {
    db.exec(`ALTER TABLE recommendations ADD COLUMN is_stale INTEGER DEFAULT 0`);
  }
}

module.exports = { up };
