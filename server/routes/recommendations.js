const express = require('express');
const { z } = require('zod');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { getPeriodStats, generateWhatIfOptions, shouldTriggerNewRecommendation } = require('../engine/recommend');
const { generateRecommendation } = require('../services/llmClient');

const router = express.Router();

const commitSchema = z.object({
  action_item_id: z.number().int().positive('Action item ID must be a positive integer')
});

router.use(authenticateToken);

/**
 * Helper to get date string relative to today
 */
function getRelativeDateStr(daysOffset) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
}

/**
 * Automatically evaluates expired commitments and updates their status.
 */
async function autoEvaluateCommitments(userId) {
  const todayStr = getRelativeDateStr(0);
  
  // Single batch query to evaluate all expired commitments and calculate actual emissions in one go
  const expiredStatsResult = await db.query(`
    SELECT c.id, 
           CAST(c.baseline_co2e_kg AS DOUBLE PRECISION) as baseline_co2e_kg, 
           CAST(ai.estimated_saving_kg AS DOUBLE PRECISION) as estimated_saving_kg,
           CAST(COALESCE(SUM(a.co2e_kg), 0) AS DOUBLE PRECISION) as actual_emissions
    FROM commitments c
    JOIN action_items ai ON c.action_item_id = ai.id
    LEFT JOIN activities a ON c.user_id = a.user_id 
      AND ai.target_category = a.category 
      AND a.activity_date >= c.start_date 
      AND a.activity_date <= c.end_date
    WHERE c.user_id = $1 AND c.status = 'active' AND c.end_date < $2::date
    GROUP BY c.id, ai.id
  `, [userId, todayStr]);
  const expiredStats = expiredStatsResult.rows;

  if (expiredStats.length === 0) return;

  // Perform updates in a single transaction
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const valuesList = [];
    const params = [];
    let paramIndex = 1;

    for (const row of expiredStats) {
      const actual = row.actual_emissions;
      const baseline = row.baseline_co2e_kg;
      const promisedSaving = row.estimated_saving_kg;

      let finalStatus = 'missed';
      if (actual <= (baseline - promisedSaving * 0.5)) {
        finalStatus = 'success';
      } else if (actual < baseline) {
        finalStatus = 'partial';
      }

      valuesList.push(`($${paramIndex}::int, $${paramIndex + 1}::varchar)`);
      params.push(row.id, finalStatus);
      paramIndex += 2;
    }

    const queryText = `
      UPDATE commitments AS c
      SET status = v.status
      FROM (VALUES ${valuesList.join(', ')}) AS v(id, status)
      WHERE c.id = v.id
    `;

    await client.query(queryText, params);
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// In-memory debounce: prevents double-evaluation when both parallel requests fire on page load
const recentEvaluationsMap = new Map();
async function safeEvaluate(userId) {
  const lastRun = recentEvaluationsMap.get(userId) || 0;
  if (process.env.NODE_ENV !== 'test' && Date.now() - lastRun < 5000) return;
  recentEvaluationsMap.set(userId, Date.now());
  await autoEvaluateCommitments(userId);
}

// GET /api/recommendations
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Auto-evaluate any expired commitments first (debounced)
    await safeEvaluate(userId);

    // Check T1: total logged activities >= 5
    const activityCountResult = await db.query('SELECT COUNT(*) as count FROM activities WHERE user_id = $1', [userId]);
    const totalLogs = activityCountResult.rows[0] ? parseInt(activityCountResult.rows[0].count) : 0;
    
    if (totalLogs < 5) {
      return res.json({
        unlocked: false,
        message: 'Log at least 5 activities across any category to unlock your AI coaching recommendations. Keep logging!'
      });
    }

    const forceRefresh = req.query.refresh === 'true';
    const needsNew = await shouldTriggerNewRecommendation(userId, forceRefresh);

    if (needsNew) {
      // 1. Determine period stats (try current calendar month first, fall back to last 30 days if sparse)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const startOfMonth = `${year}-${month}-01`;
      const todayStr = now.toISOString().split('T')[0];

      let stats = await getPeriodStats(userId, startOfMonth, todayStr);
      
      // Fallback: If current month has less than 5 logs, compute over last 30 days for better contextual insights
      if (!stats || stats.activities.length < 5) {
        const thirtyDaysAgo = getRelativeDateStr(-30);
        stats = await getPeriodStats(userId, thirtyDaysAgo, todayStr);
      }

      if (!stats) {
        return res.status(400).json({ error: 'Insufficient logging history to generate plan.' });
      }

      // 2. Generate what-if suggestions
      const whatIfOptions = generateWhatIfOptions(stats.topCategory, stats.topSubType, stats.activities);

      const statsContext = {
        topCategory: stats.topCategory,
        topCategorySharePct: stats.topCategorySharePct,
        topSubType: stats.topSubType,
        whatIfOptions
      };

      // 3. Await LLM (or fallback) — this is now a clean async call
      const plan = await generateRecommendation(req.user.name, statsContext);

      // Persist in an async transaction and return
      const client = await db.pool.connect();
      let payload;
      try {
        await client.query('BEGIN');
        
        // Save recommendation
        const recResult = await client.query(`
          INSERT INTO recommendations (user_id, top_category, top_category_share_pct, summary_text, source)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [userId, plan.top_category || statsContext.topCategory, statsContext.topCategorySharePct, plan.summary, plan.source]);
        
        const recId = recResult.rows[0].id;

        // Save actions
        const insertActionSql = `
          INSERT INTO action_items (recommendation_id, rank, action_text, estimated_saving_kg, target_category)
          VALUES ($1, $2, $3, $4, $5)
        `;

        for (const act of plan.actions) {
          await client.query(insertActionSql, [recId, act.rank, act.action_text, act.estimated_saving_kg, act.target_category]);
        }

        // Fetch newly created plan to return
        const finalRecResult = await client.query('SELECT * FROM recommendations WHERE id = $1', [recId]);
        const finalRec = finalRecResult.rows[0];
        
        const finalActionsResult = await client.query('SELECT * FROM action_items WHERE recommendation_id = $1 ORDER BY rank', [recId]);
        const finalActions = finalActionsResult.rows;

        await client.query('COMMIT');
        payload = { recommendation: finalRec, actions: finalActions };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      return res.json({ unlocked: true, ...payload });

    } else {
      // Serve cached latest recommendation
      const lastRecResult = await db.query(`
        SELECT * FROM recommendations 
        WHERE user_id = $1 
        ORDER BY generated_at DESC LIMIT 1
      `, [userId]);
      const lastRec = lastRecResult.rows[0];

      if (!lastRec) {
        return res.status(404).json({ error: 'No recommendations found.' });
      }

      const actionsResult = await db.query(`
        SELECT * FROM action_items 
        WHERE recommendation_id = $1 
        ORDER BY rank
      `, [lastRec.id]);
      const actions = actionsResult.rows;

      return res.json({
        unlocked: true,
        recommendation: lastRec,
        actions
      });
    }

  } catch (error) {
    console.error('Recommendations API error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations.' });
  }
});

// GET /api/recommendations/commitments
router.get('/commitments', async (req, res) => {
  try {
    const userId = req.user.id;
    await safeEvaluate(userId);

    const todayStr = getRelativeDateStr(0);

    // Parallelize active and past commitments fetch along with progress calculation
    const [commitmentsResult, activeStatsResult] = await Promise.all([
      db.query(`
        SELECT c.*, ai.action_text, 
               CAST(ai.estimated_saving_kg AS DOUBLE PRECISION) as estimated_saving_kg, 
               ai.target_category
        FROM commitments c
        JOIN action_items ai ON c.action_item_id = ai.id
        WHERE c.user_id = $1
        ORDER BY c.status = 'active' DESC, c.end_date DESC
      `, [userId]),
      db.query(`
        SELECT 
          c.id, 
          CAST(COALESCE(SUM(a.co2e_kg), 0) AS DOUBLE PRECISION) as actual_emissions, 
          COUNT(a.id) as logs_count
        FROM commitments c
        JOIN action_items ai ON c.action_item_id = ai.id
        LEFT JOIN activities a ON c.user_id = a.user_id 
          AND ai.target_category = a.category 
          AND a.activity_date >= c.start_date 
          AND a.activity_date <= c.end_date
          AND a.activity_date <= $1::date
        WHERE c.user_id = $2 AND c.status = 'active'
        GROUP BY c.id
      `, [todayStr, userId])
    ]);
    const commitments = commitmentsResult.rows;
    const activeStats = activeStatsResult.rows;

    const statsMap = new Map(activeStats.map(row => [row.id, row]));

    const commitmentsWithProgress = commitments.map(commit => {
      if (commit.status !== 'active') {
        return commit;
      }

      const stats = statsMap.get(commit.id) || { actual_emissions: 0, logs_count: 0 };
      const actualSum = stats.actual_emissions;
      const logsCount = parseInt(stats.logs_count);

      // Estimate progress: baseline CO2e (scaled to elapsed days) vs actual emissions
      const start = new Date(commit.start_date);
      const today = new Date(todayStr);
      const elapsedDays = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)) + 1);
      
      // Scaled baseline
      const scaledBaseline = (parseFloat(commit.baseline_co2e_kg) / 7) * Math.min(7, elapsedDays);
      
      // Net saved relative to baseline
      const co2eSaved = Math.max(0, scaledBaseline - actualSum);

      return {
        ...commit,
        baseline_co2e_kg: parseFloat(commit.baseline_co2e_kg),
        progress: {
          actual_emissions: parseFloat(actualSum.toFixed(2)),
          logs_count: logsCount,
          elapsed_days: elapsedDays,
          co2e_saved_kg: parseFloat(co2eSaved.toFixed(1))
        }
      };
    });

    res.json(commitmentsWithProgress);
  } catch (error) {
    console.error('Get commitments error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch commitments' });
  }
});

// POST /api/recommendations/commit
router.post('/commit', async (req, res) => {
  try {
    const data = commitSchema.parse(req.body);
    const action_item_id = data.action_item_id;
    const userId = req.user.id;

    // Verify action item exists
    const actionItemResult = await db.query(`
      SELECT ai.*, r.user_id 
      FROM action_items ai
      JOIN recommendations r ON ai.recommendation_id = r.id
      WHERE ai.id = $1 AND r.user_id = $2
    `, [action_item_id, userId]);
    const actionItem = actionItemResult.rows[0];

    if (!actionItem) {
      return res.status(404).json({ error: 'Action item not found or unauthorized' });
    }

    // Check if there is already an active commitment for this target category to avoid duplicate focus
    const activeCommitResult = await db.query(`
      SELECT c.id 
      FROM commitments c
      JOIN action_items ai ON c.action_item_id = ai.id
      WHERE c.user_id = $1 AND c.status = 'active' AND ai.target_category = $2
    `, [userId, actionItem.target_category]);

    if (activeCommitResult.rows[0]) {
      return res.status(400).json({ 
        error: `You already have an active commitment in the ${actionItem.target_category} category. Complete it first!` 
      });
    }

    // Calculate baseline CO2e over the prior 7 days (today - 7 to today - 1)
    const sevenDaysAgo = getRelativeDateStr(-7);
    const yesterday = getRelativeDateStr(-1);

    const baselineResult = await db.query(`
      SELECT CAST(COALESCE(SUM(co2e_kg), 0) AS DOUBLE PRECISION) as total
      FROM activities
      WHERE user_id = $1 AND category = $2 AND activity_date BETWEEN $3::date AND $4::date
    `, [userId, actionItem.target_category, sevenDaysAgo, yesterday]);
    const baseline = baselineResult.rows[0] ? baselineResult.rows[0].total : 0;

    const startDate = getRelativeDateStr(0);
    const endDate = getRelativeDateStr(7); // Default 7-day challenge

    const result = await db.query(`
      INSERT INTO commitments (user_id, action_item_id, start_date, end_date, status, baseline_co2e_kg)
      VALUES ($1, $2, $3, $4, 'active', $5)
      RETURNING id
    `, [userId, actionItem.id, startDate, endDate, baseline]);

    res.status(201).json({
      message: 'Committed to action successfully! Good luck!',
      commitment: {
        id: result.rows[0].id,
        action_item_id,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        baseline_co2e_kg: baseline
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Commit action error:', error);
    res.status(500).json({ error: 'Failed to create commitment' });
  }
});

router.autoEvaluateCommitments = autoEvaluateCommitments;
module.exports = router;
