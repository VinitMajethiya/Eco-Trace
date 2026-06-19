process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

async function testRateLimiter() {
  console.log('--- TESTING AUTH RATE LIMITER ---');
  runMigrations();

  const maxAttempts = 18;
  console.log(`Making ${maxAttempts} consecutive POST /api/auth/login requests...`);

  let rateLimited = false;
  let statusCodes = [];

  for (let i = 0; i < maxAttempts; i++) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rate@limit.com', password: 'wrongpassword' });
    
    statusCodes.push(res.statusCode);
    if (res.statusCode === 429) {
      rateLimited = true;
      console.log(`  - Request ${i+1}: got status 429 (Rate Limited!) - Body: ${JSON.stringify(res.body)}`);
      break;
    } else {
      console.log(`  - Request ${i+1}: got status ${res.statusCode}`);
    }
  }

  if (rateLimited) {
    console.log('✓ Success: Rate limiting triggered successfully at expected threshold!');
  } else {
    console.error('✗ ERROR: Rate limiting did not trigger within 18 attempts!');
  }

  db.close();
}

testRateLimiter();
