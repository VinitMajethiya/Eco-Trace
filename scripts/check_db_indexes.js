const Database = require('better-sqlite3');
const runMigrations = require('../db/migrationRunner');

function runIndexCheck() {
  const db = new Database(':memory:');
  console.log('--- TESTING INDEX PRESERVATION ---');

  // Let's run migrations up to 005 manually.
  // The migrations list:
  const migs = [
    require('../db/migrations/001_initial_schema'),
    require('../db/migrations/002_add_is_stale'),
    require('../db/migrations/003_add_indexes'),
    require('../db/migrations/004_add_city_streak'),
    require('../db/migrations/005_add_recurring'),
  ];

  migs.forEach((mig, idx) => {
    console.log(`Applying migration 00${idx+1}...`);
    mig.up(db);
  });

  // Check indexes before migration 006
  console.log('\nIndexes on users BEFORE Migration 006:');
  const idxListBefore = db.prepare("PRAGMA index_list(users)").all();
  console.log(JSON.stringify(idxListBefore, null, 2));

  // Check indexes in sqlite_master
  const masterBefore = db.prepare("SELECT * FROM sqlite_master WHERE tbl_name = 'users'").all();
  console.log('sqlite_master entries for users BEFORE Migration 006:');
  console.log(JSON.stringify(masterBefore.map(r => ({ type: r.type, name: r.name, sql: r.sql })), null, 2));

  // Apply Migration 006
  console.log('\nApplying Migration 006...');
  require('../db/migrations/006_add_oauth').up(db);

  // Check indexes after migration 006
  console.log('\nIndexes on users AFTER Migration 006:');
  const idxListAfter = db.prepare("PRAGMA index_list(users)").all();
  console.log(JSON.stringify(idxListAfter, null, 2));

  const masterAfter = db.prepare("SELECT * FROM sqlite_master WHERE tbl_name = 'users'").all();
  console.log('sqlite_master entries for users AFTER Migration 006:');
  console.log(JSON.stringify(masterAfter.map(r => ({ type: r.type, name: r.name, sql: r.sql })), null, 2));

  db.close();
}

runIndexCheck();
