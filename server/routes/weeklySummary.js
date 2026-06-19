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
    
    // Note: Stale sliding-window cache rows from pre-fix code are harmlessly left to age out naturally.


    // 1. Check database cache first
    const cached = db.prepare(`
      SELECT summary_text 
      FROM weekly_summaries 
      WHERE user_id = ? AND week_start_date = ?
    `).get(req.user.id, weekStartDate);

    if (cached) {
      return res.json({
        weekStartDate,
        summaryText: cached.summary_text,
        cached: true
      });
    }

    // 2. Fetch user name
    const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
    const userName = userRow ? userRow.name : 'EcoTracer';

    // 3. Aggregate current week emissions
    const currentActivities = db.prepare(`
      SELECT category, COALESCE(SUM(co2e_kg), 0) as total
      FROM activities
      WHERE user_id = ? AND activity_date BETWEEN ? AND ?
      GROUP BY category
    `).all(req.user.id, startCurrent, endCurrent);

    let currentTotal = 0;
    const categoryBreakdown = { transport: 0, energy: 0, food: 0, consumption: 0 };
    currentActivities.forEach(act => {
      categoryBreakdown[act.category] = act.total;
      currentTotal += act.total;
    });

    // 4. Aggregate previous week emissions
    const prevSumRow = db.prepare(`
      SELECT COALESCE(SUM(co2e_kg), 0) as total
      FROM activities
      WHERE user_id = ? AND activity_date BETWEEN ? AND ?
    `).get(req.user.id, startPrevious, endPrevious);
    
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
      db.prepare(`
        INSERT INTO weekly_summaries (user_id, week_start_date, summary_text)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, week_start_date) DO UPDATE SET summary_text = excluded.summary_text
      `).run(req.user.id, weekStartDate, summaryText);
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

