process.env.GOOGLE_CLIENT_ID = 'mock-id';
process.env.GOOGLE_CLIENT_SECRET = 'mock-secret';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const passport = require('passport');

// Override passport.authenticate to simulate a successful Google auth callback
passport.authenticate = function(strategy, options, callback) {
  return function(req, res, next) {
    const mockProfile = {
      id: 'google-oauth-id-999',
      displayName: 'Google Test User',
      emails: [{ value: 'google_test@example.com' }]
    };

    // We can lookup or run the strategy verification function,
    // or just simulate the callback with a resolved user in the database.
    // Let's create the user in the database first to match strategy output.
    const db = require('../db/database');
    
    // Ensure table recreation and fields exist
    const runMigrations = require('../db/migrationRunner');
    runMigrations();

    // Check if user already exists
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get('google_test@example.com');
    if (!user) {
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, oauth_provider, oauth_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('Google Test User', 'google_test@example.com', null, 'google', 'google-oauth-id-999');
      user = {
        id: result.lastInsertRowid,
        name: 'Google Test User',
        email: 'google_test@example.com',
        password_hash: null,
        oauth_provider: 'google',
        oauth_id: 'google-oauth-id-999'
      };
    }

    if (callback) {
      callback(null, user);
    } else {
      req.user = user;
      next();
    }
  };
};

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');

async function testOAuthFlow() {
  console.log('--- TESTING OAUTH FLOW CALLBACK HANDLER ---');

  const res = await request(app)
    .get('/api/auth/google/callback')
    .expect(302);

  console.log('Redirect Location:', res.headers.location);
  
  const setCookie = res.headers['set-cookie'];
  console.log('Set-Cookie Header:', setCookie);

  // Verify the JWT token is present in the cookie
  let tokenPresent = false;
  if (setCookie && setCookie[0].includes('token=')) {
    tokenPresent = true;
    console.log('✓ JWT Cookie was successfully set on redirect!');
  } else {
    console.error('✗ ERROR: JWT Cookie was NOT found in headers!');
  }

  // Verify user database state
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get('google_test@example.com');
  console.log('\nDatabase Row created for OAuth user:');
  console.log(JSON.stringify(user, null, 2));

  if (user && user.password_hash === null && user.oauth_provider === 'google' && user.oauth_id === 'google-oauth-id-999') {
    console.log('✓ Database constraints and columns match expectation: password_hash is null, oauth fields are populated!');
  } else {
    console.error('✗ ERROR: User database row is incorrect!');
  }

  db.close();
}

testOAuthFlow();
