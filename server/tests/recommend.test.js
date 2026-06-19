process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const { getPeriodStats, generateWhatIfOptions, generateFallbackRecommendation } = require('../engine/recommend');

describe('Recommendation Logic & Aggregation', () => {
  let userId;

  beforeAll(() => {
    // Run migrations on in-memory DB
    runMigrations();

    // Create a test user
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `);
    const result = insertUser.run('TestUser', 'test@example.com', 'hash');
    userId = result.lastInsertRowid;
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM activities').run();
  });

  test('aggregates period statistics correctly', () => {
    // Insert logs in transport (car_petrol) and food (beef_meal)
    const insertAct = db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 10km car_petrol (factor 0.192 => 1.92 kg)
    insertAct.run(userId, 'transport', 'car_petrol', 10, 'km', 1.92, '2026-06-10');
    // 20km car_petrol (factor 0.192 => 3.84 kg)
    insertAct.run(userId, 'transport', 'car_petrol', 20, 'km', 3.84, '2026-06-12');
    // 1 beef meal (factor 6.0 => 6.0 kg)
    insertAct.run(userId, 'food', 'beef_meal', 1, 'meal', 6.00, '2026-06-14');

    const stats = getPeriodStats(userId, '2026-06-01', '2026-06-30');
    expect(stats).not.toBeNull();
    expect(stats.totalCO2e).toBeCloseTo(11.76);
    expect(stats.topCategory).toBe('food'); // food is 6.0, transport is 5.76
    expect(stats.topCategorySharePct).toBeCloseTo(51.0);
    expect(stats.topSubType).toBe('beef_meal');
  });

  test('generates transport what-if suggestions correctly', () => {
    // Insert 4 petrol car commutes in the last month
    const insertAct = db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Average 25km commute
    for (let i = 1; i <= 4; i++) {
      insertAct.run(userId, 'transport', 'car_petrol', 25, 'km', 4.8, `2026-06-0${i}`);
    }

    const activities = db.prepare('SELECT * FROM activities WHERE user_id = ?').all(userId);
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
