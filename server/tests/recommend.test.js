process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const { getPeriodStats, generateWhatIfOptions, generateFallbackRecommendation } = require('../engine/recommend');

describe('Recommendation Logic & Aggregation', () => {
  let userId;

  beforeAll(async () => {
    // Run migrations
    await runMigrations();

    // Clear tables
    await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create a test user
    const result = await db.query(`
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['TestUser', 'test@example.com', 'hash']);
    userId = result.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM activities');
  });

  test('aggregates period statistics correctly', async () => {
    // Insert logs in transport (car_petrol) and food (beef_meal)
    const insertActSql = `
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    // 10km car_petrol (factor 0.192 => 1.92 kg)
    await db.query(insertActSql, [userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-10']);
    // 20km car_petrol (factor 0.192 => 3.84 kg)
    await db.query(insertActSql, [userId, 'transport', 'car_petrol', 20, 'km', 3.84, '2026-06-12']);
    // 1 beef meal (factor 6.0 => 6.0 kg)
    await db.query(insertActSql, [userId, 'food', 'beef_meal', 1, 'meal', 6.00, '2026-06-14']);

    const stats = await getPeriodStats(userId, '2026-06-01', '2026-06-30');
    expect(stats).not.toBeNull();
    expect(stats.totalCO2e).toBeCloseTo(11.76);
    expect(stats.topCategory).toBe('food'); // food is 6.0, transport is 5.76
    expect(stats.topCategorySharePct).toBeCloseTo(51.0);
    expect(stats.topSubType).toBe('beef_meal');
  });

  test('generates transport what-if suggestions correctly', async () => {
    // Insert 4 petrol car commutes in the last month
    const insertActSql = `
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    // Average 25km commute
    for (let i = 1; i <= 4; i++) {
      await db.query(insertActSql, [userId, 'transport', 'car_petrol', 25, 'km', 4.8, `2026-06-0${i}`]);
    }

    const activitiesResult = await db.query('SELECT * FROM activities WHERE user_id = $1', [userId]);
    const activities = activitiesResult.rows;
    const options = generateWhatIfOptions('transport', 'car_petrol', activities);

    expect(options.length).toBe(2);
    // Option 1 should suggest swapping to bus/train
    expect(options[0].description).toContain('commutes to');
    expect(options[0].estimatedSavingKgPerMonth).toBeGreaterThan(0);
    expect(options[0].targetCategory).toBe('transport');

    // Option 2 should suggest swapping to bicycle_walk
    expect(options[1].description).toContain('bicycle_walk');
    expect(options[1].estimatedSavingKgPerMonth).toBeGreaterThan(0);
  });

  test('creates rule-based fallback recommendation correctly', () => {
    const statsContext = {
      topCategory: 'transport',
      topCategorySharePct: 62.5,
      topSubType: 'car_petrol',
      whatIfOptions: [
        { description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 12.4, targetCategory: 'transport' },
        { description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 6.2, targetCategory: 'transport' }
      ]
    };

    const rec = generateFallbackRecommendation(statsContext);
    expect(rec.source).toBe('fallback');
    expect(rec.summary).toContain('Transport makes up 62.5% of your footprint');
    expect(rec.summary).toContain('car petrol');
    expect(rec.actions.length).toBe(2);
    expect(rec.actions[0].action_text).toBe('Try: swap 2 weekly commutes to bus');
    expect(rec.actions[0].estimated_saving_kg).toBe(12.4);
    expect(rec.actions[0].target_category).toBe('transport');
  });
});
