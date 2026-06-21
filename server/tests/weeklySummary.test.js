process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const weeklySummaryRouter = require('../routes/weeklySummary');

describe('Weekly Summary Caching and ISO Week boundaries', () => {
  let userId;
  let token;

  beforeAll(async () => {
    await runMigrations();

    // Clear tables
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create a test user
    const userRes = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['SummaryUser', 'summary@test.com', 'hash']);
    userId = userRes.rows[0].id;

    token = jwt.sign({ id: userId, email: 'summary@test.com', name: 'SummaryUser' }, JWT_SECRET);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM weekly_summaries');
    await db.query('DELETE FROM activities');
    jest.useRealTimers();
  });

  test('getISOWeekMonday returns identical Monday within the same calendar week', () => {
    const { getISOWeekMonday } = weeklySummaryRouter;

    const monday = getISOWeekMonday('2026-06-15');
    const wednesday = getISOWeekMonday('2026-06-17');
    const sunday = getISOWeekMonday('2026-06-21');
    const nextMonday = getISOWeekMonday('2026-06-22');

    // Format all dates to YYYY-MM-DD in UTC
    const formatDate = (d) => d.toISOString().split('T')[0];

    expect(formatDate(monday)).toBe('2026-06-15');
    expect(formatDate(wednesday)).toBe('2026-06-15');
    expect(formatDate(sunday)).toBe('2026-06-15');
    expect(formatDate(nextMonday)).toBe('2026-06-22');
  });

  test('getWeeklyRanges calculates correct current and previous ISO week ranges', () => {
    const { getWeeklyRanges } = weeklySummaryRouter;
    const ranges = getWeeklyRanges(new Date('2026-06-17')); // Wednesday

    expect(ranges.startCurrent).toBe('2026-06-15'); // Monday
    expect(ranges.endCurrent).toBe('2026-06-21');   // Sunday
    expect(ranges.startPrevious).toBe('2026-06-08'); // Prev Monday
    expect(ranges.endPrevious).toBe('2026-06-14');   // Prev Sunday
  });

  test('API Endpoint uses the fixed ISO Monday as cache key and caches correctly', async () => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval'
      ]
    });
    
    // Set system time to Wednesday 2026-06-17
    jest.setSystemTime(new Date('2026-06-17'));

    // Mock global fetch to return a summary
    const mockSummaryText = "You had an amazing carbon reduction week! Great job using the metro.";
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: mockSummaryText }]
            }
          }]
        })
      })
    );

    process.env.GEMINI_API_KEY = 'mock-key';

    // 1. First request should trigger Gemini call (cache miss)
    const res1 = await request(app)
      .get('/api/dashboard/weekly-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.weekStartDate).toBe('2026-06-15');
    expect(res1.body.summaryText).toBe(mockSummaryText);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Verify row added to DB
    const dbRowResult = await db.query('SELECT * FROM weekly_summaries WHERE user_id = $1', [userId]);
    const dbRow = dbRowResult.rows[0];
    expect(dbRow.week_start_date).toBe('2026-06-15');
    expect(dbRow.summary_text).toBe(mockSummaryText);

    // 2. Request on the next day (Thursday 2026-06-18) in the same week should hit cache (no new Gemini call)
    jest.setSystemTime(new Date('2026-06-18'));
    
    const res2 = await request(app)
      .get('/api/dashboard/weekly-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(true);
    expect(res2.body.weekStartDate).toBe('2026-06-15');
    expect(res2.body.summaryText).toBe(mockSummaryText);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1 call total

    // 3. Request in the following week (Monday 2026-06-22) should cross week boundary, miss cache, and call Gemini again
    jest.setSystemTime(new Date('2026-06-22'));
    
    const newSummaryText = "A fresh week is here! Try switching to vegan meals.";
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: newSummaryText }]
            }
          }]
        })
      })
    );

    const res3 = await request(app)
      .get('/api/dashboard/weekly-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res3.status).toBe(200);
    expect(res3.body.cached).toBe(false);
    expect(res3.body.weekStartDate).toBe('2026-06-22');
    expect(res3.body.summaryText).toBe(newSummaryText);
    expect(global.fetch).toHaveBeenCalledTimes(1); // 1 call for the new fetch mock instance
  });

  test('getISOWeekMonday and getWeeklyRanges are timezone-independent (IST vs UTC boundary)', () => {
    const { getISOWeekMonday, getWeeklyRanges } = weeklySummaryRouter;

    // Timezone boundary case: Monday, June 15, 2026 at 1:00 AM IST (Asia/Kolkata +05:30)
    // In UTC, this is Sunday, June 14, 2026 at 7:30 PM (2026-06-14T19:30:00.000Z).
    // In a UTC-standardized system, this timestamp belongs to the week starting Monday, June 8, 2026.
    // If it were server-timezone-dependent on an IST server, it would belong to the week starting Monday, June 15, 2026.
    
    const boundaryDate = new Date('2026-06-14T19:30:00.000Z');
    
    const monday = getISOWeekMonday(boundaryDate);
    const ranges = getWeeklyRanges(boundaryDate);
    
    const mondayStr = monday.toISOString().split('T')[0];
    expect(mondayStr).toBe('2026-06-08');
    expect(ranges.startCurrent).toBe('2026-06-08');
    expect(ranges.endCurrent).toBe('2026-06-14');
  });
});
