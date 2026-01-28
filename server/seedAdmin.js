/**
 * Script to create an admin account
 * Usage: node seedAdmin.js <email> [password]
 * 
 * Example: node seedAdmin.js admin@example.com MySecurePassword123
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function createAdminAccount(email, password) {
  console.log('🔧 Starting admin account creation...');
  console.log(`📧 Email: ${email}`);
  
  try {
    // Step 1: Create auth user
    console.log('👤 Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Admin User',
        signup_method: 'admin-seed'
      }
    });

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('duplicate key') || authError.message.includes('already been registered')) {
        console.log('⚠️ User already exists in auth. Checking if we need to update role...');
        
        // Get existing user from auth
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        const existingUser = users?.find(u => u.email === email);
        
        if (existingUser) {
          console.log(`✅ Found existing auth user with ID: ${existingUser.id}`);
          
          // Check if user has profile in profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', existingUser.id)
            .single();
          
          if (profile) {
            // Update existing profile to admin
            console.log('📝 Updating existing profile to admin...');
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ role: 'admin' })
              .eq('id', existingUser.id);
            
            if (updateError) {
              console.error('❌ Failed to update profile:', updateError);
              return false;
            }
            console.log('✅ Profile updated to admin!');
          } else {
            // Create profile for existing user
            console.log('📝 Creating profile for existing user...');
            const { error: profileError } = await supabase
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
            
            if (profileError) {
              console.error('❌ Failed to create profile:', profileError);
              return false;
            }
            console.log('✅ Profile created with admin role!');
          }
        }
        
        console.log('✅ Admin account ready!');
        return true;
      }
      
      console.error('❌ Auth error:', authError);
      return false;
    }

    console.log('✅ Auth user created successfully!');
    const userId = authData.user.id;

    // Step 2: Create user profile in profiles table with admin role
    console.log('📝 Creating user profile with admin role...');
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: email,
        username: email.split('@')[0],
        fullname: 'Admin User',
        pfpurl: '',
        role: 'admin',
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      // Try to update if profile exists
      if (profileError.code === '23505' || profileError.message.includes('duplicate key')) {
        await supabase
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', userId);
        console.log('✅ Updated existing profile to admin!');
      } else {
        return false;
      }
    } else {
      console.log('✅ Profile created with admin role!');
    }

    // Step 3: Log the activity
    console.log('📊 Logging admin creation activity...');
    const { error: activityError } = await supabase
      .from('user_activities')
      .insert({
        user_id: userId,
        activity_type: 'admin_created',
        details: JSON.stringify({ method: 'seed-script', timestamp: new Date().toISOString() }),
        timestamp: new Date()
      });

    if (activityError) {
      console.warn('⚠️ Could not log activity:', activityError.message);
    }

    console.log('\\n🎉 Admin account created successfully!');
    console.log(`\\n📋 Admin Credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`\\n🔗 Access the admin dashboard at: /admin`);
    
    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('\\n📋 Admin Account Seeder');
    console.log('========================');
    console.log('Usage: node seedAdmin.js <email> [password]');
    console.log('\\nIf password is not provided, it will be prompted.');
    console.log('\\nExample:');
    console.log('  node seedAdmin.js admin@example.com MySecurePassword123');
    console.log('  node seedAdmin.js admin@example.com');
    
    rl.question('\\nEnter admin email: ', async (email) => {
      if (!email || !email.includes('@')) {
        console.log('❌ Invalid email address');
        rl.close();
        return;
      }
      
      rl.question('Enter admin password: ', async (password) => {
        if (!password || password.length < 6) {
          console.log('❌ Password must be at least 6 characters');
          rl.close();
          return;
        }
        
        await createAdminAccount(email, password);
        rl.close();
      });
    });
  } else {
    const email = args[0];
    const password = args[1];
    
    if (!email || !email.includes('@')) {
      console.log('❌ Invalid email address');
      process.exit(1);
    }
    
    if (!password) {
      console.log('⚠️ No password provided. Using default password: Admin@123');
      await createAdminAccount(email, 'Admin@123');
    } else {
      await createAdminAccount(email, password);
    }
  }
}

main();
