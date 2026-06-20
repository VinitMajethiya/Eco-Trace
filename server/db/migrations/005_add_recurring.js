/**
 * Migration 005 — Add recurring log fields to activities
 * is_recurring: 1 = this log should auto-repeat
 * recurring_days: comma-separated JS day numbers (0=Sun, 1=Mon, ..., 6=Sat)
 */
async function up(db) {
  await db.query(`
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_recurring INTEGER DEFAULT 0;
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS recurring_days VARCHAR(50) DEFAULT NULL;
  `);
}

module.exports = { up };
