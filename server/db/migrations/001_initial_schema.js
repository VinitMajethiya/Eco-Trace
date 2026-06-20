/**
 * Migration 001 — Initial Schema
 * Creates all base tables in PostgreSQL: users, activities, recommendations, action_items, commitments.
 */
async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      household_size INTEGER DEFAULT 1,
      default_commute_mode VARCHAR(50) DEFAULT NULL,
      default_diet VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      category VARCHAR(50) NOT NULL CHECK(category IN ('transport', 'energy', 'food', 'consumption')),
      sub_type VARCHAR(100) NOT NULL,
      quantity DOUBLE PRECISION NOT NULL CHECK(quantity > 0 AND quantity < 100000),
      unit VARCHAR(50) NOT NULL,
      co2e_kg DOUBLE PRECISION NOT NULL,
      activity_date DATE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      top_category VARCHAR(50) NOT NULL,
      top_category_share_pct DOUBLE PRECISION NOT NULL,
      summary_text TEXT NOT NULL,
      source VARCHAR(50) NOT NULL CHECK(source IN ('llm', 'fallback')),
      is_stale INTEGER DEFAULT 0,
      generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_recommendations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id SERIAL PRIMARY KEY,
      recommendation_id INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      action_text TEXT NOT NULL,
      estimated_saving_kg DOUBLE PRECISION NOT NULL,
      target_category VARCHAR(50) NOT NULL,
      CONSTRAINT fk_action_items_recommendation FOREIGN KEY (recommendation_id) REFERENCES recommendations (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commitments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      action_item_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'active' CHECK(status IN ('active', 'success', 'partial', 'missed')),
      baseline_co2e_kg DOUBLE PRECISION NOT NULL,
      CONSTRAINT fk_commitments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_commitments_action_item FOREIGN KEY (action_item_id) REFERENCES action_items (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities (user_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_activities_user_category ON activities (user_id, category);
  `);
}

module.exports = { up };
