/**
 * Migration 007 — Add Weekly Summaries Table
 * Creates the weekly_summaries table for caching weekly Gemini coaching summaries.
 */
async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      week_start_date DATE NOT NULL,
      summary_text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_weekly_summaries_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT uq_weekly_summaries_user_week UNIQUE(user_id, week_start_date)
    );
  `);
}

module.exports = { up };
