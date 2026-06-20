process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

describe('API Routing Integration Tests', () => {
  let token;
  let userId;
  let testActivityId;

  beforeAll(async () => {
    // Force NODE_ENV to test
    process.env.NODE_ENV = 'test';
    // Run migrations
    await runMigrations();
    // Truncate tables to ensure a clean slate
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await db.close();
  });

  test('POST /api/auth/register - success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Aman',
        email: 'aman@test.com',
        password: 'password123',
        household_size: 2
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('Aman');
    expect(res.body.token).toBeDefined();
    token = res.body.token;
    userId = res.body.user.id;
  });

  test('POST /api/auth/register - reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: 'aman@test.com',
        password: 'password123'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Email already registered');
  });

  test('POST /api/auth/login - success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'aman@test.com',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login - fails closed for OAuth-only user (null password_hash)', async () => {
    // Insert an OAuth-only user directly into the database
    await db.query(`
      INSERT INTO users (name, email, password_hash, oauth_provider, oauth_id)
      VALUES ($1, $2, $3, $4, $5)
    `, ['Google User', 'googleuser@test.com', null, 'google', 'google-id-123']);

    // Attempt to log in via credentials
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'googleuser@test.com',
        password: 'any_password'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid email or password');
  });

  test('POST /api/activities - log transport commute', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'transport',
        sub_type: 'car_petrol',
        quantity: 20, // 20 km
        activity_date: '2026-06-17'
      });

    expect(res.status).toBe(201);
    expect(res.body.co2e_kg).toBeCloseTo(3.84); // 20 * 0.192
    expect(res.body.unit).toBe('km');
    testActivityId = res.body.id;
  });

  test('POST /api/activities - log recurring activity', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'transport',
        sub_type: 'bus',
        quantity: 15,
        activity_date: '2026-06-17',
        is_recurring: true,
        recurring_days: '1,2,3,4,5'
      });

    expect(res.status).toBe(201);
    expect(res.body.is_recurring).toBe(1);
    expect(res.body.recurring_days).toBe('1,2,3,4,5');
  });

  test('GET /api/activities - retrieve paginated list', async () => {
    const res = await request(app)
      .get('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    // New response shape: { activities, total, page, limit, totalPages }
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.activities.length).toBe(2);
    expect(res.body.activities[0].category).toBe('transport');
    expect(res.body.total).toBe(2);
    expect(res.body.totalPages).toBe(1);
  });

  test('GET /api/activities - authenticates correctly via cookie header containing = in other cookies', async () => {
    const res = await request(app)
      .get('/api/activities')
      .set('Cookie', `token=${token}; complex_cookie=foo=bar==; another_cookie=xyz`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });

  test('GET /api/dashboard/summary - fetch metrics', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ range: 'month' });

    expect(res.status).toBe(200);
    expect(res.body.totalCO2e).toBeCloseTo(5.415);
    expect(res.body.categoryBreakdown.find(b => b.category === 'transport').co2e_kg).toBeCloseTo(5.415);
    expect(res.body.benchmark).toBeDefined();
  });

  test('DELETE /api/activities/:id - unauthorized access block', async () => {
    const res = await request(app)
      .delete(`/api/activities/${testActivityId}`); // No token

    expect(res.status).toBe(401);
  });

  test('DELETE /api/activities/:id - delete successfully', async () => {
    const res = await request(app)
      .delete(`/api/activities/${testActivityId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted successfully');
  });
});
