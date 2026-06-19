process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const db = require('../db/database');
const runMigrations = require('../db/migrationRunner');
const calculate = require('../engine/calculate');

async function runTest() {
  console.log('--- STARTING MANUAL DASHBOARD MATH TEST ---');
  
  // 1. Initialize in-memory DB and migrate
  runMigrations();

  // 2. Create user with city mumbai
  const userRes = db.prepare(`
    INSERT INTO users (name, email, password_hash, household_size, city)
    VALUES (?, ?, ?, ?, ?)
  `).run('MathUser', 'math@test.com', 'hash', 2, 'mumbai');
  const userId = userRes.lastInsertRowid;
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
  logs.forEach(log => {
    const calcResult = calculate.calculateCO2e(log.category, log.sub_type, log.quantity);
    console.log(`  - ${log.category} -> ${log.sub_type} (${log.quantity}): calculated CO2e: ${calcResult.co2e_kg} kg`);
    
    const actRes = db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, log.category, log.sub_type, log.quantity, calcResult.unit, calcResult.co2e_kg, todayStr);
    
    insertedLogs.push({
      id: actRes.lastInsertRowid,
      category: log.category,
      co2e_kg: calcResult.co2e_kg
    });
  });

  // 4. Mimic GET /api/dashboard/summary logic for current month
  console.log('\nSimulating GET /api/dashboard/summary for current month:');
  
  // Fetch from DB
  const startCurrent = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const endCurrent = todayStr;
  
  const currentActivities = db.prepare(`
    SELECT category, COALESCE(SUM(co2e_kg), 0) as total
    FROM activities
    WHERE user_id = ? AND activity_date BETWEEN ? AND ?
    GROUP BY category
  `).all(userId, startCurrent, endCurrent);

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

  // 5. Hand Calculations:
  // transport = 120 * 0.192 = 23.04
  // energy = 85 * 0.71 = 60.35
  // food = 4 * 6.0 = 24
  // consumption = 2 * 8 = 16
  // Total = 123.39
  // Shares:
  // transport: 23.04 / 123.39 = 18.6725% -> 18.7%
  // energy: 60.35 / 123.39 = 48.9099% -> 48.9%
  // food: 24.0 / 123.39 = 19.4505% -> 19.5%
  // consumption: 16.0 / 123.39 = 12.9670% -> 13.0%
  
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
  
  db.close();
}

runTest();
