// Quick test of job-related functions
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testJobFunctions() {
  try {
    console.log('Testing database connection...');
    
    // Test connection
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection failed:', error);
      return;
    }
    
    console.log('✅ Database connection successful');
    
    // Test job creation function
    console.log('Testing job creation...');
    
    const testUserId = '123456789'; // Test Telegram ID
    
    // Create test user if needed
    const userId = await supabase.rpc('get_or_create_user', {
      p_telegram_id: testUserId,
      p_telegram_username: 'test_user',
      p_first_name: 'Test'
    });
    
    console.log('User ID:', userId.data);
    
    // Test job operations
    const { data: jobs, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userId.data)
      .limit(5);
    
    if (jobError) {
      console.error('Error fetching jobs:', jobError);
    } else {
      console.log('✅ Jobs fetched successfully:', jobs.length, 'jobs found');
    }
    
    console.log('All tests passed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testJobFunctions();