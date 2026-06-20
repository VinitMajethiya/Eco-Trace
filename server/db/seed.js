const bcrypt = require('bcryptjs');
const db = require('./database');
const migrate = require('./migrationRunner');
const factors = require('../data/emissionFactors.json');

async function seed() {
  console.log('Seeding database...');
  // Ensure tables exist
  await migrate();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data and restart identity sequences
    await client.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

    // Create Aman (Primary Persona)
    const salt = bcrypt.genSaltSync(12);
    const passwordHash = bcrypt.hashSync('password123', salt);
    
    const userResult = await client.query(`
      INSERT INTO users (name, email, password_hash, household_size, default_commute_mode, default_diet)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      'Aman',
      'aman@ecotrace.com',
      passwordHash,
      2, // Household of 2
      'car_petrol',
      'omnivore'
    ]);
    const userId = userResult.rows[0].id;
    console.log(`Created seed user Aman with ID ${userId}`);

    // Create Competitive Priya (Secondary Persona)
    const priyaHash = bcrypt.hashSync('priya123', salt);
    const priyaResult = await client.query(`
      INSERT INTO users (name, email, password_hash, household_size, default_commute_mode, default_diet)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      'Priya',
      'priya@ecotrace.com',
      priyaHash,
      1,
      'two_wheeler',
      'vegetarian'
    ]);
    console.log(`Created seed user Priya with ID ${priyaResult.rows[0].id}`);

    // Log activities for Aman over the last 30 days
    const insertActivitySql = `
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const today = new Date();
    
    // Helper to format date as YYYY-MM-DD
    const formatDate = (dateObj) => dateObj.toISOString().split('T')[0];

    // Commits a variety of activities
    // 1. Transport Commutes: 5 days/week commuting, mostly by petrol car, some train
    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = formatDate(date);
      const dayOfWeek = date.getDay();

      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Weekdays
        // Normal commute: 25 km by car_petrol
        const factor = factors.transport.car_petrol.factor;
        const qty = 25;
        await client.query(insertActivitySql, [userId, 'transport', 'car_petrol', qty, 'km', qty * factor, dateStr]);
      } else { // Weekends
        // Weekend trip: 10 km by two_wheeler
        const factor = factors.transport.two_wheeler.factor;
        const qty = 15;
        await client.query(insertActivitySql, [userId, 'transport', 'two_wheeler', qty, 'km', qty * factor, dateStr]);
      }

      // 2. Food: 3 meals logged per day
      // Breakfast: Vegetarian, Lunch: chicken or beef, Dinner: veggie/vegan
      const vegFactor = factors.food.vegetarian_meal.factor;
      const veganFactor = factors.food.vegan_meal.factor;
      await client.query(insertActivitySql, [userId, 'food', 'vegetarian_meal', 1, 'meal', vegFactor, dateStr]);
      await client.query(insertActivitySql, [userId, 'food', 'vegan_meal', 1, 'meal', veganFactor, dateStr]);

      if (dayOfWeek === 2 || dayOfWeek === 5) { // Tuesday & Friday beef
        const beefFactor = factors.food.beef_meal.factor;
        await client.query(insertActivitySql, [userId, 'food', 'beef_meal', 1, 'meal', beefFactor, dateStr]);
      } else if (dayOfWeek === 0 || dayOfWeek === 4) { // Chicken meals
        const chickenFactor = factors.food.chicken_meal.factor;
        await client.query(insertActivitySql, [userId, 'food', 'chicken_meal', 1, 'meal', chickenFactor, dateStr]);
      } else {
        await client.query(insertActivitySql, [userId, 'food', 'vegetarian_meal', 1, 'meal', vegFactor, dateStr]);
      }

      // 3. Home Energy: Logged weekly on Sundays
      if (dayOfWeek === 0) {
        // Electricity: 40 kWh for the week
        const elecFactor = factors.energy.electricity_grid.factor;
        const elecQty = 40;
        await client.query(insertActivitySql, [userId, 'energy', 'electricity_grid', elecQty, 'kWh', elecQty * elecFactor, dateStr]);

        // LPG: 2 kg used for cooking
        const lpgFactor = factors.energy.lpg_cooking.factor;
        const lpgQty = 2.5;
        await client.query(insertActivitySql, [userId, 'energy', 'lpg_cooking', lpgQty, 'kg', lpgQty * lpgFactor, dateStr]);
      }

      // 4. Consumption: Occasional fast fashion and waste
      if (i === 25) {
        const factor = factors.consumption.fast_fashion_item.factor;
        await client.query(insertActivitySql, [userId, 'consumption', 'fast_fashion_item', 2, 'item', 2 * factor, dateStr]);
      }
      if (i === 12) {
        const factor = factors.consumption.electronics_item.factor;
        await client.query(insertActivitySql, [userId, 'consumption', 'electronics_item', 1, 'item', 1 * factor, dateStr]);
      }
      if (dayOfWeek === 6) { // Every Saturday log waste
        const factor = factors.consumption.general_waste_kg.factor;
        const qty = 8;
        await client.query(insertActivitySql, [userId, 'consumption', 'general_waste_kg', qty, 'kg', qty * factor, dateStr]);
      }
    }
    
    await client.query('COMMIT');
    console.log('Successfully seeded database with activities.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed database:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed().then(() => {
    console.log('Seed completed successfully.');
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = seed;
