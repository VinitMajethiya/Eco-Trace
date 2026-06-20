process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const calculate = require('../engine/calculate');

async function runTest() {
  console.log('--- STARTING MANUAL DASHBOARD MATH TEST ---');
  
  // 1. Initialize DB and migrate
  await runMigrations();

  // Truncate tables first
  await db.query('TRUNCATE TABLE users, activities, recommendations, action_items, commitments, weekly_summaries RESTART IDENTITY CASCADE');

  // 2. Create user with city mumbai
  const userRes = await db.query(`
    INSERT INTO users (name, email, password_hash, household_size, city)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, ['MathUser', 'math@test.com', 'hash', 2, 'mumbai']);
  const userId = userRes.rows[0].id;
  console.log(`User created with ID: ${userId}`);

  // 3. Log activities
  const todayStr = new Date().toISOString().split('T')[0];
  const logs = [
    { category: 'transport', sub_type: 'car_petrol', quantity: 120 },
    { category: 'energy', sub_type: 'electricity_grid', quantity: 85 },
    { category: 'food', sub_type: 'beef_meal', quantity: 4 },
    { category: 'consumption', sub_type: 'fast_fashion_item', quantity: 2 }
  ];

  console.log('\nLogging activities and verifying individual CO2e calculations:');
  const insertedLogs = [];
  
  for (const log of logs) {
    const calcResult = calculate.calculateCO2e(log.category, log.sub_type, log.quantity);
    console.log(`  - ${log.category} -> ${log.sub_type} (${log.quantity}): calculated CO2e: ${calcResult.co2e_kg} kg`);
    
    const actRes = await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [userId, log.category, log.sub_type, log.quantity, calcResult.unit, calcResult.co2e_kg, todayStr]);
    
    insertedLogs.push({
      id: actRes.rows[0].id,
      category: log.category,
      co2e_kg: calcResult.co2e_kg
    });
  }

  // 4. Simulating dashboard aggregation logic
  console.log('\nSimulating GET /api/dashboard/summary for current month:');
  
  const startCurrent = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const endCurrent = todayStr;
  
  const currentActivitiesResult = await db.query(`
    SELECT category, CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
    FROM activities
    WHERE user_id = $1 AND activity_date BETWEEN $2::date AND $3::date
    GROUP BY category
  `, [userId, startCurrent, endCurrent]);
  const currentActivities = currentActivitiesResult.rows;

  const categories = { transport: 0, energy: 0, food: 0, consumption: 0 };
  let currentTotal = 0;
  
  currentActivities.forEach(act => {
    categories[act.category] = parseFloat(act.total.toFixed(2));
    currentTotal += act.total;
  });
  currentTotal = parseFloat(currentTotal.toFixed(2));

  const categoryBreakdown = Object.keys(categories).map(cat => {
    const share = currentTotal > 0 ? (categories[cat] / currentTotal) * 100 : 0;
    return {
      category: cat,
      co2e_kg: categories[cat],
      percentage: parseFloat(share.toFixed(1))
    };
  });

  console.log(`Computed Current Total: ${currentTotal} kg`);
  console.log('Category Breakdown:');
  console.log(JSON.stringify(categoryBreakdown, null, 2));
  
  const expectedTotal = 123.39;
  const expectedShares = {
    transport: 18.7,
    energy: 48.9,
    food: 19.5,
    consumption: 13.0
  };

  let mathMatches = true;
  if (Math.abs(currentTotal - expectedTotal) > 0.001) {
    console.error(`✗ Total CO2e mismatch! Expected ${expectedTotal}, got ${currentTotal}`);
    mathMatches = false;
  } else {
    console.log('✓ Total CO2e matches expected value of 123.39!');
  }

  categoryBreakdown.forEach(item => {
    const expected = expectedShares[item.category];
    if (Math.abs(item.percentage - expected) > 0.001) {
      console.error(`✗ Percentage mismatch for ${item.category}! Expected ${expected}%, got ${item.percentage}%`);
      mathMatches = false;
    } else {
      console.log(`✓ Percentage for ${item.category} matches expected value of ${expected}%!`);
    }
  });

  if (mathMatches) {
    console.log('\n✓ ALL HAND-CALCULATIONS MATCH LIVE DATABASE LOGS PERFECTLY!');
  } else {
    console.error('\n✗ MANUAL MATH TEST FAILED DUE TO MISMATCHES!');
  }
  
  await db.close();
}

runTest().catch(console.error);
