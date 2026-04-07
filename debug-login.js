const express = require('express');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const mockDb = require('./server/utils/mockDb');
const { safeEqual } = require('./server/utils/helpers');

const app = express();
app.use(express.json());

const USE_MOCK_DB = process.env.USE_MOCK_DB === 'true';
console.log('🔍 Debug mode - USE_MOCK_DB:', USE_MOCK_DB);

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('\n📝 Login attempt:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    let user;
    if (USE_MOCK_DB) {
      console.log('🔍 Using MOCK_DB');
      user = mockDb.getUserByEmail(email);
      console.log('✅ User from mock DB:', user ? user.email : 'NOT FOUND');
    } else {
      console.log('🔍 Using REAL_DB (not configured)');
      user = null;
    }

    if (!user || !user.is_active) {
      console.log('❌ User not found or inactive');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!safeEqual(String(user.email).toLowerCase(), String(email).toLowerCase())) {
      console.log('❌ Email comparison failed');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    console.log('✅ Email valid');
    console.log('🔐 Checking password...');
    console.log('   Provided:', password);
    console.log('   Hash:', user.password.substring(0, 20) + '...');

    const validPassword = await bcrypt.compare(password, user.password);
    console.log('✅ Password valid:', validPassword);

    if (!validPassword) {
      console.log('❌ Password mismatch');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = 'DEBUG_TOKEN_' + Date.now();
    console.log('✅ Login successful!');

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
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Unable to login right now.' });
  }
});

app.listen(3000, () => {
  console.log('🚀 Debug server on http://localhost:3000');
});
