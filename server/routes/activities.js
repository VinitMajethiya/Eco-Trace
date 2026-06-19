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
router.get('/export', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT category, sub_type, quantity, unit, co2e_kg, activity_date FROM activities WHERE user_id = ? ORDER BY activity_date DESC'
    ).all(req.user.id);

    const header = 'Category,Sub-type,Quantity,Unit,CO2e (kg),Date\n';
    const csv = rows.map(r =>
      `${r.category},${r.sub_type},${r.quantity},${r.unit},${r.co2e_kg},${r.activity_date}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ecotrace-export.csv"');
    res.send(header + csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export activities' });
  }
});

// GET /api/activities — server-side paginated (Phase 2.4)
router.get('/', (req, res) => {
  try {
    const { category, start_date, end_date } = req.query;

    // Pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.id];

    if (category) {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (start_date && end_date) {
      whereClause += ' AND activity_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      whereClause += ' AND activity_date >= ?';
      params.push(start_date);
    } else if (end_date) {
      whereClause += ' AND activity_date <= ?';
      params.push(end_date);
    }

    // Total count for pagination metadata
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM activities ${whereClause}`
    ).get(...params);
    const total = countRow ? countRow.total : 0;

    // Paginated result
    const activities = db.prepare(
      `SELECT * FROM activities ${whereClause} ORDER BY activity_date DESC, created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/activities — with per-user rate limiter
router.post('/', activityLimiter, (req, res) => {
  try {
    const data = activitySchema.parse(req.body);

    // Authoritative calculation of carbon footprint on backend
    const calc = calculateCO2e(data.category, data.sub_type, data.quantity);

    const result = db.prepare(`
      INSERT INTO activities (user_id, category, sub_type, quantity, unit, co2e_kg, activity_date, is_recurring, recurring_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      data.category,
      data.sub_type,
      data.quantity,
      calc.unit,
      calc.co2e_kg,
      data.activity_date,
      data.is_recurring ? 1 : 0,
      data.recurring_days || null
    );

    // --- Streak logic (Phase 5.4) — gracefully skipped if columns not yet migrated ---
    let streakInfo = { current: 0, longest: 0, isNewDay: false };
    try {
      const userRow = db.prepare(
        'SELECT current_streak, longest_streak, last_log_date FROM users WHERE id = ?'
      ).get(req.user.id);

      if (userRow && 'current_streak' in userRow) {
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

          db.prepare(
            'UPDATE users SET current_streak = ?, longest_streak = ?, last_log_date = ? WHERE id = ?'
          ).run(newStreak, newLongest, today, req.user.id);

          streakInfo = { current: newStreak, longest: newLongest, isNewDay: true };
        }
      }
    } catch (_) {
      // Streak columns not yet available (pre-migration) — skip silently
    }

    const newActivity = {
      id: result.lastInsertRowid,
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
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// DELETE /api/activities/:id
router.delete('/:id', (req, res) => {
  try {
    const activityId = req.params.id;

    // Check ownership before deleting
    const activity = db.prepare('SELECT id FROM activities WHERE id = ? AND user_id = ?').get(activityId, req.user.id);
    
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized' });
    }

    db.prepare('DELETE FROM activities WHERE id = ?').run(activityId);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

module.exports = router;
