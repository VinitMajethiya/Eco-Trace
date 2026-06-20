process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

describe('User Streak Logic', () => {
  let userId;
  let token;

  beforeAll(async () => {
    await runMigrations();

    // Clear tables
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create user
    const userRes = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['StreakUser', 'streak@test.com', 'hash']);
    userId = userRes.rows[0].id;

    token = jwt.sign({ id: userId, email: 'streak@test.com', name: 'StreakUser' }, JWT_SECRET);
  });

  beforeEach(async () => {
    await db.query('DELETE FROM activities');
    await db.query('UPDATE users SET current_streak = 0, longest_streak = 0, last_log_date = NULL WHERE id = $1', [userId]);
  });

  afterAll(async () => {
    await db.close();
  });

  test('current_streak increments on consecutive daily logs and updates longest_streak', async () => {
    // Log Day 1 (2026-06-01)
    const res1 = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-01'
      });

    expect(res1.status).toBe(201);
    expect(res1.body.streak.current).toBe(1);
    expect(res1.body.streak.longest).toBe(1);
    expect(res1.body.streak.isNewDay).toBe(true);

    // Log another on same day (should not increment streak)
    const res1_dup = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-01'
      });

    expect(res1_dup.status).toBe(201);
    expect(res1_dup.body.streak.current).toBe(1);
    expect(res1_dup.body.streak.isNewDay).toBe(false);

    // Log Day 2 (2026-06-02)
    const res2 = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-02'
      });

    expect(res2.status).toBe(201);
    expect(res2.body.streak.current).toBe(2);
    expect(res2.body.streak.longest).toBe(2);
    expect(res2.body.streak.isNewDay).toBe(true);
  });

  test('current_streak resets to 1 when a day is skipped', async () => {
    // Log Day 1 (2026-06-01)
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-01'
      });

    // Log Day 2 (2026-06-02)
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-02'
      });

    // Skip Day 3, Log Day 4 (2026-06-04)
    const res4 = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'food',
        sub_type: 'vegan_meal',
        quantity: 1,
        activity_date: '2026-06-04'
      });

    expect(res4.status).toBe(201);
    expect(res4.body.streak.current).toBe(1); // Reset to 1
    expect(res4.body.streak.longest).toBe(2); // Keeps longest at 2
    expect(res4.body.streak.isNewDay).toBe(true);
  });
});
