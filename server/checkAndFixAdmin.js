/**
 * Script to check and fix admin role in the database
 * Usage: node checkAndFixAdmin.js <email>
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

async function checkAndFixAdmin(email) {
  console.log(`🔍 Checking admin status for: ${email}`);
  
  try {
    // Get user from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const existingUser = users?.find(u => u.email === email);
    
    if (!existingUser) {
      console.log('❌ User not found in auth');
      return;
    }
    
    console.log(`✅ Found user with ID: ${existingUser.id}`);
    
    // Check profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', existingUser.id)
      .single();
    
    if (profileError) {
      console.log('❌ Profile not found, creating one...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: existingUser.id,
          email: existingUser.email,
          username: existingUser.email?.split('@')[0] || 'admin',
          fullname: 'Admin User',
          pfpurl: '',
          role: 'admin',
          created_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.log('❌ Failed to create profile:', insertError);
      } else {
        console.log('✅ Profile created with admin role!');
      }
    } else {
      console.log('📋 Current profile:', JSON.stringify(profile, null, 2));
      
      if (profile.role === 'admin') {
        console.log('✅ User already has admin role!');
      } else {
        console.log('🔄 Updating role to admin...');
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', existingUser.id);
        
        if (updateError) {
          console.log('❌ Failed to update role:', updateError);
        } else {
          console.log('✅ Role updated to admin!');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node checkAndFixAdmin.js <email>');
  process.exit(1);
}

checkAndFixAdmin(args[0]);
