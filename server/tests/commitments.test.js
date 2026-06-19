process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

describe('Commitments Expiration & Auto-Evaluation', () => {
  let userId;
  let token;
  let recId;
  let actionItemId;

  beforeAll(() => {
    runMigrations();

    // Create user
    const userRes = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run('CommitUser', 'commit@test.com', 'hash');
    userId = userRes.lastInsertRowid;

    token = jwt.sign({ id: userId, email: 'commit@test.com', name: 'CommitUser' }, JWT_SECRET);

    // Create mock recommendation
    const recRes = db.prepare(`
      INSERT INTO recommendations (user_id, top_category, top_category_share_pct, summary_text, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, 'transport', 60.0, 'Reduce transport impact', 'fallback');
    recId = recRes.lastInsertRowid;

    // Create mock action item
    const actionRes = db.prepare(`
      INSERT INTO action_items (recommendation_id, rank, action_text, estimated_saving_kg, target_category)
      VALUES (?, ?, ?, ?, ?)
    `).run(recId, 1, 'Swap car for bus', 10.0, 'transport');
    actionItemId = actionRes.lastInsertRowid;
  });

  beforeEach(() => {
    db.prepare('DELETE FROM commitments').run();
    db.prepare('DELETE FROM activities').run();
  });

  afterAll(() => {
    db.close();
  });

  test('evaluates expired commitment as success when emissions reduction >= 50% of target', async () => {
    // expired commitment: start 2026-06-01, end 2026-06-08 (today is after end date)
    // baseline = 20.0 kg. target saving = 10.0 kg.
    // success threshold: actual <= 20.0 - (10.0 * 0.5) => actual <= 15.0
    const commitRes = db.prepare(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(userId, actionItemId, '2026-06-01', '2026-06-08', 20.0);
    const commitmentId = commitRes.lastInsertRowid;

    // Log actual emissions during commitment: 12.0 kg (under 15.0)
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 12.0, '2026-06-04');

    // Trigger autoEvaluateCommitments by hitting GET /api/recommendations/commitments
    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    // Check updated status in DB
    const updated = db.prepare('SELECT status FROM commitments WHERE id = ?').get(commitmentId);
    expect(updated.status).toBe('success');
  });

  test('evaluates expired commitment as partial when emissions < baseline but reduction < 50% of target', async () => {
    // baseline = 20.0, target saving = 10.0
    // partial threshold: actual < 20.0 and actual > 15.0
    const commitRes = db.prepare(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(userId, actionItemId, '2026-06-01', '2026-06-08', 20.0);
    const commitmentId = commitRes.lastInsertRowid;

    // Log actual emissions during commitment: 18.0 kg (between 15.0 and 20.0)
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 18.0, '2026-06-04');

    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const updated = db.prepare('SELECT status FROM commitments WHERE id = ?').get(commitmentId);
    expect(updated.status).toBe('partial');
  });

  test('evaluates expired commitment as missed when emissions >= baseline', async () => {
    const commitRes = db.prepare(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(userId, actionItemId, '2026-06-01', '2026-06-08', 20.0);
    const commitmentId = commitRes.lastInsertRowid;

    // Log actual emissions during commitment: 22.0 kg (exceeds baseline 20.0)
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 22.0, '2026-06-04');

    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const updated = db.prepare('SELECT status FROM commitments WHERE id = ?').get(commitmentId);
    expect(updated.status).toBe('missed');
  });
});
