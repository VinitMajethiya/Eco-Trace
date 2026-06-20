/**
 * Migration 002 — Add is_stale column to recommendations
 * Guards against re-adding if it already exists (idempotent).
 */
async function up(db) {
  await db.query(`ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS is_stale INTEGER DEFAULT 0`);
}

module.exports = { up };
