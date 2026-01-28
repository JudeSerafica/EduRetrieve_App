/**
 * Utility for tracking user activities on the client side
 */

import { supabase } from '../supabaseClient';

/**
 * Track a user activity
 * @param {string} activityType - The type of activity (login, page_view, upload, chat, etc.)
 * @param {object} details - Additional details about the activity
 */
export async function trackActivity(activityType, details = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.warn('[trackActivity] No active session, skipping activity tracking');
      return;
    }

    // Get the auth token
    const { data: { access_token } } = await supabase.auth.getSession();

    const response = await fetch('/api/activity/log', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        activityType,
        details,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[trackActivity] Failed to log activity:', error);
    }
  } catch (error) {
    console.error('[trackActivity] Error tracking activity:', error);
  }
}

/**
 * Track page views automatically
 * @param {string} pageName - The name of the page
 * @param {string} pagePath - The path of the page
 */
export function trackPageView(pageName, pagePath) {
  trackActivity('page_view', {
    page_name: pageName,
    page_path: pagePath,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track chat interactions
 * @param {string} conversationId - The conversation ID
 * @param {string} action - The action (send_message, receive_response, etc.)
 */
export function trackChatInteraction(conversationId, action) {
  trackActivity('chat_interaction', {
    conversation_id: conversationId,
    action,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track file uploads
 * @param {string} moduleId - The uploaded module ID
 * @param {string} moduleName - The module name
 */
export function trackFileUpload(moduleId, moduleName) {
  trackActivity('file_upload', {
    module_id: moduleId,
    module_name: moduleName,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track saves/bookmarks
 * @param {string} moduleId - The saved module ID
 */
export function trackModuleSave(moduleId) {
  trackActivity('module_save', {
    module_id: moduleId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Track search queries
 * @param {string} query - The search query
 * @param {number} resultsCount - Number of results
 */
export function trackSearch(query, resultsCount) {
  trackActivity('search', {
    query,
    results_count: resultsCount,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Set up automatic page view tracking with React Router
 * @param {object} navigate - The useNavigate hook from react-router-dom
 */
export function setupPageViewTracking(navigate) {
  // Track initial page view
  const pathname = window.location.pathname;
  const pageName = pathname.split('/').filter(Boolean).pop() || 'home';
  trackPageView(pageName, pathname);

  // Listen for route changes
  const originalPushState = window.history.pushState;
  window.history.pushState = function(...args) {
    originalPushState.apply(this, args);
    const newPath = args[2];
    if (newPath) {
      const newPageName = newPath.split('/').filter(Boolean).pop() || 'home';
      trackPageView(newPageName, newPath);
    }
  };

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').filter(Boolean).pop() || 'home';
    trackPageView(pageName, currentPath);
  });
}

export default {
  trackActivity,
  trackPageView,
  trackChatInteraction,
  trackFileUpload,
  trackModuleSave,
  trackSearch,
  setupPageViewTracking,
};
