const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
const { safeEqual } = require('../utils/helpers');
const mockDb = require('../utils/mockDb');

const USE_MOCK_DB = process.env.USE_MOCK_DB === 'true';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    let user;
    if (USE_MOCK_DB) {
      user = mockDb.getUserByEmail(email);
    } else {
      const result = await pool.query(
        `SELECT id, email, password, full_name, role, is_active
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email]
      );
      user = result.rows[0];
    }

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!safeEqual(String(user.email).toLowerCase(), String(email).toLowerCase())) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ error: 'Unable to login right now. Please try again.' });
  }
}

async function me(req, res) {
  try {
    let user;
    if (USE_MOCK_DB) {
      user = mockDb.MOCK_USERS.find(u => u.id === req.user.id);
    } else {
      const result = await pool.query(
        'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
        [req.user.id]
      );
      user = result.rows[0];
    }

    if (!user || !user.is_active) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Failed to fetch user profile:', error.message);
    return res.status(500).json({ error: 'Unable to fetch your profile.' });
  }
}

async function listUsers(_req, res) {
  try {
    let users;
    if (USE_MOCK_DB) {
      users = mockDb.getAllUsers();
    } else {
      const result = await pool.query(
        `SELECT id, email, full_name, role, is_active
         FROM users
         ORDER BY id DESC`
      );
      users = result.rows;
    }

    return res.json({ users });
  } catch (error) {
    console.error('Failed to list users:', error.message);
    return res.status(500).json({ error: 'Unable to load users right now.' });
  }
}

async function createUser(req, res) {
  try {
    const { email, password, full_name: fullName, role } = req.body;

    if (!email || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Please provide all required user fields.' });
    }

    if (!['admin', 'operator'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }

    const exists = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password, full_name, role, is_active)
       VALUES (LOWER($1), $2, $3, $4, true)
       RETURNING id, email, full_name, role, is_active`,
      [email, hash, fullName, role]
    );

    return res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Failed to create user:', error.message);
    return res.status(500).json({ error: 'Unable to create user right now.' });
  }
}

async function toggleUser(req, res) {
  try {
    const userId = Number(req.params.id);

    const result = await pool.query(
      `UPDATE users
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id, email, full_name, role, is_active`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Failed to toggle user:', error.message);
    return res.status(500).json({ error: 'Unable to update user status.' });
  }
}

module.exports = {
  login,
  me,
  listUsers,
  createUser,
  toggleUser
};
