require('dotenv').config();

const bcrypt = require('bcryptjs');
const mockDb = require('./server/utils/mockDb');

console.log('USE_MOCK_DB env var:', process.env.USE_MOCK_DB);
console.log('Mock user lookup:');

const user = mockDb.getUserByEmail('admin@example.com');
console.log('User found:', user ? 'YES' : 'NO');
console.log('User data:', user);

if (user) {
  (async () => {
    const validPassword = await bcrypt.compare('AdminPass123!', user.password);
    console.log('\nPassword valid:', validPassword);
  })();
}
