const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

function testConstraints() {
  process.env.NODE_ENV = 'test';
  runMigrations();

  console.log('--- TESTING UNIQUE EMAIL CONSTRAINT DIRECTLY ON DB ---');

  // Insert first user
  db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `).run('User1', 'test@example.com', 'hash1');
  console.log('Inserted first user successfully.');

  // Try inserting second user with same email
  try {
    db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run('User2', 'test@example.com', 'hash2');
    console.error('✗ ERROR: Duplicate email was accepted!');
  } catch (err) {
    console.log('✓ Success: Duplicate email rejected as expected!', err.message);
  }

  db.close();
}

testConstraints();
