import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { supabase } from './supabaseClient';
import './styles/App.css';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPassword from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import Chats from './pages/Chats';
import Saves from './pages/Saves';
import HomePageContent from './HomePageContent';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AuthCallback from './components/AuthCallback';
import SearchPage from './pages/SearchPage';
import ProgressAnalyticsPage from './pages/ProgressAnalyticsPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminLayout from './layouts/AdminLayout';

import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function AuthWrapper() {
  const [loadingInitialAuth, setLoadingInitialAuth] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('🔍 App loaded successfully, current path:', window.location.pathname);
    
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (session?.user) {
        // Check if user is admin via API
        let userIsAdmin = false;
        try {
          const response = await fetch('/api/admin/check', {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const adminData = await response.json();
            userIsAdmin = adminData.isAdmin;
          } else {
            // FALLBACK: Check admin status directly from session
            console.log('App: API failed, checking admin status via session...');
            const userEmail = session.user.email;
            const userId = session.user.id;
            console.log('App: User from session:', userId, userEmail);
            // Check if this is the admin user
            if (userEmail === 'admin@eduretrieve.com') {
              userIsAdmin = true;
              console.log('App: Fallback - User is admin based on email');
            }
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          
          // FALLBACK: Check admin status directly from session
          console.log('App: API call failed, checking admin status via session...');
          const userEmail = session?.user?.email;
          const userId = session?.user?.id;
          console.log('App: User from session:', userId, userEmail);
          // Check if this is the admin user
          if (userEmail === 'admin@eduretrieve.com') {
            userIsAdmin = true;
            console.log('App: Fallback - User is admin based on email');
          }
        }

        const currentPath = window.location.pathname;
        const isOnPublicPage =
          currentPath === '/' ||
          currentPath === '/signup' ||
          currentPath === '/login' ||
          currentPath === '/auth/callback';

        if (isOnPublicPage) {
          // Don't auto-redirect from landing page - let user see it first
          // Only redirect from /login or /signup if already logged in
          if (currentPath === '/login' || currentPath === '/signup') {
            if (userIsAdmin) {
              navigate('/admin', { replace: true });
            } else {
              navigate('/dashboard/home', { replace: true });
            }
          }
          // For '/' (landing page), don't redirect - show landing page first
        } else if (userIsAdmin && currentPath.startsWith('/dashboard')) {
          // Admin trying to access user dashboard - redirect to admin
          navigate('/admin', { replace: true });
        } else if (!userIsAdmin && currentPath.startsWith('/admin')) {
          // Non-admin trying to access admin - redirect to user dashboard
          navigate('/dashboard/home', { replace: true });
        }
      }
      setLoadingInitialAuth(false);
    };

    checkAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('App: Auth state changed, event:', _event, 'session exists:', !!session);
      if (session?.user) {
        console.log('App: Auth state change - user logged in');
        // Check if user is admin via API
        let userIsAdmin = false;
        try {
          const response = await fetch('/api/admin/check', {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const adminData = await response.json();
            userIsAdmin = adminData.isAdmin;
            console.log('App: Auth change admin check result:', userIsAdmin);
          } else {
            // FALLBACK: Check admin status directly from session
            console.log('App: API failed, checking admin status via session...');
            const userEmail = session?.user?.email;
            const userId = session?.user?.id;
            console.log('App: User from session:', userId, userEmail);
            // Check if this is the admin user
            if (userEmail === 'admin@eduretrieve.com') {
              userIsAdmin = true;
              console.log('App: Fallback - User is admin based on email');
            }
          }
        } catch (error) {
          console.error('App: Auth change error checking admin status:', error);
          
          // FALLBACK: Check admin status directly from session
          console.log('App: API call failed, checking admin status via session...');
          const userEmail = session?.user?.email;
          const userId = session?.user?.id;
          console.log('App: User from session:', userId, userEmail);
          // Check if this is the admin user
          if (userEmail === 'admin@eduretrieve.com') {
            userIsAdmin = true;
            console.log('App: Fallback - User is admin based on email');
          }
        }

        // Redirect if needed
        const currentPath = window.location.pathname;
        console.log('App: Auth change current path:', currentPath);
        if (userIsAdmin && currentPath.startsWith('/dashboard')) {
          console.log('App: Auth change - admin on user dashboard, redirecting to /admin');
          navigate('/admin', { replace: true });
        } else if (!userIsAdmin && currentPath.startsWith('/admin')) {
          console.log('App: Auth change - non-admin on admin page, redirecting to /dashboard/home');
          navigate('/dashboard/home', { replace: true });
        }
      } else {
        console.log('App: Auth state change - user logged out');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [navigate]);

  if (loadingInitialAuth) {
    return <div className="loading-full-page">Loading application...</div>;
  }

  // Debug log for iframe status
  console.log('🔍 App iframe check:', {
    isInIframe: window.self !== window.top,
    self: window.self,
    top: window.top,
    location: window.location.href
  });

  if (window.self !== window.top) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '1.2rem',
        textAlign: 'center',
        padding: '2rem'
      }}>
        Please open this app in its own tab or window. Running in an iframe may cause authentication issues with OAuth providers.
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePageContent />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="home" element={<DashboardHome />} />
        <Route path="chats" element={<Chats />} />
        <Route path="saves" element={<Saves />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="analytics" element={<ProgressAnalyticsPage />} />
      </Route>

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="" element={<AdminDashboard />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ErrorBoundary>
          <AuthWrapper />
          <ToastContainer position="top-right" autoClose={500} />
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );
}

export default App;