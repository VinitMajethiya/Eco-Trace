const { generateRecommendation } = require('../services/llmClient');
const { generateWeeklySummary } = require('../services/weeklySummaryClient');

// Mock global fetch to hang forever
global.fetch = () => new Promise(() => {});

// Force GEMINI_API_KEY to be set so it tries the API path
process.env.GEMINI_API_KEY = 'mock-key';

const statsContext = {
  topCategory: 'transport',
  topCategorySharePct: 75.5,
  topSubType: 'car_petrol',
  whatIfOptions: [
    { id: 'transport_swap_transit', description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 12.4, targetCategory: 'transport' },
    { id: 'transport_swap_bike', description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 6.2, targetCategory: 'transport' }
  ]
};

async function testTimeoutAndLeak() {
  console.log('--- STARTING TIMEOUT & LEAK TEST ---');
  
  // Measure single execution wall-clock time
  const start = Date.now();
  const res = await generateRecommendation('Aman', statsContext);
  const duration = Date.now() - start;
  console.log(`Recommendation fallback returned in ${duration}ms (Expected: ~8000ms)`);
  console.log(`Returned Source: ${res.source}`);

  // Run in a loop of 5 times (reduced from 10 to speed up execution slightly, while still showing leaks if present)
  console.log('\nRunning in a loop of 5 times to check handle leak...');
  for (let i = 0; i < 5; i++) {
    const loopStart = Date.now();
    await generateRecommendation('Aman', statsContext);
    console.log(`  Iteration ${i+1} completed in ${Date.now() - loopStart}ms`);
  }

  // Get active handles to confirm no dangling timers
  const activeHandles = process._getActiveHandles ? process._getActiveHandles() : [];
  // Filter for active handles that could represent timers/sockets
  const handleTypes = activeHandles.map(h => h.constructor ? h.constructor.name : 'Unknown');
  console.log(`Active handle types: ${JSON.stringify(handleTypes)}`);
  
  // We can check if any timers are still running.
  // When the script runs, only the current execution context or things like standard streams should remain.
  console.log(`Active handles count: ${activeHandles.length}`);
}

testTimeoutAndLeak();
