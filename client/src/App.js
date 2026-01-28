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
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }

        const currentPath = window.location.pathname;
        const isOnPublicPage =
          currentPath === '/' ||
          currentPath === '/signup' ||
          currentPath === '/login' ||
          currentPath === '/auth/callback';

        if (isOnPublicPage) {
          // Redirect based on role
          if (userIsAdmin) {
            navigate('/admin', { replace: true });
          } else {
            navigate('/dashboard/home', { replace: true });
          }
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
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }

        // Redirect if needed
        const currentPath = window.location.pathname;
        if (userIsAdmin && currentPath.startsWith('/dashboard')) {
          navigate('/admin', { replace: true });
        } else if (!userIsAdmin && currentPath.startsWith('/admin')) {
          navigate('/dashboard/home', { replace: true });
        }
      } 
      
      checkAuth();
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
