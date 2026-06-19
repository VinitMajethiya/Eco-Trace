const { generateRecommendation } = require('../services/llmClient');

async function testFallback() {
  console.log('--- TESTING RECOMMENDATION FALLBACK LOGIC ---');
  
  const statsContext = {
    topCategory: 'transport',
    topCategorySharePct: 75.5,
    topSubType: 'car_petrol',
    whatIfOptions: [
      { description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 12.4, targetCategory: 'transport' },
      { description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 6.2, targetCategory: 'transport' }
    ]
  };

  // 1. Test when API key is missing
  console.log('\nCase 1: GEMINI_API_KEY is missing/empty');
  delete process.env.GEMINI_API_KEY;
  let plan = await generateRecommendation('Aman', statsContext);
  console.log('Returned Source:', plan.source);
  console.log('Returned Summary:', plan.summary);
  console.log('Returned Actions:', JSON.stringify(plan.actions, null, 2));
  
  if (plan.source === 'fallback' && plan.actions.length === 2) {
    console.log('✓ Case 1 passed!');
  } else {
    console.error('✗ Case 1 failed!');
  }

  // 2. Test when API key is invalid (triggers fetch failure caught in try-catch)
  console.log('\nCase 2: GEMINI_API_KEY is invalid (fetching returns error status)');
  process.env.GEMINI_API_KEY = 'INVALID_KEY_HERE';
  plan = await generateRecommendation('Aman', statsContext);
  console.log('Returned Source:', plan.source);
  console.log('Returned Summary:', plan.summary);
  console.log('Returned Actions:', JSON.stringify(plan.actions, null, 2));

  if (plan.source === 'fallback') {
    console.log('✓ Case 2 passed!');
  } else {
    console.error('✗ Case 2 failed!');
  }
}

testFallback();
