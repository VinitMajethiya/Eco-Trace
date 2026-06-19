const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
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
        let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
          // Create OAuth-only user
          const result = db.prepare(`
            INSERT INTO users (name, email, password_hash, oauth_provider, oauth_id)
            VALUES (?, ?, ?, ?, ?)
          `).run(name, email, null, 'google', profile.id);

          user = {
            id: result.lastInsertRowid,
            name,
            email,
            password_hash: null,
            oauth_provider: 'google',
            oauth_id: profile.id
          };
        } else {
          // Link OAuth to existing user if not already linked
          if (!user.oauth_provider) {
            db.prepare(`
              UPDATE users 
              SET oauth_provider = ?, oauth_id = ?
              WHERE id = ?
            `).run('google', profile.id, user.id);
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
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, name, email, household_size, default_commute_mode, default_diet, created_at 
      FROM users WHERE id = ?
    `).get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user state' });
  }
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const salt = bcrypt.genSaltSync(12);
    const passwordHash = bcrypt.hashSync(data.password, salt);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, household_size, default_commute_mode, default_diet)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.email,
      passwordHash,
      data.household_size,
      data.default_commute_mode || null,
      data.default_diet || null
    );

    const userId = result.lastInsertRowid;
    
    // Generate JWT
    const token = jwt.sign({ id: userId, email: data.email, name: data.name }, JWT_SECRET, {
      expiresIn: '7d'
    });

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = db.prepare('SELECT id, name, email, password_hash, household_size, default_commute_mode, default_diet FROM users WHERE email = ?').get(data.email);
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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
});

// POST /api/auth/onboarding - update defaults after onboarding walkthrough
router.post('/onboarding', authenticateToken, (req, res) => {
  try {
    const onboardingSchema = z.object({
      default_commute_mode: z.string().min(1, 'Commute mode is required'),
      default_diet: z.string().min(1, 'Diet pattern is required'),
      household_size: z.number().int().min(1),
      city: z.string().optional()
    });

    const data = onboardingSchema.parse(req.body);

    db.prepare(`
      UPDATE users 
      SET default_commute_mode = ?, default_diet = ?, household_size = ?, city = COALESCE(?, city)
      WHERE id = ?
    `).run(data.default_commute_mode, data.default_diet, data.household_size, data.city || null, req.user.id);

    // Soft invalidation of recommendations upon onboarding preferences change
    db.prepare('UPDATE recommendations SET is_stale = 1 WHERE user_id = ?').run(req.user.id);

    res.json({ message: 'Onboarding defaults configured.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Failed to save onboarding defaults.' });
  }
});

// DELETE /api/auth/account - permanently delete user account and all data
router.delete('/account', authenticateToken, (req, res) => {
  try {
    // ON DELETE CASCADE handles activities, recommendations, commitments
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
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
    googleOAuthEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// GET /api/auth/google - trigger google login
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
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
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Google OAuth is not configured on this server.' });
  }

  let clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  if (req.query.state) {
    try {
      const stateObj = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
      if (stateObj.clientOrigin) {
        clientOrigin = stateObj.clientOrigin;
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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to dashboard
    res.redirect(clientOrigin + '/');
  })(req, res, next);
});

module.exports = router;
