process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

describe('Recurring Activities Process Scheduler', () => {
  let userId;

  beforeAll(async () => {
    await runMigrations();

    // Clear tables
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create a user
    const userRes = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['RecurringUser', 'recurring@test.com', 'hash']);
    userId = userRes.rows[0].id;
  });

  beforeEach(async () => {
    await db.query('DELETE FROM activities');
  });

  afterAll(async () => {
    await db.close();
  });

  test('inserts log for qualifying recurring activity', async () => {
    // Insert a recurring activity on a prior day (Tuesday 2026-06-16)
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, 1, NULL)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-16']);

    // Run processRecurringLogs for Wednesday 2026-06-17
    await app.processRecurringLogs('2026-06-17');

    const logsResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-17']);
    const logs = logsResult.rows;
    expect(logs.length).toBe(1);
    expect(logs[0].is_recurring).toBe(1);
    expect(logs[0].quantity).toBe(10);
  });

  test('skips already-logged day (idempotent on double-call)', async () => {
    // Setup last log
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, 1, NULL)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-16']);

    // Run twice for 2026-06-17
    await app.processRecurringLogs('2026-06-17');
    await app.processRecurringLogs('2026-06-17');

    const logsResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-17']);
    const logs = logsResult.rows;
    expect(logs.length).toBe(1); // Exactly 1, not 2
  });

  test('weekday-only activity skips Saturday/Sunday', async () => {
    // Weekday-only (1,2,3,4,5). Set last log on Friday 2026-06-19
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, 1, $8)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-19', '1,2,3,4,5']);

    // Run on Saturday 2026-06-20 (Day 6) -> should skip
    await app.processRecurringLogs('2026-06-20');
    let logsSatResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-20']);
    let logsSat = logsSatResult.rows;
    expect(logsSat.length).toBe(0);

    // Run on Sunday 2026-06-21 (Day 0) -> should skip
    await app.processRecurringLogs('2026-06-21');
    let logsSunResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-21']);
    let logsSun = logsSunResult.rows;
    expect(logsSun.length).toBe(0);

    // Run on Monday 2026-06-22 (Day 1) -> should log
    await app.processRecurringLogs('2026-06-22');
    let logsMonResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-22']);
    let logsMon = logsMonResult.rows;
    expect(logsMon.length).toBe(1);
  });

  test('weekend-only activity skips Monday-Friday', async () => {
    // Weekend-only (0,6). Set last log on Sunday 2026-06-21
    await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7::date, 1, $8)
    `, [userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-21', '0,6']);

    // Run on Monday 2026-06-22 (Day 1) -> should skip
    await app.processRecurringLogs('2026-06-22');
    let logsMonResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-22']);
    let logsMon = logsMonResult.rows;
    expect(logsMon.length).toBe(0);

    // Run on Tuesday 2026-06-23 (Day 2) -> should skip
    await app.processRecurringLogs('2026-06-23');
    let logsTueResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-23']);
    let logsTue = logsTueResult.rows;
    expect(logsTue.length).toBe(0);

    // Run on Saturday 2026-06-27 (Day 6) -> should log
    await app.processRecurringLogs('2026-06-27');
    let logsSatResult = await db.query('SELECT * FROM activities WHERE user_id = $1 AND activity_date = $2::date', [userId, '2026-06-27']);
    let logsSat = logsSatResult.rows;
    expect(logsSat.length).toBe(1);
  });
});
