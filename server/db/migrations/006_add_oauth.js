/**
 * Migration 006 — Add OAuth Support
 * Migrates users table to make password_hash nullable and adds oauth columns/indexes.
 */
async function up(db) {
  await db.query(`
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50) DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255) DEFAULT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth ON users (oauth_provider, oauth_id);
  `);
}

module.exports = { up };
