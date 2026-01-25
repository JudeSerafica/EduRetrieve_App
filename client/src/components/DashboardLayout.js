// components/DashboardLayout.js

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import useAuthStatus from '../hooks/useAuthStatus';
import { FaHome, FaComments, FaBookmark, FaSignOutAlt, FaBars, FaTimes } from 'react-icons/fa';

const DashboardLayout = () => {
  const { user } = useAuthStatus();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      console.log('User logged out');
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error.message);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="dashboard-layout">
      {/* Mobile menu button */}
      <button 
        className="mobile-menu-button"
        onClick={toggleSidebar}
      >
        {sidebarOpen ? <FaTimes /> : <FaBars />}
      </button>

      {/* Sidebar */}
      <div className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src="/assets/eduretrieve-logo.png" alt="EduRetrieve" className="sidebar-logo" />
          <h2>EduRetrieve</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink 
            to="/dashboard/home" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeSidebar}
          >
            <FaHome />
            <span>Home</span>
          </NavLink>
          
          <NavLink 
            to="/dashboard/chats" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeSidebar}
          >
            <FaComments />
            <span>AI Chats</span>
          </NavLink>
          
          <NavLink 
            to="/dashboard/saves" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={closeSidebar}
          >
            <FaBookmark />
            <span>Saved Modules</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" />
              ) : (
                <div className="avatar-placeholder">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="user-details">
              <p className="user-name">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
              </p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          
          <button onClick={handleLogout} className="logout-button">
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}

      {/* Main content */}
      <div className="dashboard-main">
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;