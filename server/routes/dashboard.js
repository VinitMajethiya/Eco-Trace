const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { getISOWeekMonday } = require('../utils/date');

const router = express.Router();

router.use(authenticateToken);

// City-specific benchmarks (kg CO2e per month, per capita)
const CITY_BENCHMARKS = {
  mumbai:        { monthly: 110, label: 'Mumbai avg' },
  delhi:         { monthly: 145, label: 'Delhi avg' },
  bangalore:     { monthly: 125, label: 'Bengaluru avg' },
  chennai:       { monthly: 118, label: 'Chennai avg' },
  pune:          { monthly: 120, label: 'Pune avg' },
  kolkata:       { monthly: 130, label: 'Kolkata avg' },
  hyderabad:     { monthly: 128, label: 'Hyderabad avg' },
  india_national:{ monthly: 145, label: 'India national avg' }
};

/**
 * Helper to calculate start and end dates for current and previous periods
 */
function getPeriodRanges(range) {
  const today = new Date();
  let startCurrent, endCurrent, startPrevious, endPrevious;

  if (range === 'week') {
    const currentStart = new Date(today);
    currentStart.setDate(today.getDate() - 6);
    startCurrent = currentStart.toISOString().split('T')[0];
    endCurrent = today.toISOString().split('T')[0];

    const prevEnd = new Date(currentStart);
    prevEnd.setDate(currentStart.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - 6);

    startPrevious = prevStart.toISOString().split('T')[0];
    endPrevious = prevEnd.toISOString().split('T')[0];
  } else {
    const year = today.getFullYear();
    const month = today.getMonth();

    startCurrent = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    endCurrent = today.toISOString().split('T')[0];

    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = year - 1;
    }

    const lastDayOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    startPrevious = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    endPrevious = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
  }

  return { startCurrent, endCurrent, startPrevious, endPrevious };
}

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const range = req.query.range === 'week' ? 'week' : 'month';
    const { startCurrent, endCurrent, startPrevious, endPrevious } = getPeriodRanges(range);

    // 1. Fetch current user context
    let user = { household_size: 1, city: null, current_streak: 0, longest_streak: 0 };
    try {
      const fullUserResult = await db.query('SELECT household_size, city, current_streak, longest_streak FROM users WHERE id = $1', [req.user.id]);
      const fullUser = fullUserResult.rows[0];
      if (fullUser) user = fullUser;
    } catch (_) {
      // Pre-migration fallback: columns may not exist yet
      const basicUserResult = await db.query('SELECT household_size FROM users WHERE id = $1', [req.user.id]);
      const basicUser = basicUserResult.rows[0];
      if (basicUser) user.household_size = basicUser.household_size;
    }
    const householdSize = user.household_size || 1;

    // 2. Aggregate current period emissions
    const currentActivitiesResult = await db.query(`
      SELECT category, CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
      FROM activities
      WHERE user_id = $1 AND activity_date BETWEEN $2::date AND $3::date
      GROUP BY category
    `, [req.user.id, startCurrent, endCurrent]);
    const currentActivities = currentActivitiesResult.rows;

    // 3. Aggregate previous period emissions (for delta calculations)
    const prevSumResult = await db.query(`
      SELECT CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
      FROM activities
      WHERE user_id = $1 AND activity_date BETWEEN $2::date AND $3::date
    `, [req.user.id, startPrevious, endPrevious]);
    const prevSumRow = prevSumResult.rows[0];
    const prevTotal = prevSumRow ? prevSumRow.total : 0;

    // Build category map and compute current total
    const categories = { transport: 0, energy: 0, food: 0, consumption: 0 };
    let currentTotal = 0;
    
    currentActivities.forEach(act => {
      categories[act.category] = parseFloat(act.total.toFixed(2));
      currentTotal += act.total;
    });

    currentTotal = parseFloat(currentTotal.toFixed(2));

    // Calculate percentage shares
    const categoryBreakdown = Object.keys(categories).map(cat => {
      const share = currentTotal > 0 ? (categories[cat] / currentTotal) * 100 : 0;
      return {
        category: cat,
        co2e_kg: categories[cat],
        percentage: parseFloat(share.toFixed(1))
      };
    });

    // Calculate comparison delta
    let deltaPercentage = 0;
    if (prevTotal > 0) {
      deltaPercentage = parseFloat((((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1));
    }

    // 4. Optimized trend: 8-week window
    const today = new Date();
    const currentMonday = getISOWeekMonday(today);

    // Start = 8 weeks before current Monday
    const trendStart = new Date(currentMonday);
    trendStart.setDate(currentMonday.getDate() - 56);
    // End = day before current Monday (last Sunday)
    const trendEnd = new Date(currentMonday);
    trendEnd.setDate(currentMonday.getDate() - 1);

    const trendStartStr = trendStart.toISOString().split('T')[0];
    const trendEndStr = trendEnd.toISOString().split('T')[0];

    // Single aggregated query in PostgreSQL using to_char for week grouping
    const trendResult = await db.query(`
      SELECT
        to_char(activity_date, 'IYYY-IW') as week_key,
        CAST(SUM(co2e_kg) AS DOUBLE PRECISION) as total,
        to_char(MIN(activity_date), 'YYYY-MM-DD') as week_start
      FROM activities
      WHERE user_id = $1
        AND activity_date >= $2::date
        AND activity_date <= $3::date
      GROUP BY week_key
      ORDER BY week_key ASC
    `, [req.user.id, trendStartStr, trendEndStr]);
    const trendRows = trendResult.rows;

    // Fill all 8 week buckets, using 0 for missing weeks
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const trendBuckets = [];

    for (let i = 8; i >= 1; i--) {
      const bucketStart = new Date(currentMonday);
      bucketStart.setDate(currentMonday.getDate() - (i * 7));
      bucketStart.setHours(0, 0, 0, 0);

      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 6);
      const bucketStartStr = `${bucketStart.getFullYear()}-${String(bucketStart.getMonth()+1).padStart(2,'0')}-${String(bucketStart.getDate()).padStart(2,'0')}`;
      const bucketEndStr = `${bucketEnd.getFullYear()}-${String(bucketEnd.getMonth()+1).padStart(2,'0')}-${String(bucketEnd.getDate()).padStart(2,'0')}`;

      const matchingRow = trendRows.find(r => r.week_start >= bucketStartStr && r.week_start <= bucketEndStr);
      const weekLabel = `${monthNames[bucketStart.getMonth()]} ${bucketStart.getDate()}`;

      trendBuckets.push({
        label: weekLabel,
        total: matchingRow ? parseFloat(matchingRow.total.toFixed(1)) : 0
      });
    }

    // 5. Benchmark — city-aware (Phase 5.3)
    const monthlyBenchmark = CITY_BENCHMARKS[user?.city] || CITY_BENCHMARKS.india_national;
    const benchmarkValue = range === 'month'
      ? monthlyBenchmark.monthly
      : parseFloat((monthlyBenchmark.monthly * (7 / 30.4)).toFixed(1));
    const benchmarkLabel = monthlyBenchmark.label;

    res.json({
      period: range,
      dateRange: { start: startCurrent, end: endCurrent },
      totalCO2e: currentTotal,
      prevTotalCO2e: parseFloat(prevTotal.toFixed(2)),
      deltaPercentage,
      categoryBreakdown,
      trend: trendBuckets,
      benchmark: {
        value: benchmarkValue,
        label: `${benchmarkLabel} (${range === 'month' ? `${monthlyBenchmark.monthly} kg/mo` : `${parseFloat((monthlyBenchmark.monthly * 7/30.4).toFixed(1))} kg/wk`})`,
        source: 'India CEA, DEFRA, and IPCC Per-Capita averages'
      },
      streak: {
        current: user?.current_streak || 0,
        longest: user?.longest_streak || 0
      },
      city: user?.city || null
    });

  } catch (error) {
    console.error('Dashboard Aggregation Error:', error);
    res.status(500).json({ error: 'Failed to compute dashboard summary' });
  }
});

module.exports = router;
