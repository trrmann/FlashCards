import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_PG_EXTERNAL_HOSTNAME,
  port: parseInt(process.env.DB_PG_PORT || '5432'),
  database: process.env.DB_PG_DATABASE,
  user: process.env.DB_PG_USER,
  password: process.env.DB_PG_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

console.log('📊 Adding admin role functionality to users table...\n');

try {
  const client = await pool.connect();

  // Check if columns already exist
  const checkColumns = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name IN ('is_admin', 'status')
  `);

  const hasIsAdmin = checkColumns.rows.some((row) => row.column_name === 'is_admin');
  const hasStatus = checkColumns.rows.some((row) => row.column_name === 'status');

  if (!hasIsAdmin) {
    console.log('➕ Adding is_admin column...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
    `);
    console.log('  ✓ is_admin column added');
  } else {
    console.log('  ℹ️  is_admin column already exists');
  }

  if (!hasStatus) {
    console.log('➕ Adding status column...');
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'disabled'))
    `);
    console.log('  ✓ status column added');
  } else {
    console.log('  ℹ️  status column already exists');
  }

  // Set the first user (testuser) as admin
  console.log('\n👤 Setting first user as system admin...');
  const firstUser = await client.query(`
    SELECT user_id, username FROM users ORDER BY created_at LIMIT 1
  `);

  if (firstUser.rows.length > 0) {
    const userId = firstUser.rows[0].user_id;
    const username = firstUser.rows[0].username;

    await client.query(
      `
      UPDATE users SET is_admin = TRUE, status = 'active' WHERE user_id = $1
    `,
      [userId]
    );

    console.log(`  ✓ User "${username}" set as admin\n`);
  }

  // Verify
  console.log('✅ Updated user table structure:\n');
  const userInfo = await client.query(`
    SELECT user_id, username, email, is_admin, status, created_at 
    FROM users 
    ORDER BY created_at
  `);
  console.table(userInfo.rows);

  client.release();
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.message.includes('already exists')) {
    console.log('ℹ️  Columns already exist, skipping...');
  }
} finally {
  await pool.end();
}
