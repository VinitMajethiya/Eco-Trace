process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');

describe('Recurring Activities Process Scheduler', () => {
  let userId;

  beforeAll(() => {
    runMigrations();

    // Create a user
    const userRes = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run('RecurringUser', 'recurring@test.com', 'hash');
    userId = userRes.lastInsertRowid;
  });

  beforeEach(() => {
    db.prepare('DELETE FROM activities').run();
  });

  afterAll(() => {
    db.close();
  });

  test('inserts log for qualifying recurring activity', () => {
    // Insert a recurring activity on a prior day (Tuesday 2026-06-16)
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-16');

    // Run processRecurringLogs for Wednesday 2026-06-17
    app.processRecurringLogs('2026-06-17');

    const logs = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-17');
    expect(logs.length).toBe(1);
    expect(logs[0].is_recurring).toBe(1);
    expect(logs[0].quantity).toBe(10);
  });

  test('skips already-logged day (idempotent on double-call)', () => {
    // Setup last log
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-16');

    // Run twice for 2026-06-17
    app.processRecurringLogs('2026-06-17');
    app.processRecurringLogs('2026-06-17');

    const logs = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-17');
    expect(logs.length).toBe(1); // Exactly 1, not 2
  });

  test('weekday-only activity skips Saturday/Sunday', () => {
    // Weekday-only (1,2,3,4,5). Set last log on Friday 2026-06-19
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-19', '1,2,3,4,5');

    // Run on Saturday 2026-06-20 (Day 6) -> should skip
    app.processRecurringLogs('2026-06-20');
    let logsSat = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-20');
    expect(logsSat.length).toBe(0);

    // Run on Sunday 2026-06-21 (Day 0) -> should skip
    app.processRecurringLogs('2026-06-21');
    let logsSun = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-21');
    expect(logsSun.length).toBe(0);

    // Run on Monday 2026-06-22 (Day 1) -> should log
    app.processRecurringLogs('2026-06-22');
    let logsMon = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-22');
    expect(logsMon.length).toBe(1);
  });

  test('weekend-only activity skips Monday-Friday', () => {
    // Weekend-only (0,6). Set last log on Sunday 2026-06-21
    db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-21', '0,6');

    // Run on Monday 2026-06-22 (Day 1) -> should skip
    app.processRecurringLogs('2026-06-22');
    let logsMon = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-22');
    expect(logsMon.length).toBe(0);

    // Run on Tuesday 2026-06-23 (Day 2) -> should skip
    app.processRecurringLogs('2026-06-23');
    let logsTue = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-23');
    expect(logsTue.length).toBe(0);

    // Run on Saturday 2026-06-27 (Day 6) -> should log
    app.processRecurringLogs('2026-06-27');
    let logsSat = db.prepare('SELECT * FROM activities WHERE user_id = ? AND activity_date = ?').all(userId, '2026-06-27');
    expect(logsSat.length).toBe(1);
  });
});
