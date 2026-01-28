import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware to verify admin status
const verifyAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    req.userId = user.id;
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get admin dashboard summary with comprehensive statistics
router.get('/summary', verifyAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today + 'T00:00:00.000Z').toISOString();
    const endOfDay = new Date(today + 'T23:59:59.999Z').toISOString();

    // Get total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Get total modules
    const { count: totalModules } = await supabase
      .from('modules')
      .select('*', { count: 'exact', head: true });

    // Get today's login count (from user_activities with activity_type = 'login')
    const { count: todayLogins } = await supabase
      .from('user_activities')
      .select('*', { count: 'exact', head: true })
      .eq('activity_type', 'login')
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay);

    // Get total activities
    const { count: totalActivities } = await supabase
      .from('user_activities')
      .select('*', { count: 'exact', head: true });

    // Get activity counts by type
    const { data: activityTypeCounts } = await supabase
      .from('user_activities')
      .select('activity_type')
      .gte('timestamp', startOfDay);

    const activityCounts = {};
    if (activityTypeCounts) {
      activityTypeCounts.forEach(activity => {
        activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;
      });
    }

    // Get recent login history (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: loginHistory } = await supabase
      .from('user_activities')
      .select(`
        timestamp,
        profiles:user_id (email, fullname)
      `)
      .eq('activity_type', 'login')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50);

    res.json({
      summary: {
        totalUsers: totalUsers || 0,
        totalModules: totalModules || 0,
        todayLogins: todayLogins || 0,
        totalActivities: totalActivities || 0,
        activityCounts,
        loginHistory: loginHistory || []
      }
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get all users with their modules count
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get modules count for each user
    const usersWithModules = await Promise.all(
      (users || []).map(async (user) => {
        const { count: modulesCount } = await supabase
          .from('modules')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        return {
          ...user,
          modulesCount: modulesCount || 0
        };
      })
    );

    res.json({ users: usersWithModules });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user's modules
router.get('/users/:userId/modules', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ modules: modules || [] });
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({ error: 'Failed to fetch user modules' });
  }
});

// Get all modules grouped by user
router.get('/modules', verifyAdmin, async (req, res) => {
  try {
    // Get all modules without join (no foreign key relationship)
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get all user profiles
    const { data: profiles, profileError } = await supabase
      .from('profiles')
      .select('id, email, fullname');

    if (profileError) {
      console.warn('Could not fetch profiles:', profileError.message);
    }

    // Create a map of user profiles
    const profileMap = {};
    (profiles || []).forEach(profile => {
      profileMap[profile.id] = profile;
    });

    // Add profile info to each module
    const modulesWithProfiles = (modules || []).map(module => ({
      ...module,
      profiles: profileMap[module.user_id] || null
    }));

    res.json({ 
      modules: modulesWithProfiles
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

// Update user role
router.put('/users/:userId/role', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin".' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: `User role updated to ${role}` });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete user and all associated data (cascading delete)
router.delete('/users/:userId', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if trying to delete self
    if (userId === req.userId) {
      return res.status(400).json({ error: 'You cannot delete your own admin account' });
    }

    // Check if user exists
    const { data: user } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    // Perform cascading delete - delete from all related tables first
    // Delete user's activities
    await supabase
      .from('user_activities')
      .delete()
      .eq('user_id', userId);

    // Delete user's chat history
    await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId);

    // Delete user's saved modules
    await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', userId);

    // Delete user's modules (uploaded files)
    const { data: userModules } = await supabase
      .from('modules')
      .select('id')
      .eq('user_id', userId);

    if (userModules && userModules.length > 0) {
      // Delete the modules
      await supabase
        .from('modules')
        .delete()
        .eq('user_id', userId);
    }

    // Delete user's profile
    await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    // Finally, delete from Supabase Auth
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (authError) {
      console.warn('Could not delete auth user (may already be removed):', authError.message);
    }

    console.log(`✅ User ${userId} (${user.email}) and all associated data deleted successfully`);
    res.json({ 
      success: true, 
      message: `User ${user.email} and all associated data deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user: ' + error.message });
  }
});

// Delete a specific module
router.delete('/modules/:moduleId', verifyAdmin, async (req, res) => {
  try {
    const { moduleId } = req.params;

    // Check if module exists
    const { data: module } = await supabase
      .from('modules')
      .select('id, title, user_id')
      .eq('id', moduleId)
      .single();

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Delete the module
    const { error } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Log the activity
    await supabase
      .from('user_activities')
      .insert({
        user_id: req.userId,
        activity_type: 'admin_delete_module',
        details: JSON.stringify({ 
          moduleId, 
          moduleTitle: module.title,
          originalUploaderId: module.user_id 
        }),
        timestamp: new Date()
      });

    res.json({ 
      success: true, 
      message: `Module "${module.title}" deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Failed to delete module: ' + error.message });
  }
});

// Get activities with comprehensive details
router.get('/activities', verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { data: activities, error } = await supabase
      .from('user_activities')
      .select(`
        *,
        profiles:user_id (email, fullname)
      `)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      // Table might not exist
      if (error.code === '42P01') {
        return res.json({ activities: [] });
      }
      return res.status(400).json({ error: error.message });
    }

    res.json({ activities: activities || [] });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get today's activities
router.get('/activities/today', verifyAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(today + 'T00:00:00.000Z').toISOString();
    const endOfDay = new Date(today + 'T23:59:59.999Z').toISOString();

    const { data: activities, error } = await supabase
      .from('user_activities')
      .select(`
        *,
        profiles:user_id (email, fullname)
      `)
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get activity counts by type
    const activityCounts = {};
    (activities || []).forEach(activity => {
      activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;
    });

    res.json({ 
      activities: activities || [],
      activityCounts
    });
  } catch (error) {
    console.error('Error fetching today activities:', error);
    res.status(500).json({ error: 'Failed to fetch today activities' });
  }
});

// Check admin status (for any authenticated user)
router.get('/check', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ isAdmin: false, error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ isAdmin: false, error: 'Invalid token' });
    }

    console.log('Checking admin status for user:', user.id, user.email);

    // Check if user has admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, email, fullname')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // Profile might not exist, treat as non-admin
      console.warn('Profile not found for user:', user.id, profileError);
      return res.json({ isAdmin: false, error: 'Profile not found' });
    }

    console.log('User profile:', profile);
    const isAdmin = profile && profile.role === 'admin';
    console.log('Is admin:', isAdmin, 'Role:', profile?.role);
    res.json({ isAdmin, role: profile?.role });
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ isAdmin: false, error: 'Internal server error' });
  }
});

// Debug endpoint to check user profile
router.get('/debug-profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get full profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(404).json({ 
        error: 'Profile not found',
        userId: user.id,
        userEmail: user.email
      });
    }

    res.json({ 
      user: {
        id: user.id,
        email: user.email
      },
      profile
    });
  } catch (error) {
    console.error('Debug profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set admin role for current user (for testing)
router.post('/set-admin-role', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('Setting admin role for user:', user.id, user.email);

    // Update or create profile with admin role
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        role: 'admin',
        updated_at: new Date().toISOString()
      });

    if (upsertError) {
      console.error('Error setting admin role:', upsertError);
      return res.status(500).json({ error: 'Failed to set admin role: ' + upsertError.message });
    }

    console.log('Admin role set successfully for:', user.email);
    res.json({ success: true, message: 'Admin role set successfully' });
  } catch (error) {
    console.error('Set admin role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MODULE-USER ASSOCIATIONS CRUD OPERATIONS
// ============================================

// Get all modules with user associations (for the Modules by User view)
router.get('/module-user-associations', verifyAdmin, async (req, res) => {
  try {
    const { search, userId, moduleId } = req.query;
    
    // Build modules query conditionally to avoid empty string for UUID field
    let modulesQuery = supabase
      .from('modules')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Only apply userId filter if it's a valid non-empty UUID
    if (userId && userId.trim() !== '') {
      modulesQuery = modulesQuery.eq('user_id', userId);
    }
    
    // Fetch modules and profiles in parallel for faster response
    const [modulesResult, profilesResult] = await Promise.all([
      modulesQuery,
      supabase
        .from('profiles')
        .select('id, email, fullname, role')
    ]);
    
    if (modulesResult.error) {
      return res.status(400).json({ error: modulesResult.error.message });
    }

    const profiles = profilesResult.data || [];
    if (profilesResult.error) {
      console.warn('Could not fetch profiles:', profilesResult.error.message);
    }

    // Create a map of user profiles
    const profileMap = {};
    (profiles || []).forEach(profile => {
      profileMap[profile.id] = profile;
    });

    let modules = modulesResult.data || [];
    
    // Apply search filter if provided
    let filteredModules = modules || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredModules = filteredModules.filter(module => {
        const profile = profileMap[module.user_id];
        const userEmail = profile?.email?.toLowerCase() || '';
        const userName = profile?.fullname?.toLowerCase() || '';
        const moduleTitle = module.title?.toLowerCase() || '';
        const moduleDescription = module.description?.toLowerCase() || '';
        
        return userEmail.includes(searchLower) || 
               userName.includes(searchLower) || 
               moduleTitle.includes(searchLower) ||
               moduleDescription.includes(searchLower);
      });
    }

    // Add profile info to each module
    const modulesWithProfiles = filteredModules.map(m => ({
      ...m,
      profiles: profileMap[m.user_id] || null
    }));

    res.json({
      modules: modulesWithProfiles,
      modulesByUser: [],  // Not used anymore in the table view
      totalCount: modulesWithProfiles.length
    });
  } catch (error) {
    console.error('Error fetching module-user associations:', error);
    res.status(500).json({ error: 'Failed to fetch module-user associations' });
  }
});

// Assign a module to a user (create module-user association)
router.post('/module-user-associations', verifyAdmin, async (req, res) => {
  try {
    const { moduleId, userId, title, description } = req.body;

    // Validation
    if (!moduleId && !userId) {
      return res.status(400).json({ error: 'Either moduleId or userId must be provided' });
    }

    // If both moduleId and userId provided, reassign existing module
    if (moduleId && userId) {
      // Check if module exists
      const { data: existingModule, error: fetchError } = await supabase
        .from('modules')
        .select('id, title, user_id')
        .eq('id', moduleId)
        .single();

      if (fetchError || !existingModule) {
        return res.status(404).json({ error: 'Module not found' });
      }

      // Check if user exists
      const { data: targetUser, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userError || !targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update the module's user assignment
      const { error: updateError } = await supabase
        .from('modules')
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', moduleId);

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }

      // Log the activity
      await supabase
        .from('user_activities')
        .insert({
          user_id: req.userId,
          activity_type: 'admin_reassign_module',
          details: JSON.stringify({
            moduleId,
            moduleTitle: existingModule.title,
            oldUserId: existingModule.user_id,
            newUserId: userId,
            newUserEmail: targetUser.email
          }),
          timestamp: new Date()
        });

      res.json({
        success: true,
        message: `Module "${existingModule.title}" reassigned to ${targetUser.email}`
      });
    }
    // If only userId provided (no moduleId), create a new module for that user
    else if (userId && !moduleId) {
      if (!title) {
        return res.status(400).json({ error: 'Title is required when creating a new module' });
      }

      // Check if user exists
      const { data: targetUser, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id', userId)
        .single();

      if (userError || !targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Create new module for the user
      const { data: newModule, error: createError } = await supabase
        .from('modules')
        .insert({
          title,
          description: description || '',
          user_id: userId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        return res.status(400).json({ error: createError.message });
      }

      // Log the activity
      await supabase
        .from('user_activities')
        .insert({
          user_id: req.userId,
          activity_type: 'admin_create_module',
          details: JSON.stringify({
            moduleId: newModule.id,
            moduleTitle: title,
            assignedToUserId: userId,
            assignedToEmail: targetUser.email
          }),
          timestamp: new Date()
        });

      res.json({
        success: true,
        message: `New module "${title}" created for ${targetUser.email}`,
        module: newModule
      });
    }
    else {
      return res.status(400).json({ error: 'Invalid request. Provide moduleId and/or userId.' });
    }
  } catch (error) {
    console.error('Error creating module-user association:', error);
    res.status(500).json({ error: 'Failed to create module-user association: ' + error.message });
  }
});

// Update module-user association (reassign module to different user)
router.put('/module-user-associations/:moduleId', verifyAdmin, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if module exists
    const { data: existingModule, error: fetchError } = await supabase
      .from('modules')
      .select('id, title, user_id')
      .eq('id', moduleId)
      .single();

    if (fetchError || !existingModule) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Check if target user exists
    const { data: targetUser, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update module assignment
    const { error: updateError } = await supabase
      .from('modules')
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq('id', moduleId);

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Log the activity
    await supabase
      .from('user_activities')
      .insert({
        user_id: req.userId,
        activity_type: 'admin_reassign_module',
        details: JSON.stringify({
          moduleId,
          moduleTitle: existingModule.title,
          oldUserId: existingModule.user_id,
          newUserId: userId,
          newUserEmail: targetUser.email
        }),
        timestamp: new Date()
      });

    res.json({
      success: true,
      message: `Module "${existingModule.title}" reassigned to ${targetUser.email}`
    });
  } catch (error) {
    console.error('Error updating module-user association:', error);
    res.status(500).json({ error: 'Failed to update module-user association: ' + error.message });
  }
});

// Remove module-user association (delete module)
router.delete('/module-user-associations/:moduleId', verifyAdmin, async (req, res) => {
  try {
    const { moduleId } = req.params;

    // Check if module exists
    const { data: module, error: fetchError } = await supabase
      .from('modules')
      .select('id, title, user_id')
      .eq('id', moduleId)
      .single();

    if (fetchError || !module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Get the user's email for logging
    const { data: user } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', module.user_id)
      .single();

    // Delete the module
    const { error: deleteError } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId);

    if (deleteError) {
      return res.status(400).json({ error: deleteError.message });
    }

    // Log the activity
    await supabase
      .from('user_activities')
      .insert({
        user_id: req.userId,
        activity_type: 'admin_delete_module',
        details: JSON.stringify({
          moduleId,
          moduleTitle: module.title,
          originalUserId: module.user_id,
          originalUserEmail: user?.email
        }),
        timestamp: new Date()
      });

    res.json({
      success: true,
      message: `Module "${module.title}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ error: 'Failed to delete module: ' + error.message });
  }
});

// Get all available users (for dropdown selection)
router.get('/available-users', verifyAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, fullname, role')
      .order('email', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ users: users || [] });
  } catch (error) {
    console.error('Error fetching available users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all available modules (for dropdown selection)
router.get('/available-modules', verifyAdmin, async (req, res) => {
  try {
    const { data: modules, error } = await supabase
      .from('modules')
      .select('id, title, user_id')
      .order('title', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ modules: modules || [] });
  } catch (error) {
    console.error('Error fetching available modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

export default router;
