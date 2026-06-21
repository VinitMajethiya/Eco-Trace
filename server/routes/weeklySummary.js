const express = require('express');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { generateWeeklySummary } = require('../services/weeklySummaryClient');

const router = express.Router();

router.use(authenticateToken);

function getISOWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeeklyRanges(todayDate = new Date()) {
  const currentMonday = getISOWeekMonday(todayDate);

  const prevMonday = new Date(currentMonday);
  prevMonday.setDate(currentMonday.getDate() - 7);

  const prevSunday = new Date(currentMonday);
  prevSunday.setDate(currentMonday.getDate() - 1);

  const endCurrentDate = new Date(currentMonday);
  endCurrentDate.setDate(currentMonday.getDate() + 6);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const startCurrent = formatDate(currentMonday);
  const endCurrent = formatDate(endCurrentDate);
  const startPrevious = formatDate(prevMonday);
  const endPrevious = formatDate(prevSunday);

  return { startCurrent, endCurrent, startPrevious, endPrevious };
}

// GET /api/dashboard/weekly-summary
router.get('/', async (req, res) => {
  try {
    const { startCurrent, endCurrent, startPrevious, endPrevious } = getWeeklyRanges();
    const weekStartDate = startCurrent; // Fixed ISO Monday (YYYY-MM-DD)
    
    // 1. Check database cache first
    const cachedResult = await db.query(`
      SELECT summary_text 
      FROM weekly_summaries 
      WHERE user_id = $1 AND week_start_date = $2
    `, [req.user.id, weekStartDate]);
    const cached = cachedResult.rows[0];

    if (cached) {
      return res.json({
        weekStartDate,
        summaryText: cached.summary_text,
        cached: true
      });
    }

    // Parallelize independent database queries to optimize performance
    const [userResult, currentActivitiesResult, prevSumResult] = await Promise.all([
      db.query('SELECT name FROM users WHERE id = $1', [req.user.id]),
      db.query(`
        SELECT category, CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
        FROM activities
        WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3
        GROUP BY category
      `, [req.user.id, startCurrent, endCurrent]),
      db.query(`
        SELECT CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
        FROM activities
        WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3
      `, [req.user.id, startPrevious, endPrevious])
    ]);

    const userRow = userResult.rows[0];
    const userName = userRow ? userRow.name : 'EcoTracer';

    const currentActivities = currentActivitiesResult.rows;
    let currentTotal = 0;
    const categoryBreakdown = { transport: 0, energy: 0, food: 0, consumption: 0 };
    currentActivities.forEach(act => {
      categoryBreakdown[act.category] = act.total;
      currentTotal += act.total;
    });

    const prevSumRow = prevSumResult.rows[0];
    const prevTotal = prevSumRow ? prevSumRow.total : 0;

    // Calculate percentage change
    let deltaPercentage = 0;
    if (prevTotal > 0) {
      deltaPercentage = parseFloat((((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1));
    }

    // 5. Generate summary using Gemini AI / fallback
    const summaryText = await generateWeeklySummary(
      userName,
      currentTotal,
      prevTotal,
      categoryBreakdown,
      deltaPercentage
    );

    // 6. Cache in the database
    try {
      await db.query(`
        INSERT INTO weekly_summaries (user_id, week_start_date, summary_text)
        VALUES ($1, $2, $3)
        ON CONFLICT(user_id, week_start_date) DO UPDATE SET summary_text = EXCLUDED.summary_text
      `, [req.user.id, weekStartDate, summaryText]);
    } catch (err) {
      console.warn('Failed to cache weekly summary in DB:', err.message);
    }

    res.json({
      weekStartDate,
      summaryText,
      cached: false
    });

  } catch (error) {
    console.error('Weekly summary route error:', error);
    res.status(500).json({ error: 'Failed to generate weekly summary' });
  }
});

router.getISOWeekMonday = getISOWeekMonday;
router.getWeeklyRanges = getWeeklyRanges;
module.exports = router;
