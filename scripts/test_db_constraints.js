const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

async function testConstraints() {
  process.env.NODE_ENV = 'test';
  await runMigrations();

  console.log('--- TESTING UNIQUE EMAIL CONSTRAINT DIRECTLY ON DB ---');

  // Truncate tables first
  await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

  // Insert first user
  try {
    await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
    `, ['User1', 'test@example.com', 'hash1']);
    console.log('Inserted first user successfully.');
  } catch (err) {
    console.error('Failed to insert first user:', err.message);
  }

  // Try inserting second user with same email
  try {
    await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
    `, ['User2', 'test@example.com', 'hash2']);
    console.error('✗ ERROR: Duplicate email was accepted!');
  } catch (err) {
    console.log('✓ Success: Duplicate email rejected as expected!', err.message);
  }

  await db.close();
}

testConstraints().catch(console.error);
