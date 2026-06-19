/**
 * Migration 001 — Initial Schema
 * Creates all base tables: users, activities, recommendations, action_items, commitments
 * Plus the two original indexes on activities.
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      household_size INTEGER DEFAULT 1,
      default_commute_mode TEXT DEFAULT NULL,
      default_diet TEXT DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('transport', 'energy', 'food', 'consumption')),
      sub_type TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0 AND quantity < 100000),
      unit TEXT NOT NULL,
      co2e_kg REAL NOT NULL,
      activity_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      top_category TEXT NOT NULL,
      top_category_share_pct REAL NOT NULL,
      summary_text TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('llm', 'fallback')),
      is_stale INTEGER DEFAULT 0,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      action_text TEXT NOT NULL,
      estimated_saving_kg REAL NOT NULL,
      target_category TEXT NOT NULL,
      FOREIGN KEY (recommendation_id) REFERENCES recommendations (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_item_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'success', 'partial', 'missed')),
      baseline_co2e_kg REAL NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (action_item_id) REFERENCES action_items (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_activities_user_category ON activities (user_id, category);
  `);
}

module.exports = { up };
