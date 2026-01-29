/**
 * API Configuration and Fetch Utility
 * 
 * This module provides a clean, production-ready pattern for:
 * - Environment-based API base URL configuration
 * - Fetch wrapper with proper error handling and non-JSON responses
 * 
 * Environment Variables:
 * - REACT_APP_API_BASE_URL: Full URL to the backend API (e.g., https://your-backend.railway.app)
 *   - Leave empty for localhost (defaults to relative paths)
 *   - Set in Vercel frontend environment variables for production
 */

// Get API base URL from environment variable
const getApiBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_BASE_URL;
  
  // In development, if no URL is set, use relative paths (works with proxy)
  // In production, this should be set to the deployed backend URL
  return envUrl || '';
};

/**
 * Build the full URL for an API endpoint
 * @param {string} endpoint - The API endpoint path (e.g., '/admin/users')
 * @returns {string} - The full URL with base URL prepended
 */
export const buildApiUrl = (endpoint) => {
  const baseUrl = getApiBaseUrl();
  
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // If base URL is set, prepend it; otherwise use relative path
  if (baseUrl) {
    // Remove trailing slash from base URL and ensure no double slashes
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${cleanBaseUrl}${normalizedEndpoint}`;
  }
  
  return normalizedEndpoint;
};

/**
 * Parse error message from response, handling non-JSON responses
 * @param {Response} response - Fetch response object
 * @param {string} fallbackMessage - Fallback error message
 * @returns {Promise<string>} - Error message string
 */
const parseErrorMessage = async (response, fallbackMessage = 'Request failed') => {
  const contentType = response.headers.get('content-type');
  
  if (contentType && contentType.includes('application/json')) {
    try {
      const data = await response.json();
      return data.error || data.message || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }
  
  // Handle non-JSON responses (like HTML error pages)
  try {
    const text = await response.text();
    // Extract meaningful text from HTML if present
    const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (match) {
      return match[1]; // Return the page title as error
    }
    // Return truncated text as fallback
    return text.slice(0, 200);
  } catch {
    return fallbackMessage;
  }
};

/**
 * Enhanced fetch wrapper for API calls
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed response data
 * @throws {Error} - Error with message from response
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = buildApiUrl(endpoint);
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };
  
  try {
    const response = await fetch(url, mergedOptions);
    
    // Handle HTTP errors
    if (!response.ok) {
      const errorMessage = await parseErrorMessage(response, `HTTP ${response.status}: Request failed`);
      const error = new Error(errorMessage);
      error.status = response.status;
      error.response = response;
      throw error;
    }
    
    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    // Return text if not JSON
    return { message: await response.text() };
    
  } catch (error) {
    // Re-throw with additional context
    if (error.status) {
      // Already a handled API error
      throw error;
    }
    
    // Network errors or other issues
    const enrichedError = new Error(
      error.message || 'Network error. Please check your connection.'
    );
    enrichedError.originalError = error;
    throw enrichedError;
  }
};

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => apiFetch(endpoint, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  }),
  put: (endpoint, body, options = {}) => apiFetch(endpoint, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  patch: (endpoint, body, options = {}) => apiFetch(endpoint, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(body),
  }),
  delete: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
