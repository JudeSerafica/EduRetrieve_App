import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function AdminRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);

      try {
        // Check admin status via API
        const response = await fetch('/api/admin/check', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.isAdmin === true);
        } else {
          // FALLBACK: Check admin status via session email
          const userEmail = session?.user?.email;
          if (userEmail === 'admin@eduretrieve.com') {
            setIsAdmin(true);
            console.log('AdminRoute: Fallback - User is admin based on email');
          } else {
            setIsAdmin(false);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        // FALLBACK: Check admin status via session email
        const userEmail = session?.user?.email;
        if (userEmail === 'admin@eduretrieve.com') {
          setIsAdmin(true);
          console.log('AdminRoute: Fallback - User is admin based on email');
        } else {
          setIsAdmin(false);
        }
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, []);

  if (loading) {
    return (
      <div className="admin-route-loading">
        <div className="loading-spinner"></div>
        <p>Verifying admin access...</p>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated but not admin, redirect to user dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard/home" replace />;
  }

  return children;
}

export default AdminRoute;
