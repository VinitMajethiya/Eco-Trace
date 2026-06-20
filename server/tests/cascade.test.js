process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

describe('Account Deletion Cascade', () => {
  let userId;
  let token;

  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');
  });

  test('deleting a user account cascades to remove all user data', async () => {
    // 1. Create a user
    const userRes = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['CascadeUser', 'cascade@test.com', 'hash']);
    userId = userRes.rows[0].id;

    token = jwt.sign({ id: userId, email: 'cascade@test.com', name: 'CascadeUser' }, JWT_SECRET);

    // 2. Insert user-associated records
    // Activity
    const actRes = await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, 'transport', 'car_petrol', 10.0, 'km', 2.0, '2026-06-01')
      RETURNING id
    `, [userId]);
    const activityId = actRes.rows[0].id;

    // Recommendation
    const recRes = await db.query(`
      INSERT INTO recommendations (user_id, top_category, top_category_share_pct, summary_text, source)
      VALUES ($1, 'transport', 100.0, 'Rec summary', 'fallback')
      RETURNING id
    `, [userId]);
    const recId = recRes.rows[0].id;

    // Action Item (foreign key to recommendations)
    const actionRes = await db.query(`
      INSERT INTO action_items (recommendation_id, rank, action_text, estimated_saving_kg, target_category)
      VALUES ($1, 1, 'Action text', 5.0, 'transport')
      RETURNING id
    `, [recId]);
    const actionItemId = actionRes.rows[0].id;

    // Commitment (foreign keys to user and action item)
    const commitRes = await db.query(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES ($1, $2, '2026-06-01', '2026-06-08', 'active', 15.0)
      RETURNING id
    `, [userId, actionItemId]);
    const commitmentId = commitRes.rows[0].id;

    // Verify they exist in DB before deletion
    expect((await db.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]).toBeDefined();
    expect((await db.query('SELECT id FROM activities WHERE id = $1', [activityId])).rows[0]).toBeDefined();
    expect((await db.query('SELECT id FROM recommendations WHERE id = $1', [recId])).rows[0]).toBeDefined();
    expect((await db.query('SELECT id FROM action_items WHERE id = $1', [actionItemId])).rows[0]).toBeDefined();
    expect((await db.query('SELECT id FROM commitments WHERE id = $1', [commitmentId])).rows[0]).toBeDefined();

    // 3. Make deletion request
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted successfully');

    // 4. Verify cascade deletions
    expect((await db.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]).toBeUndefined();
    expect((await db.query('SELECT id FROM activities WHERE id = $1', [activityId])).rows[0]).toBeUndefined();
    expect((await db.query('SELECT id FROM recommendations WHERE id = $1', [recId])).rows[0]).toBeUndefined();
    expect((await db.query('SELECT id FROM action_items WHERE id = $1', [actionItemId])).rows[0]).toBeUndefined();
    expect((await db.query('SELECT id FROM commitments WHERE id = $1', [commitmentId])).rows[0]).toBeUndefined();
  });
});
