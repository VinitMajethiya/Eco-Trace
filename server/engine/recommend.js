const db = require('../db/database');
const factors = require('../data/emissionFactors.json');

/**
 * Helper to get user activities over a date range.
 */
function getUserActivities(userId, startDate, endDate) {
  return db.prepare(`
    SELECT category, sub_type, quantity, co2e_kg, activity_date 
    FROM activities 
    WHERE user_id = ? AND activity_date BETWEEN ? AND ?
  `).all(userId, startDate, endDate);
}

/**
 * Computes category totals and top contributor for a given period.
 */
function getPeriodStats(userId, startDate, endDate) {
  const activities = getUserActivities(userId, startDate, endDate);
  
  if (activities.length === 0) {
    return null;
  }

  const categoryTotals = {};
  const subTypeTotals = {};

  activities.forEach(a => {
    categoryTotals[a.category] = (categoryTotals[a.category] || 0) + a.co2e_kg;
    
    if (!subTypeTotals[a.category]) {
      subTypeTotals[a.category] = {};
    }
    subTypeTotals[a.category][a.sub_type] = (subTypeTotals[a.category][a.sub_type] || 0) + a.co2e_kg;
  });

  const totalCO2e = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0);

  // Find top category
  let topCategory = null;
  let maxCatCO2e = -1;
  Object.keys(categoryTotals).forEach(cat => {
    if (categoryTotals[cat] > maxCatCO2e) {
      maxCatCO2e = categoryTotals[cat];
      topCategory = cat;
    }
  });

  // Find top sub_type within top category
  let topSubType = null;
  let maxSubCO2e = -1;
  if (topCategory && subTypeTotals[topCategory]) {
    Object.keys(subTypeTotals[topCategory]).forEach(sub => {
      if (subTypeTotals[topCategory][sub] > maxSubCO2e) {
        maxSubCO2e = subTypeTotals[topCategory][sub];
        topSubType = sub;
      }
    });
  }

  const topCategorySharePct = totalCO2e > 0 ? (maxCatCO2e / totalCO2e) * 100 : 0;

  return {
    totalCO2e,
    categoryTotals,
    topCategory,
    topCategorySharePct: parseFloat(topCategorySharePct.toFixed(1)),
    topSubType,
    activities
  };
}

/**
 * Generates what-if substitution suggestions based on user activities.
 */
function generateWhatIfOptions(topCategory, topSubType, userActivities) {
  const options = [];
  
  // Filter activities for the top category and subtype
  const subTypeLogs = userActivities.filter(a => a.category === topCategory && a.sub_type === topSubType);
  const totalQty = subTypeLogs.reduce((sum, a) => sum + a.quantity, 0);
  const logCount = subTypeLogs.length;
  
  // Default to sensible averages if logs are sparse
  const avgQty = logCount > 0 ? (totalQty / logCount) : 1;
  const weeklyFreq = Math.max(1, Math.min(7, Math.round((logCount / 30) * 7)));

  if (topCategory === 'transport') {
    const origFactor = factors.transport[topSubType]?.factor || 0.192;
    
    if (['car_petrol', 'car_diesel', 'cng_car', 'cab', 'two_wheeler', 'auto_rickshaw', 'commute_car_petrol', 'commute_bike_petrol', 'commute_cng_car', 'commute_cab', 'commute_auto'].includes(topSubType)) {
      const transitType = factors.transport.train.factor < factors.transport.bus.factor ? 'train' : 'bus';
      const transitFactor = factors.transport[transitType].factor;
      
      const swapCount1 = Math.max(1, Math.min(weeklyFreq, 2));
      const saving1 = swapCount1 * 4.33 * avgQty * (origFactor - transitFactor);
      
      options.push({
        id: 'transport_swap_transit',
        description: `swap ${swapCount1} of ${weeklyFreq} weekly ${topSubType} commutes to ${transitType}`,
        estimatedSavingKgPerMonth: parseFloat(saving1.toFixed(1)),
        targetCategory: 'transport'
      });

      const swapCount2 = 1;
      const saving2 = swapCount2 * 4.33 * avgQty * origFactor;
      options.push({
        id: 'transport_swap_bike',
        description: `swap ${swapCount2} of ${weeklyFreq} weekly ${topSubType} commutes to bicycle_walk`,
        estimatedSavingKgPerMonth: parseFloat(saving2.toFixed(1)),
        targetCategory: 'transport'
      });
    } else {
      const swapCount = 1;
      const saving = swapCount * 4.33 * avgQty * origFactor;
      options.push({
        id: 'transport_swap_bike_generic',
        description: `swap ${swapCount} transport trip(s) to bicycle_walk`,
        estimatedSavingKgPerMonth: parseFloat(saving.toFixed(1)),
        targetCategory: 'transport'
      });
    }
  } else if (topCategory === 'energy') {
    const origFactor = factors.energy[topSubType]?.factor || 0.71;
    const currentQty = totalQty > 0 ? totalQty : 150;
    
    const saving15 = currentQty * 0.15 * origFactor;
    options.push({
      id: 'energy_reduce_15',
      description: `reduce your ${topSubType} usage by 15%`,
      estimatedSavingKgPerMonth: parseFloat(saving15.toFixed(1)),
      targetCategory: 'energy'
    });

    const saving10 = currentQty * 0.10 * origFactor;
    options.push({
      id: 'energy_reduce_10',
      description: `reduce your ${topSubType} usage by 10%`,
      estimatedSavingKgPerMonth: parseFloat(saving10.toFixed(1)),
      targetCategory: 'energy'
    });
  } else if (topCategory === 'food') {
    if (topSubType === 'beef_meal') {
      const factorDiff = factors.food.beef_meal.factor - factors.food.chicken_meal.factor;
      const swapCount = Math.max(1, Math.min(weeklyFreq, 2));
      const saving = swapCount * 4.33 * factorDiff;
      options.push({
        id: 'food_beef_to_chicken',
        description: `swap ${swapCount} weekly beef_meal(s) to chicken_meal`,
        estimatedSavingKgPerMonth: parseFloat(saving.toFixed(1)),
        targetCategory: 'food'
      });

      const factorDiff2 = factors.food.beef_meal.factor - factors.food.vegetarian_meal.factor;
      const swapCount2 = Math.max(1, Math.min(weeklyFreq, 3));
      const saving2 = swapCount2 * 4.33 * factorDiff2;
      options.push({
        id: 'food_beef_to_vegetarian',
        description: `swap ${swapCount2} weekly beef_meal(s) to vegetarian_meal`,
        estimatedSavingKgPerMonth: parseFloat(saving2.toFixed(1)),
        targetCategory: 'food'
      });
    } else if (topSubType === 'chicken_meal') {
      const factorDiff = factors.food.chicken_meal.factor - factors.food.vegetarian_meal.factor;
      const swapCount = Math.max(1, Math.min(weeklyFreq, 2));
      const saving = swapCount * 4.33 * factorDiff;
      options.push({
        id: 'food_chicken_to_vegetarian',
        description: `swap ${swapCount} weekly chicken_meal(s) to vegetarian_meal`,
        estimatedSavingKgPerMonth: parseFloat(saving.toFixed(1)),
        targetCategory: 'food'
      });

      const factorDiff2 = factors.food.chicken_meal.factor - factors.food.vegan_meal.factor;
      const swapCount2 = Math.max(1, Math.min(weeklyFreq, 3));
      const saving2 = swapCount2 * 4.33 * factorDiff2;
      options.push({
        id: 'food_chicken_to_vegan',
        description: `swap ${swapCount2} weekly chicken_meal(s) to vegan_meal`,
        estimatedSavingKgPerMonth: parseFloat(saving2.toFixed(1)),
        targetCategory: 'food'
      });
    } else if (topSubType === 'vegetarian_meal') {
      const factorDiff = factors.food.vegetarian_meal.factor - factors.food.vegan_meal.factor;
      const swapCount = Math.max(1, Math.min(weeklyFreq, 3));
      const saving = swapCount * 4.33 * factorDiff;
      options.push({
        id: 'food_vegetarian_to_vegan',
        description: `swap ${swapCount} weekly vegetarian_meal(s) to vegan_meal`,
        estimatedSavingKgPerMonth: parseFloat(saving.toFixed(1)),
        targetCategory: 'food'
      });
    } else {
      options.push({
        id: 'food_maintain_vegan',
        description: `maintain your low-impact vegan diet and share plant-based recipes with friends`,
        estimatedSavingKgPerMonth: 0,
        targetCategory: 'food'
      });
    }
  } else if (topCategory === 'consumption') {
    if (topSubType === 'fast_fashion_item') {
      const origFactor = factors.consumption.fast_fashion_item.factor;
      options.push({
        id: 'consumption_fewer_fashion',
        description: `buy 1 fewer fast_fashion_item this month`,
        estimatedSavingKgPerMonth: origFactor,
        targetCategory: 'consumption'
      });
      options.push({
        id: 'consumption_thrift_fashion',
        description: `choose thrifted or second-hand alternatives for fast_fashion_item purchases`,
        estimatedSavingKgPerMonth: parseFloat((origFactor * 0.7).toFixed(1)),
        targetCategory: 'consumption'
      });
    } else if (topSubType === 'electronics_item') {
      const origFactor = factors.consumption.electronics_item.factor;
      options.push({
        id: 'consumption_repair_electronics',
        description: `avoid buying a new electronics_item this month by repairing or extending device life`,
        estimatedSavingKgPerMonth: origFactor,
        targetCategory: 'consumption'
      });
    } else {
      const origFactor = factors.consumption.general_waste_kg.factor;
      const currentWasteQty = totalQty > 0 ? totalQty : 10;
      options.push({
        id: 'consumption_reduce_waste_20',
        description: `reduce general_waste_kg by 20% through composting and recycling`,
        estimatedSavingKgPerMonth: parseFloat((currentWasteQty * 0.2 * origFactor).toFixed(1)),
        targetCategory: 'consumption'
      });
    }
  }

  return options.slice(0, 2);
}

/**
 * Checks trigger conditions T1, T2, T3, T4.
 */
function shouldTriggerNewRecommendation(userId, forceRefresh = false) {
  if (forceRefresh) return true;

  // Check activity count (T1 requires >= 5 total logs)
  const activityCountRow = db.prepare('SELECT COUNT(*) as count FROM activities WHERE user_id = ?').get(userId);
  const totalLogs = activityCountRow ? activityCountRow.count : 0;
  if (totalLogs < 5) return false;

  // Get most recent recommendation
  const lastRec = db.prepare(`
    SELECT top_category, generated_at, is_stale
    FROM recommendations 
    WHERE user_id = ? 
    ORDER BY generated_at DESC LIMIT 1
  `).get(userId);

  // If no recommendation exists yet, trigger it (T1)
  if (!lastRec) return true;

  // If recommendation is flagged as stale (soft invalidation), regenerate immediately
  if (Number(lastRec.is_stale) === 1) return true;

  // Get current period date bounds
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const startOfMonth = `${year}-${month}-01`;
  const todayStr = now.toISOString().split('T')[0];

  // Get current top category
  const stats = getPeriodStats(userId, startOfMonth, todayStr);
  if (!stats) return false;

  // T2: Top category differs from last recommendation
  if (stats.topCategory !== lastRec.top_category) return true;

  // T3: >= 7 days elapsed since last recommendation
  const lastGenDate = new Date(lastRec.generated_at);
  const diffTime = Math.abs(now - lastGenDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays >= 7) return true;

  return false;
}

/**
 * Fallback rule-based recommendation generator.
 */
function generateFallbackRecommendation(statsContext) {
  const { topCategory, topCategorySharePct, topSubType, whatIfOptions } = statsContext;

  const displayCategory = topCategory.charAt(0).toUpperCase() + topCategory.slice(1);
  const displaySubType = topSubType.replace('_', ' ');

  const summary = `${displayCategory} makes up ${topCategorySharePct}% of your footprint this month, mostly from ${displaySubType}. Here's a realistic next step:`;

  const actions = whatIfOptions.map((opt, index) => ({
    rank: index + 1,
    action_text: `Try: ${opt.description}`,
    estimated_saving_kg: opt.estimatedSavingKgPerMonth,
    target_category: opt.targetCategory
  }));

  return {
    summary,
    actions,
    source: 'fallback'
  };
}

module.exports = {
  getPeriodStats,
  generateWhatIfOptions,
  shouldTriggerNewRecommendation,
  generateFallbackRecommendation
};
