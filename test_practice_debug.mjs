// Test the practice functions directly
import { query } from './src/db/connection.mjs';
import {
  getProgressStats,
  getReviewSchedule,
  getTodaysSummary,
  getPracticeStreak,
} from './src/auth/practice.mjs';

async function testPracticeFunctions() {
  try {
    // Get first user from database
    const usersResult = await query('SELECT user_id, username FROM users LIMIT 1');
    if (usersResult.rows.length === 0) {
      console.error('No users found in database');
      process.exit(1);
    }

    const user = usersResult.rows[0];
    const userId = user.user_id;
    console.log(`Testing with user: ${user.username} (${userId})`);
    console.log('');

    // Test each function
    console.log('1. Testing getProgressStats...');
    try {
      const stats = await getProgressStats(userId);
      console.log('   ✅ Success:', JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error('   ❌ Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    console.log('');

    console.log('2. Testing getTodaysSummary...');
    try {
      const summary = await getTodaysSummary(userId);
      console.log('   ✅ Success:', JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error('   ❌ Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    console.log('');

    console.log('3. Testing getReviewSchedule...');
    try {
      const schedule = await getReviewSchedule(userId);
      console.log('   ✅ Success:', JSON.stringify(schedule, null, 2));
    } catch (error) {
      console.error('   ❌ Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    console.log('');

    console.log('4. Testing getPracticeStreak...');
    try {
      const streak = await getPracticeStreak(userId);
      console.log('   ✅ Success:', streak);
    } catch (error) {
      console.error('   ❌ Error:', error.message);
      console.error('   Stack:', error.stack);
    }

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testPracticeFunctions();
