/**
 * Migration 006 — Add OAuth Support
 * Migrates users table to make password_hash nullable using table-recreation.
 * Recreates all existing user-defined indexes and adds a new unique index on oauth_provider/id.
 */
function up(db) {
  // Disable foreign keys checks during schema transition
  db.pragma('foreign_keys = OFF');

  try {
    // Wrap operations in a transaction
    db.transaction(() => {
      // 1. Gather all existing user-defined indexes on the users table from sqlite_master
      const existingIndexes = db.prepare(`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type = 'index' AND tbl_name = 'users' AND sql IS NOT NULL
      `).all();

      // 2. Create the new table users_new with password_hash as nullable
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT DEFAULT NULL,
          household_size INTEGER DEFAULT 1,
          default_commute_mode TEXT DEFAULT NULL,
          default_diet TEXT DEFAULT NULL,
          city TEXT DEFAULT NULL,
          current_streak INTEGER DEFAULT 0,
          longest_streak INTEGER DEFAULT 0,
          last_log_date TEXT DEFAULT NULL,
          oauth_provider TEXT DEFAULT NULL,
          oauth_id TEXT DEFAULT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Copy all data from users to users_new
      // We check if the columns exist first dynamically
      const cols = db.pragma('table_info(users)').map(c => c.name);
      
      const sourceCols = [
        'id', 'name', 'email', 'password_hash', 'household_size',
        'default_commute_mode', 'default_diet', 'created_at'
      ];
      if (cols.includes('city')) sourceCols.push('city');
      if (cols.includes('current_streak')) sourceCols.push('current_streak');
      if (cols.includes('longest_streak')) sourceCols.push('longest_streak');
      if (cols.includes('last_log_date')) sourceCols.push('last_log_date');

      const colList = sourceCols.join(', ');
      db.exec(`
        INSERT INTO users_new (${colList})
        SELECT ${colList} FROM users;
      `);

      // 4. Drop the original table users
      db.exec(`DROP TABLE users;`);

      // 5. Rename users_new to users
      db.exec(`ALTER TABLE users_new RENAME TO users;`);

      // 6. Recreate any user-defined indexes that existed on users originally
      for (const idx of existingIndexes) {
        db.exec(idx.sql);
      }

      // 7. Create the new index for OAuth provider/id lookup
      db.exec(`
        CREATE UNIQUE INDEX idx_users_oauth 
        ON users (oauth_provider, oauth_id);
      `);
    })();
  } finally {
    // Guarantee foreign key constraints are re-enabled
    db.pragma('foreign_keys = ON');
  }
}

module.exports = { up };
