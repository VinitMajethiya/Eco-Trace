const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const isGoogleOAuthConfigured = 
  process.env.GOOGLE_CLIENT_ID && 
  process.env.GOOGLE_CLIENT_ID !== 'your-google-oauth-client-id-here' &&
  process.env.GOOGLE_CLIENT_SECRET && 
  process.env.GOOGLE_CLIENT_SECRET !== 'your-google-oauth-client-secret-here';

function setAuthCookie(res, token) {
  // sameSite: 'none' is required because the frontend (Vercel) and backend (Render)
  // are on different origins — sameSite: 'strict'/'lax' would block the cookie entirely
  // in this deployment topology. Compensating control: CORS is restricted to a single
  // exact CLIENT_ORIGIN (see server.js), so a cross-origin page cannot read authenticated
  // responses even though sameSite:'none' permits the cookie to be sent. secure:true
  // ensures this only ever happens over HTTPS. Full CSRF token protection was
  // considered and deliberately deferred for this submission's scope.
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

if (isGoogleOAuthConfigured) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName || profile.name?.givenName || 'Google User';
        if (!email) {
          return done(new Error('Google profile did not return email'));
        }

        // Check if user already exists
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = userResult.rows[0];

        if (!user) {
          // Create OAuth-only user
          const result = await db.query(`
            INSERT INTO users (name, email, password_hash, oauth_provider, oauth_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `, [name, email, null, 'google', profile.id]);

          user = {
            id: result.rows[0].id,
            name,
            email,
            password_hash: null,
            oauth_provider: 'google',
            oauth_id: profile.id
          };
        } else {
          // Link OAuth to existing user if not already linked
          if (!user.oauth_provider) {
            await db.query(`
              UPDATE users 
              SET oauth_provider = $1, oauth_id = $2
              WHERE id = $3
            `, ['google', profile.id, user.id]);
            user.oauth_provider = 'google';
            user.oauth_id = profile.id;
          }
        }
        
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  household_size: z.number().int().min(1).optional().default(1),
  default_commute_mode: z.string().optional(),
  default_diet: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

// GET /api/auth/me - check current authenticated user state
const { authenticateToken } = require('../middleware/auth');
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query(`
      SELECT id, name, email, household_size, default_commute_mode, default_diet, created_at 
      FROM users WHERE id = $1
    `, [req.user.id]);
    const user = userResult.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Failed to fetch user state' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    // Check if email already exists
    const existingResult = await db.query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existingResult.rows[0]) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const salt = bcrypt.genSaltSync(12);
    const passwordHash = bcrypt.hashSync(data.password, salt);

    const result = await db.query(`
      INSERT INTO users (name, email, password_hash, household_size, default_commute_mode, default_diet)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      data.name,
      data.email,
      passwordHash,
      data.household_size,
      data.default_commute_mode || null,
      data.default_diet || null
    ]);

    const userId = result.rows[0].id;
    
    // Generate JWT
    const token = jwt.sign({ id: userId, email: data.email, name: data.name }, JWT_SECRET, {
      expiresIn: '7d'
    });

    // Set secure cookie
    setAuthCookie(res, token);

    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: userId,
        name: data.name,
        email: data.email,
        household_size: data.household_size,
        default_commute_mode: data.default_commute_mode,
        default_diet: data.default_diet
      },
      token
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const userResult = await db.query('SELECT id, name, email, password_hash, household_size, default_commute_mode, default_diet FROM users WHERE email = $1', [data.email]);
    const user = userResult.rows[0];
    if (!user || user.password_hash === null) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = bcrypt.compareSync(data.password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
      expiresIn: '7d'
    });

    setAuthCookie(res, token);

    res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        household_size: user.household_size,
        default_commute_mode: user.default_commute_mode,
        default_diet: user.default_diet
      },
      token
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/onboarding - update defaults after onboarding walkthrough
router.post('/onboarding', authenticateToken, async (req, res) => {
  try {
    const onboardingSchema = z.object({
      default_commute_mode: z.string().min(1, 'Commute mode is required'),
      default_diet: z.string().min(1, 'Diet pattern is required'),
      household_size: z.number().int().min(1),
      city: z.string().optional()
    });

    const data = onboardingSchema.parse(req.body);

    await db.query(`
      UPDATE users 
      SET default_commute_mode = $1, default_diet = $2, household_size = $3, city = COALESCE($4, city)
      WHERE id = $5
    `, [data.default_commute_mode, data.default_diet, data.household_size, data.city || null, req.user.id]);

    // Soft invalidation of recommendations upon onboarding preferences change
    await db.query('UPDATE recommendations SET is_stale = 1 WHERE user_id = $1', [req.user.id]);

    res.json({ message: 'Onboarding defaults configured.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Failed to save onboarding defaults.' });
  }
});

// DELETE /api/auth/account - permanently delete user account and all data
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    // ON DELETE CASCADE handles activities, recommendations, commitments
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.clearCookie('token');
    res.json({ message: 'Account deleted successfully.' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

// GET /api/auth/config - check which features (like Google OAuth) are enabled
router.get('/config', (req, res) => {
  res.json({
    googleOAuthEnabled: !!isGoogleOAuthConfigured
  });
});

// GET /api/auth/google - trigger google login
router.get('/google', (req, res, next) => {
  if (!isGoogleOAuthConfigured) {
    return res.status(400).json({ error: 'Google OAuth is not configured on this server.' });
  }
  const clientOrigin = req.query.origin || process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const state = Buffer.from(JSON.stringify({ clientOrigin })).toString('base64');
  passport.authenticate('google', { 
    scope: ['profile', 'email'], 
    session: false,
    state: state
  })(req, res, next);
});

// GET /api/auth/google/callback - callback endpoint for google oauth redirection
router.get('/google/callback', (req, res, next) => {
  if (!isGoogleOAuthConfigured) {
    return res.status(400).json({ error: 'Google OAuth is not configured on this server.' });
  }

  let clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  if (req.query.state) {
    try {
      const stateObj = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
      if (stateObj.clientOrigin) {
        const allowedOrigins = [
          process.env.CLIENT_ORIGIN,
          'http://localhost:5173',
          'http://localhost:3000'
        ].filter(Boolean);

        if (allowedOrigins.includes(stateObj.clientOrigin)) {
          clientOrigin = stateObj.clientOrigin;
        } else {
          console.warn(`Blocked unauthorized redirect origin: ${stateObj.clientOrigin}`);
        }
      }
    } catch (e) {
      console.error('Failed to parse OAuth state parameter:', e);
    }
  }

  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }, (err, user) => {
    if (err || !user) {
      return res.redirect(clientOrigin + '/login?error=oauth_failed');
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
      expiresIn: '7d'
    });

    setAuthCookie(res, token);

    // Redirect to dashboard
    res.redirect(clientOrigin + '/');
  })(req, res, next);
});

module.exports = router;
