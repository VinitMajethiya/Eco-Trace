/**
 * Migration 007 — Add Weekly Summaries Table
 * Creates the weekly_summaries table for caching weekly Gemini coaching summaries.
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      week_start_date TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, week_start_date)
    );
  `);
}

// Decision: Stale summaries created with sliding-window keys under the old scheme are harmless and left to age out naturally.
module.exports = { up };

