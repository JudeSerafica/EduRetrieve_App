import React, { useEffect, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { FaBars } from 'react-icons/fa';
import Sidebar from '../components/Sidebar';
import { supabase } from '../supabaseClient';
import '../styles/App.css';

function DashboardLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isOpen, setIsOpen] = useState(!isMobile);
  const navigate = useNavigate();

  useEffect(() => {
    const initSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Error fetching session:', error.message);
        setUser(null);
      } else {
        setUser(session?.user || null);
        if (!session?.user) {
          navigate('/login');
        }
      }

      setLoading(false);
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile && isOpen) {
        setIsOpen(false);
      } else if (!mobile && !isOpen) {
        setIsOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      console.log('User logged out');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error.message);
    }
  };

  if (loading) {
    return <div className="loading-full-page">Loading dashboard layout...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-content-wrapper">
        <Sidebar onLogout={handleLogout} user={user} isOpen={isOpen} setIsOpen={setIsOpen} isMobile={isMobile} />
        {isMobile && (
          <button className="mobile-sidebar-toggle" onClick={() => setIsOpen(!isOpen)}>
            <FaBars />
          </button>
        )}
        <main className="dashboard-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
