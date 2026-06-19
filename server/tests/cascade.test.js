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

  beforeAll(() => {
    runMigrations();
  });

  afterAll(() => {
    db.close();
  });

  test('deleting a user account cascades to remove all user data', async () => {
    // 1. Create a user
    const userRes = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run('CascadeUser', 'cascade@test.com', 'hash');
    userId = userRes.lastInsertRowid;

    token = jwt.sign({ id: userId, email: 'cascade@test.com', name: 'CascadeUser' }, JWT_SECRET);

    // 2. Insert user-associated records
    // Activity
    const actRes = db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, 'transport', 'car_petrol', 10.0, 'km', 2.0, '2026-06-01')
    `).run(userId);
    const activityId = actRes.lastInsertRowid;

    // Recommendation
    const recRes = db.prepare(`
      INSERT INTO recommendations (user_id, top_category, top_category_share_pct, summary_text, source)
      VALUES (?, 'transport', 100.0, 'Rec summary', 'fallback')
    `).run(userId);
    const recId = recRes.lastInsertRowid;

    // Action Item (foreign key to recommendations)
    const actionRes = db.prepare(`
      INSERT INTO action_items (recommendation_id, rank, action_text, estimated_saving_kg, target_category)
      VALUES (?, 1, 'Action text', 5.0, 'transport')
    `).run(recId);
    const actionItemId = actionRes.lastInsertRowid;

    // Commitment (foreign keys to user and action item)
    const commitRes = db.prepare(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES (?, ?, '2026-06-01', '2026-06-08', 'active', 15.0)
    `).run(userId, actionItemId);
    const commitmentId = commitRes.lastInsertRowid;

    // Verify they exist in DB before deletion
    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(userId)).toBeDefined();
    expect(db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)).toBeDefined();
    expect(db.prepare('SELECT id FROM recommendations WHERE id = ?').get(recId)).toBeDefined();
    expect(db.prepare('SELECT id FROM action_items WHERE id = ?').get(actionItemId)).toBeDefined();
    expect(db.prepare('SELECT id FROM commitments WHERE id = ?').get(commitmentId)).toBeDefined();

    // 3. Make deletion request
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted successfully');

    // 4. Verify cascade deletions
    expect(db.prepare('SELECT id FROM users WHERE id = ?').get(userId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM recommendations WHERE id = ?').get(recId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM action_items WHERE id = ?').get(actionItemId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM commitments WHERE id = ?').get(commitmentId)).toBeUndefined();
  });
});
