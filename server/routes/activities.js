const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { calculateCO2e } = require('../engine/calculate');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const activitySchema = z.object({
  category: z.enum(['transport', 'energy', 'food', 'consumption']),
  sub_type: z.string().min(1, 'Sub-type is required'),
  quantity: z.number().positive('Quantity must be greater than 0').max(99999, 'Quantity must be less than 100,000'),
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  is_recurring: z.union([z.number(), z.boolean()]).optional(),
  recurring_days: z.string().nullable().optional()
});

// Per-user rate limiter for POST /api/activities (Phase 2.3)
// 30 logs per minute per user prevents abuse while allowing bursts
const activityLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  message: { error: 'Too many activity logs. Please slow down.' }
});

// Apply JWT authentication to all routes in this file
router.use(authenticateToken);

// GET /api/activities/export — MUST be before /:id to prevent "export" being parsed as an ID
router.get('/export', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT category, sub_type, quantity, unit, co2e_kg, activity_date FROM activities WHERE user_id = $1 ORDER BY activity_date DESC',
      [req.user.id]
    );
    const rows = result.rows;

    const header = 'Category,Sub-type,Quantity,Unit,CO2e (kg),Date\n';
    const csv = rows.map(r =>
      `${r.category},${r.sub_type},${r.quantity},${r.unit},${r.co2e_kg},${r.activity_date}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ecotrace-export.csv"');
    res.send(header + csv);
  } catch (error) {
    console.error('Export activities error:', error);
    res.status(500).json({ error: 'Failed to export activities' });
  }
});

// GET /api/activities — server-side paginated (Phase 2.4)
router.get('/', async (req, res) => {
  try {
    const { category, start_date, end_date } = req.query;

    // Pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = 'WHERE user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (start_date && end_date) {
      whereClause += ` AND activity_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(start_date, end_date);
      paramIndex += 2;
    } else if (start_date) {
      whereClause += ` AND activity_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    } else if (end_date) {
      whereClause += ` AND activity_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Total count for pagination metadata
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM activities ${whereClause}`,
      params
    );
    const total = countResult.rows[0] ? parseInt(countResult.rows[0].total) : 0;

    // Paginated result
    const limitParamIndex = paramIndex;
    const offsetParamIndex = paramIndex + 1;
    const queryParams = [...params, limit, offset];
    
    const activitiesResult = await db.query(
      `SELECT * FROM activities ${whereClause} ORDER BY activity_date DESC, created_at DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
      queryParams
    );
    const activities = activitiesResult.rows;

    res.json({
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Fetch activities error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/activities — with per-user rate limiter
router.post('/', activityLimiter, async (req, res) => {
  try {
    const data = activitySchema.parse(req.body);

    // Authoritative calculation of carbon footprint on backend
    const calc = calculateCO2e(data.category, data.sub_type, data.quantity);

    const result = await db.query(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      req.user.id,
      data.category,
      data.sub_type,
      data.quantity,
      calc.unit,
      calc.co2e_kg,
      data.activity_date,
      data.is_recurring ? 1 : 0,
      data.recurring_days || null
    ]);
    const lastInsertRowid = result.rows[0].id;

    // --- Streak logic (Phase 5.4) ---
    let streakInfo = { current: 0, longest: 0, isNewDay: false };
    try {
      const userResult = await db.query(
        'SELECT current_streak, longest_streak, last_log_date FROM users WHERE id = $1',
        [req.user.id]
      );
      const userRow = userResult.rows[0];

      if (userRow) {
        const today = data.activity_date;
        const lastLog = userRow.last_log_date;

        if (lastLog === today) {
          streakInfo = {
            current: userRow.current_streak,
            longest: userRow.longest_streak,
            isNewDay: false
          };
        } else {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const newStreak = lastLog === yesterdayStr ? userRow.current_streak + 1 : 1;
          const newLongest = Math.max(userRow.longest_streak || 0, newStreak);

          await db.query(
            'UPDATE users SET current_streak = $1, longest_streak = $2, last_log_date = $3 WHERE id = $4',
            [newStreak, newLongest, today, req.user.id]
          );

          streakInfo = { current: newStreak, longest: newLongest, isNewDay: true };
        }
      }
    } catch (err) {
      console.warn('Streak update skipped (pre-migration or other error):', err.message);
    }

    const newActivity = {
      id: lastInsertRowid,
      user_id: req.user.id,
      category: data.category,
      sub_type: data.sub_type,
      quantity: data.quantity,
      unit: calc.unit,
      co2e_kg: calc.co2e_kg,
      activity_date: data.activity_date,
      is_recurring: data.is_recurring ? 1 : 0,
      recurring_days: data.recurring_days || null,
      streak: streakInfo
    };

    res.status(201).json(newActivity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    // Handle error thrown by Calculation Engine (e.g. invalid sub-type)
    if (error.message && (error.message.includes('Invalid sub-type') || error.message.includes('Invalid category'))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Log activity error:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// DELETE /api/activities/:id
router.delete('/:id', async (req, res) => {
  try {
    const activityId = req.params.id;

    // Check ownership before deleting
    const activityResult = await db.query(
      'SELECT id FROM activities WHERE id = $1 AND user_id = $2',
      [activityId, req.user.id]
    );
    const activity = activityResult.rows[0];
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized' });
    }

    await db.query('DELETE FROM activities WHERE id = $1', [activityId]);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

module.exports = router;
