process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const recommendationsRouter = require('../routes/recommendations');

describe('Commitments Expiration & Auto-Evaluation', () => {
  let userId;
  let token;
  let recId;
  let actionItemId;

  beforeAll(async () => {
    await runMigrations();

    // Clear tables
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create user
    const userRes = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['CommitUser', 'commit@test.com', 'hash']);
    userId = userRes.rows[0].id;

    token = jwt.sign({ id: userId, email: 'commit@test.com', name: 'CommitUser' }, JWT_SECRET);

    // Create mock recommendation
    const recRes = await db.query(`
      INSERT INTO recommendations (user_id, top_category, top_category_share_pct, summary_text, source)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [userId, 'transport', 60.0, 'Reduce transport impact', 'fallback']);
    recId = recRes.rows[0].id;

    // Create mock action item
    const actionRes = await db.query(`
      INSERT INTO action_items (recommendation_id, rank, action_text, estimated_saving_kg, target_category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [recId, 1, 'Swap car for bus', 10.0, 'transport']);
    actionItemId = actionRes.rows[0].id;
  });

  beforeEach(async () => {
    await db.query('DELETE FROM commitments');
    await db.query('DELETE FROM activities');
  });

  afterAll(async () => {
    await db.close();
  });

  test('evaluates expired commitment as success when emissions reduction >= 50% of target', async () => {
    // expired commitment: start 2026-06-01, end 2026-06-08 (today is after end date)
    // baseline = 20.0 kg. target saving = 10.0 kg.
    // success threshold: actual <= 20.0 - (10.0 * 0.5) => actual <= 15.0
    const commitRes = await db.query(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING id
    `, [userId, actionItemId, '2026-06-01', '2026-06-08', 20.0]);
    const commitmentId = commitRes.rows[0].id;

    // Log actual emissions during commitment: 12.0 kg (under 15.0)
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 12.0, '2026-06-04']);

    // Trigger autoEvaluateCommitments by hitting GET /api/recommendations/commitments
    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    // Check updated status in DB
    const updatedResult = await db.query('SELECT status FROM commitments WHERE id = $1', [commitmentId]);
    expect(updatedResult.rows[0].status).toBe('success');
  });

  test('evaluates expired commitment as partial when emissions < baseline but reduction < 50% of target', async () => {
    // baseline = 20.0, target saving = 10.0
    // partial threshold: actual < 20.0 and actual > 15.0
    const commitRes = await db.query(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING id
    `, [userId, actionItemId, '2026-06-01', '2026-06-08', 20.0]);
    const commitmentId = commitRes.rows[0].id;

    // Log actual emissions during commitment: 18.0 kg (between 15.0 and 20.0)
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 18.0, '2026-06-04']);

    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const updatedResult = await db.query('SELECT status FROM commitments WHERE id = $1', [commitmentId]);
    expect(updatedResult.rows[0].status).toBe('partial');
  });

  test('evaluates expired commitment as missed when emissions >= baseline', async () => {
    const commitRes = await db.query(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING id
    `, [userId, actionItemId, '2026-06-01', '2026-06-08', 20.0]);
    const commitmentId = commitRes.rows[0].id;

    // Log actual emissions during commitment: 22.0 kg (exceeds baseline 20.0)
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 22.0, '2026-06-04']);

    const res = await request(app)
      .get('/api/recommendations/commitments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    
    const updatedResult = await db.query('SELECT status FROM commitments WHERE id = $1', [commitmentId]);
    expect(updatedResult.rows[0].status).toBe('missed');
  });

  test('autoEvaluateCommitments performs exactly one UPDATE query regardless of the number of commitments', async () => {
    // 1. Clean commitments
    await db.query('DELETE FROM commitments');

    // 2. Insert 5 expired commitments
    for (let i = 0; i < 5; i++) {
      await db.query(`
        INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
        VALUES ($1, $2, $3::date, $4::date, 'active', 50.0)
      `, [userId, actionItemId, '2026-06-01', '2026-06-08']);
    }

    // 3. Spy on client query execution (callback and promise safe)
    let updateQueryCount = 0;
    const originalConnect = db.pool.connect.bind(db.pool);
    db.pool.connect = (cb) => {
      if (typeof cb === 'function') {
        return originalConnect((err, client, done) => {
          if (client && !client._wrapped) {
            client._wrapped = true;
            const originalClientQuery = client.query.bind(client);
            client.query = (...args) => {
              if (typeof args[0] === 'string' && args[0].trim().startsWith('UPDATE')) {
                updateQueryCount++;
              }
              return originalClientQuery(...args);
            };
          }
          cb(err, client, done);
        });
      } else {
        return originalConnect().then(client => {
          if (client && !client._wrapped) {
            client._wrapped = true;
            const originalClientQuery = client.query.bind(client);
            client.query = (...args) => {
              if (typeof args[0] === 'string' && args[0].trim().startsWith('UPDATE')) {
                updateQueryCount++;
              }
              return originalClientQuery(...args);
            };
          }
          return client;
        });
      }
    };

    try {
      // Run autoEvaluateCommitments
      await recommendationsRouter.autoEvaluateCommitments(userId);
      expect(updateQueryCount).toBe(1);

      // Reset spy count
      updateQueryCount = 0;
      
      // Clean and insert 50 expired commitments
      await db.query('DELETE FROM commitments');
      for (let i = 0; i < 50; i++) {
        await db.query(`
          INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
          VALUES ($1, $2, $3::date, $4::date, 'active', 50.0)
        `, [userId, actionItemId, '2026-06-01', '2026-06-08']);
      }

      // Run autoEvaluateCommitments again
      await recommendationsRouter.autoEvaluateCommitments(userId);
      expect(updateQueryCount).toBe(1); // STILL EXACTLY 1!
    } finally {
      // Restore original pool.connect
      db.pool.connect = originalConnect;
    }
  });
});
