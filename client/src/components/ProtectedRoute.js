import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }

      // Check if user is admin via API
      try {
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
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
      
      setLoading(false);
    };

    checkUserRole();
  }, []);

  if (loading) {
    return <div className="loading-full-page">Loading...</div>;
  }

  // If user is admin, redirect to admin panel
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

export default ProtectedRoute;
