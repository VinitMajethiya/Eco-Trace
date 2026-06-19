process.env.GEMINI_API_KEY = 'mock-api-key';

const { generateRecommendation } = require('../services/llmClient');

describe('LLM Recommendation Cross-Validation & Shuffle Mapping', () => {
  let originalFetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('correctly maps shuffled LLM actions to correct precomputed savings via optionId', async () => {
    const statsContext = {
      topCategory: 'transport',
      topCategorySharePct: 75.5,
      topSubType: 'car_petrol',
      whatIfOptions: [
        { id: 'transport_swap_transit', description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 15.0, targetCategory: 'transport' },
        { id: 'transport_swap_bike', description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 19.1, targetCategory: 'transport' }
      ]
    };

    // Shuffled response: bike is first, transit is second (swapped order relative to whatIfOptions)
    const mockLlmResponse = {
      summary: "This is a supportive summary.",
      actions: [
        {
          optionId: "transport_swap_bike",
          text: "Try walking or cycling to save emissions."
        },
        {
          optionId: "transport_swap_transit",
          text: "Consider switching to city transit options."
        }
      ]
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockLlmResponse) }]
            }
          }]
        })
      })
    );

    const result = await generateRecommendation('Aman', statsContext);

    expect(result.source).toBe('llm');
    expect(result.summary).toBe("This is a supportive summary.");
    expect(result.actions).toHaveLength(2);

    // Verify Rank 1 (which was optionId transport_swap_bike) got the correct saving (19.1)
    expect(result.actions[0].rank).toBe(1);
    expect(result.actions[0].action_text).toBe("Try walking or cycling to save emissions.");
    expect(result.actions[0].estimated_saving_kg).toBe(19.1);

    // Verify Rank 2 (which was optionId transport_swap_transit) got the correct saving (15.0)
    expect(result.actions[1].rank).toBe(2);
    expect(result.actions[1].action_text).toBe("Consider switching to city transit options.");
    expect(result.actions[1].estimated_saving_kg).toBe(15.0);
  });

  test('handles duplicate optionIds in LLM response and backfills to expected length', async () => {
    const statsContext = {
      topCategory: 'transport',
      topCategorySharePct: 75.5,
      topSubType: 'car_petrol',
      whatIfOptions: [
        { id: 'transport_swap_transit', description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 15.0, targetCategory: 'transport' },
        { id: 'transport_swap_bike', description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 19.1, targetCategory: 'transport' },
        { id: 'transport_swap_carpool', description: 'carpool with a neighbor', estimatedSavingKgPerMonth: 8.5, targetCategory: 'transport' }
      ]
    };

    const mockLlmResponse = {
      summary: "Supportive summary.",
      actions: [
        {
          optionId: "transport_swap_transit",
          text: "Consider switching to city transit options."
        },
        {
          optionId: "transport_swap_transit",
          text: "Take the bus instead of driving."
        }
      ]
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockLlmResponse) }]
            }
          }]
        })
      })
    );

    const result = await generateRecommendation('Aman', statsContext);

    expect(result.source).toBe('llm');
    expect(result.actions).toHaveLength(3);

    // Verify Rank 1 (from LLM)
    expect(result.actions[0].rank).toBe(1);
    expect(result.actions[0].action_text).toBe("Consider switching to city transit options.");
    expect(result.actions[0].estimated_saving_kg).toBe(15.0);

    // Verify Rank 2 (backfilled from remaining options - bike)
    expect(result.actions[1].rank).toBe(2);
    expect(result.actions[1].action_text).toBe("Try: swap 1 weekly commute to walk");
    expect(result.actions[1].estimated_saving_kg).toBe(19.1);

    // Verify Rank 3 (backfilled from remaining options - carpool)
    expect(result.actions[2].rank).toBe(3);
    expect(result.actions[2].action_text).toBe("Try: carpool with a neighbor");
    expect(result.actions[2].estimated_saving_kg).toBe(8.5);
  });

  test('handles combined edge cases (duplicate + unrecognized + valid) robustly and backfills', async () => {
    const statsContext = {
      topCategory: 'transport',
      topCategorySharePct: 75.5,
      topSubType: 'car_petrol',
      whatIfOptions: [
        { id: 'transport_swap_transit', description: 'swap 2 weekly commutes to bus', estimatedSavingKgPerMonth: 15.0, targetCategory: 'transport' },
        { id: 'transport_swap_bike', description: 'swap 1 weekly commute to walk', estimatedSavingKgPerMonth: 19.1, targetCategory: 'transport' },
        { id: 'transport_swap_carpool', description: 'carpool with a neighbor', estimatedSavingKgPerMonth: 8.5, targetCategory: 'transport' }
      ]
    };

    const mockLlmResponse = {
      summary: "Supportive summary.",
      actions: [
        {
          optionId: "transport_swap_transit",
          text: "Consider switching to city transit options."
        },
        {
          optionId: "unrecognized_id",
          text: "Fly to work in a jetpack."
        },
        {
          optionId: "transport_swap_transit",
          text: "Take the bus instead of driving."
        }
      ]
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockLlmResponse) }]
            }
          }]
        })
      })
    );

    const result = await generateRecommendation('Aman', statsContext);

    expect(result.source).toBe('llm');
    expect(result.actions).toHaveLength(3);

    // Verify Rank 1 (from LLM)
    expect(result.actions[0].rank).toBe(1);
    expect(result.actions[0].action_text).toBe("Consider switching to city transit options.");
    expect(result.actions[0].estimated_saving_kg).toBe(15.0);

    // Verify Rank 2 (backfilled from remaining options - bike)
    expect(result.actions[1].rank).toBe(2);
    expect(result.actions[1].action_text).toBe("Try: swap 1 weekly commute to walk");
    expect(result.actions[1].estimated_saving_kg).toBe(19.1);

    // Verify Rank 3 (backfilled from remaining options - carpool)
    expect(result.actions[2].rank).toBe(3);
    expect(result.actions[2].action_text).toBe("Try: carpool with a neighbor");
    expect(result.actions[2].estimated_saving_kg).toBe(8.5);
  });
});

