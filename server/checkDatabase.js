/**
 * Script to check database data and test RLS permissions
 * Usage: node checkDatabase.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

// Using service role key to bypass RLS for checking
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

async function checkDatabase() {
  console.log('🔍 Checking database data...\n');

  try {
    // Check profiles table
    console.log('📋 Profiles table:');
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.log('❌ Error fetching profiles:', profilesError);
    } else {
      console.log(`✅ Found ${profiles?.length || 0} profiles`);
      profiles?.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.email} - Role: ${p.role || 'none'} - Created: ${p.created_at}`);
      });
    }

    console.log('\n📋 User activities table:');
    const { data: activities, error: activitiesError } = await serviceClient
      .from('user_activities')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(20);

    if (activitiesError) {
      console.log('❌ Error fetching activities:', activitiesError);
    } else {
      console.log(`✅ Found ${activities?.length || 0} activities`);
      activities?.forEach((a, i) => {
        console.log(`  ${i + 1}. ${a.activity_type} - User: ${a.user_id} - ${a.timestamp}`);
      });
    }

    // Check courses table
    console.log('\n📋 Courses table:');
    const { data: courses, error: coursesError } = await serviceClient
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (coursesError) {
      console.log('❌ Error fetching courses:', coursesError);
    } else {
      console.log(`✅ Found ${courses?.length || 0} courses`);
      courses?.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.title || c.name || 'Untitled'} - Created: ${c.created_at}`);
      });
    }

    console.log('\n💡 If you see data above but the admin dashboard doesn\'t show it,');
    console.log('   the issue is likely with Supabase RLS policies.');
    console.log('   You may need to create RLS policies that allow admin users to view all data.');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDatabase();
