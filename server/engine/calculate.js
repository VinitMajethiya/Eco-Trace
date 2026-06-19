const factors = require('../data/emissionFactors.json');

/**
 * Calculates CO2e emissions in kg for a given category, sub_type and quantity.
 * Throws errors for validation failures (e.g. invalid type or bounds).
 * 
 * @param {string} category 
 * @param {string} subType 
 * @param {number} quantity 
 * @returns {{ co2e_kg: number, unit: string }}
 */
function calculateCO2e(category, subType, quantity) {
  if (!factors[category]) {
    throw new Error(`Invalid category: '${category}'. Must be one of: ${Object.keys(factors).join(', ')}`);
  }

  const subTypeData = factors[category][subType];
  if (!subTypeData) {
    throw new Error(`Invalid sub-type '${subType}' for category '${category}'`);
  }

  if (typeof quantity !== 'number' || isNaN(quantity)) {
    throw new Error(`Quantity must be a valid number`);
  }

  // Bound checks: quantity must be > 0 and < 100000
  if (quantity <= 0) {
    throw new Error(`Quantity must be greater than 0`);
  }
  if (quantity >= 100000) {
    throw new Error(`Quantity must be less than 100,000`);
  }

  const co2e_kg = quantity * subTypeData.factor;
  
  return {
    co2e_kg,
    unit: subTypeData.unit
  };
}

module.exports = {
  calculateCO2e
};
