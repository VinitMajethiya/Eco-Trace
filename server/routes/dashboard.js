const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

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
router.get('/summary', (req, res) => {
  try {
    const range = req.query.range === 'week' ? 'week' : 'month';
    const { startCurrent, endCurrent, startPrevious, endPrevious } = getPeriodRanges(range);

    // 1. Fetch current user context (fail-safe: city/streak columns may not exist before migration 004)
    let user = { household_size: 1, city: null, current_streak: 0, longest_streak: 0 };
    try {
      const fullUser = db.prepare('SELECT household_size, city, current_streak, longest_streak FROM users WHERE id = ?').get(req.user.id);
      if (fullUser) user = fullUser;
    } catch (_) {
      // Pre-migration: columns may not exist yet
      const basicUser = db.prepare('SELECT household_size FROM users WHERE id = ?').get(req.user.id);
      if (basicUser) user.household_size = basicUser.household_size;
    }
    const householdSize = user.household_size || 1;

    // 2. Aggregate current period emissions
    const currentActivities = db.prepare(`
      SELECT category, COALESCE(SUM(co2e_kg), 0) as total
      FROM activities
      WHERE user_id = ? AND activity_date BETWEEN ? AND ?
      GROUP BY category
    `).all(req.user.id, startCurrent, endCurrent);

    // 3. Aggregate previous period emissions (for delta calculations)
    const prevSumRow = db.prepare(`
      SELECT COALESCE(SUM(co2e_kg), 0) as total
      FROM activities
      WHERE user_id = ? AND activity_date BETWEEN ? AND ?
    `).get(req.user.id, startPrevious, endPrevious);
    
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

    // 4. Optimized trend: single GROUP BY query replacing 8 individual queries (Phase 2.5)
    // Calculate the 8-week window: from 8 complete weeks ago (Monday) to last Sunday
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + diffToMonday);
    currentMonday.setHours(0, 0, 0, 0);

    // Start = 8 weeks before current Monday
    const trendStart = new Date(currentMonday);
    trendStart.setDate(currentMonday.getDate() - 56);
    // End = day before current Monday (last Sunday)
    const trendEnd = new Date(currentMonday);
    trendEnd.setDate(currentMonday.getDate() - 1);

    const trendStartStr = trendStart.toISOString().split('T')[0];
    const trendEndStr = trendEnd.toISOString().split('T')[0];

    // Single aggregated query
    const trendRows = db.prepare(`
      SELECT
        strftime('%Y-%W', activity_date) as week_key,
        SUM(co2e_kg) as total,
        MIN(activity_date) as week_start
      FROM activities
      WHERE user_id = ?
        AND activity_date >= ?
        AND activity_date <= ?
      GROUP BY week_key
      ORDER BY week_key ASC
    `).all(req.user.id, trendStartStr, trendEndStr);

    // Build a map for fast lookup
    const trendMap = {};
    trendRows.forEach(r => { trendMap[r.week_key] = r; });

    // Fill all 8 week buckets, using 0 for missing weeks
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const trendBuckets = [];

    for (let i = 8; i >= 1; i--) {
      const bucketStart = new Date(currentMonday);
      bucketStart.setDate(currentMonday.getDate() - (i * 7));
      bucketStart.setHours(0, 0, 0, 0);

      // Compute the ISO week key SQLite will produce for this date
      const y = bucketStart.getFullYear();
      const m = String(bucketStart.getMonth() + 1).padStart(2, '0');
      const d = String(bucketStart.getDate()).padStart(2, '0');
      const dayOfWeek = bucketStart.getDay() || 7; // Mon=1..Sun=7
      const thursdayOfWeek = new Date(bucketStart);
      thursdayOfWeek.setDate(bucketStart.getDate() + (4 - dayOfWeek));
      const yearStart = new Date(thursdayOfWeek.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((thursdayOfWeek - yearStart) / 86400000 + 1) / 7);
      // SQLite uses %W (0-based Sunday-first), so we use the actual date string key approach:
      // Simpler: use the bucketStart date string to look up in trendMap by matching week_start >= bucketStart and < bucketStart+7
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
