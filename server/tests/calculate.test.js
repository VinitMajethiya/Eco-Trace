const { calculateCO2e } = require('../engine/calculate');

describe('Calculation Engine', () => {
  test('calculates transport emissions correctly', () => {
    // car_petrol factor is 0.192. 10 km should be 1.92 kg CO2e
    const result = calculateCO2e('transport', 'car_petrol', 10);
    expect(result.co2e_kg).toBeCloseTo(1.92);
    expect(result.unit).toBe('km');

    // cng_car factor is 0.144. 10 km should be 1.44 kg CO2e
    const resultCng = calculateCO2e('transport', 'cng_car', 10);
    expect(resultCng.co2e_kg).toBeCloseTo(1.44);

    // auto_rickshaw factor is 0.08. 10 km should be 0.8 kg CO2e
    const resultAuto = calculateCO2e('transport', 'auto_rickshaw', 10);
    expect(resultAuto.co2e_kg).toBeCloseTo(0.80);

    // cab factor is 0.192. 10 km should be 1.92 kg CO2e
    const resultCab = calculateCO2e('transport', 'cab', 10);
    expect(resultCab.co2e_kg).toBeCloseTo(1.92);
  });

  test('calculates food emissions correctly', () => {
    // beef_meal factor is 6.0. 3 meals should be 18 kg CO2e
    const result = calculateCO2e('food', 'beef_meal', 3);
    expect(result.co2e_kg).toBe(18.0);
    expect(result.unit).toBe('meal');
  });

  test('throws error on invalid category', () => {
    expect(() => {
      calculateCO2e('invalid_category', 'car_petrol', 10);
    }).toThrow("Invalid category: 'invalid_category'");
  });

  test('throws error on invalid sub_type', () => {
    expect(() => {
      calculateCO2e('transport', 'spaceshuttle', 10);
    }).toThrow("Invalid sub-type 'spaceshuttle' for category 'transport'");
  });

  test('throws error for boundary checks (quantity <= 0)', () => {
    expect(() => {
      calculateCO2e('transport', 'car_petrol', 0);
    }).toThrow("Quantity must be greater than 0");

    expect(() => {
      calculateCO2e('transport', 'car_petrol', -5);
    }).toThrow("Quantity must be greater than 0");
  });

  test('throws error for boundary checks (quantity >= 100000)', () => {
    expect(() => {
      calculateCO2e('transport', 'car_petrol', 100000);
    }).toThrow("Quantity must be less than 100,000");

    expect(() => {
      calculateCO2e('transport', 'car_petrol', 105000);
    }).toThrow("Quantity must be less than 100,000");
  });

  test('throws error for non-numeric quantities', () => {
    expect(() => {
      calculateCO2e('transport', 'car_petrol', 'ten');
    }).toThrow("Quantity must be a valid number");

    expect(() => {
      calculateCO2e('transport', 'car_petrol', NaN);
    }).toThrow("Quantity must be a valid number");
  });
});
