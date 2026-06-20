/**
 * Migration 003 — Add performance indexes
 * Adds indexes on recommendations and commitments for coaching query performance.
 */
async function up(db) {
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_recommendations_user
    ON recommendations (user_id, generated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_commitments_user_status
    ON commitments (user_id, status);
  `);
}

module.exports = { up };
