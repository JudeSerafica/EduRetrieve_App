import React, { useEffect, useState } from 'react';
import { useNavigate, Outlet, Link } from 'react-router-dom';
import { FaChartBar, FaCog, FaSignOutAlt, FaUserShield } from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import LogoutModal from '../components/LogoutModal';
import '../styles/App.css';

function AdminLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isOpen, setIsOpen] = useState(!isMobile);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navigate = useNavigate();

  const menuItems = [
    { path: '/admin', icon: <FaChartBar />, label: 'Dashboard', exact: true },
    { path: '/admin/settings', icon: <FaCog />, label: 'Settings' },
  ];

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

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await supabase.auth.signOut();
      console.log('Admin logged out');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error.message);
    }
    setShowLogoutModal(false);
  };

  if (loading) {
    return (
      <div className="admin-layout-loading">
        <div className="loading-spinner"></div>
        <p>Loading admin panel...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="admin-layout">
      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${isOpen ? 'open' : 'closed'} ${isMobile ? 'mobile' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-logo">
            <FaUserShield className="admin-logo-icon" />
            {isOpen && <span>Admin Panel</span>}
          </div>
          {isMobile && (
            <button className="admin-sidebar-close" onClick={() => setIsOpen(false)}>
              ×
            </button>
          )}
        </div>

        <nav className="admin-sidebar-nav">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-link ${item.exact ? 'exact' : ''}`}
              onClick={() => isMobile && setIsOpen(false)}
            >
              <span className="admin-nav-icon">{item.icon}</span>
              {isOpen && <span className="admin-nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            <FaSignOutAlt className="admin-nav-icon" />
            {isOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Logout Modal */}
      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
      />

      {/* Mobile Toggle Button */}
      {isMobile && !isOpen && (
        <button className="admin-mobile-toggle" onClick={() => setIsOpen(true)}>
          ☰
        </button>
      )}

      {/* Main Content */}
      <main className="admin-main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
