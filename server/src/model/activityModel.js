import { supabase } from '../config/supabaseClient.js';

// ✅ Log user activity
async function logUserActivity(userId, activityType, details = {}) {
  if (!userId || !activityType) {
    throw new Error('User ID and activity type are required.');
  }

  const { error } = await supabase
    .from('user_activities')
    .insert({
      user_id: userId,
      activity_type: activityType,
      details: JSON.stringify(details),
      timestamp: new Date(),
    });

  if (error) {
    console.error('[logUserActivity] ❌', error.message);
    throw new Error('Failed to log user activity.');
  }
}

// ✅ Get user activities for admin
async function getUserActivities(userId = null, limit = 100) {
  let query = supabase
    .from('user_activities')
    .select(`
      *,
      profiles:user_id (
        email,
        fullname
      )
    `)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getUserActivities] ❌', error.message);
    throw new Error('Failed to fetch user activities.');
  }

  return data;
}

// ✅ Get activity summary for admin dashboard
async function getActivitySummary() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    { count: totalUsers, error: usersError },
    { count: totalActivities, error: activitiesError },
    { data: recentActivities, error: recentError },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_activities').select('*', { count: 'exact', head: true }),
    supabase
      .from('user_activities')
      .select(`
        *,
        profiles:user_id (
          email,
          fullname
        )
      `)
      .gte('timestamp', startOfWeek.toISOString())
      .order('timestamp', { ascending: false })
      .limit(50),
  ]);

  if (usersError || activitiesError || recentError) {
    throw new Error('Failed to fetch activity summary.');
  }

  // Calculate activity counts by type
  const activityCounts = {};
  recentActivities.forEach(activity => {
    activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;
  });

  return {
    totalUsers: totalUsers || 0,
    totalActivities: totalActivities || 0,
    recentActivities,
    activityCounts,
  };
}

export {
  logUserActivity,
  getUserActivities,
  getActivitySummary,
};