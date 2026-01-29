import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { api } from '../api';
import '../styles/App.css';

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [session, setSession] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Selected user for chart details
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserModules, setSelectedUserModules] = useState([]);

  // Modules by User - Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null);

  // Create/Reassign form data
  const [formData, setFormData] = useState({
    moduleId: '',
    userId: '',
    title: '',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Sorting configuration for Users table
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchDashboardData = useCallback(async (token, showRefresh = false) => {
  if (showRefresh) setRefreshing(true);
  setError('');
  setSuccess('');
  try {
    console.log('Fetching dashboard data via API...');
    
    const endpoints = [
      { name: 'summary', url: '/api/admin/summary' },
      { name: 'users', url: '/api/admin/users' },
      { name: 'modules', url: '/api/admin/modules' }
    ];

    const results = await Promise.all(
      endpoints.map(ep => 
        api.get(ep.url, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
    );

    const summaryData = results[0];
    const usersData = results[1];
    const modulesData = results[2];

    if (summaryData.summary) setSummary(summaryData.summary);
    if (usersData.users) setUsers(usersData.users);
    if (modulesData.modules) setModules(modulesData.modules);

    fetchAvailableUsers();

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    setError('Failed to load dashboard data: ' + error.message);
  } finally {
    setRefreshing(false);
  }
}, []);

  const checkAdminStatus = useCallback(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch('/api/admin/check', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.isAdmin) {
        fetchDashboardData(session.access_token);
      }
    }
  } catch (error) {
    console.error('Error checking admin status:', error);
  }
}, [fetchDashboardData]); // ✅ CORRECT

  // Get session on mount
  useEffect(() => {
  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    if (session) {
      checkAdminStatus();
    }
  };

  getSession();

  const { data: { subscription } } =
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkAdminStatus();
      }
    });

  return () => subscription.unsubscribe();
}, [checkAdminStatus]); // ✅ FIXED

  // Handle sorting for Users table
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get sorted users
  const getSortedUsers = () => {
    const sortedUsers = [...users];
    sortedUsers.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle nested values or special cases
      if (sortConfig.key === 'modulesCount') {
        aVal = a.modulesCount || 0;
        bVal = b.modulesCount || 0;
      }

      // Handle null/undefined
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Handle dates
      if (aVal instanceof Date) aVal = aVal.getTime();
      if (bVal instanceof Date) bVal = bVal.getTime();
      if (typeof aVal === 'string' && !isNaN(Date.parse(aVal))) {
        aVal = new Date(aVal).getTime();
      }
      if (typeof bVal === 'string' && !isNaN(Date.parse(bVal))) {
        bVal = new Date(bVal).getTime();
      }

      // Compare
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortedUsers;
  };

  // Sort indicator component
  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) {
      return <span className="sort-icon">↕</span>;
    }
    return <span className="sort-icon active">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // Handle user click from bar graph
  const handleUserClick = async (user) => {
    if (selectedUser?.id === user.id) {
      // Deselect if clicking same user
      setSelectedUser(null);
      setSelectedUserModules([]);
    } else {
      setSelectedUser(user);
      setSelectedUserModules([]);
      
      // Fetch user's modules
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        // Filter modules from the existing modules array
        const userModules = modules.filter(m => 
          m.user_id === user.id || 
          m.profiles?.id === user.id
        );
        setSelectedUserModules(userModules);
      } catch (err) {
        console.error('Error fetching user modules:', err);
      }
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      setError('');
      setSuccess('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      await api.put(`/api/admin/users/${userId}/role`, 
        { role: newRole },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      setSuccess(`User role updated to ${newRole}`);
      fetchDashboardData(session.access_token);
    } catch (error) {
      console.error('Error updating role:', error);
      setError('Failed to update user role: ' + error.message);
    }
  };
  const handleDeleteUser = async (userId, userEmail) => {
    try {
      setError('');
      setSuccess('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await api.delete(`/api/admin/users/${userId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response) {
        setSuccess(response.message || 'User deleted successfully');
        fetchDashboardData(session.access_token);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user: ' + error.message);
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleDeleteModule = async (moduleId, moduleTitle) => {
    try {
      setError('');
      setSuccess('');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await api.delete(`/api/admin/modules/${moduleId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      setSuccess(response.message || 'Module deleted successfully');
      fetchDashboardData(session.access_token);
    } catch (error) {
      console.error('Error deleting module:', error);
      setError('Failed to delete module: ' + error.message);
    }
  };

  // ============================================
  // MODULE-USER ASSOCIATIONS CRUD OPERATIONS
  // ============================================

  // Fetch available users for dropdowns
  const fetchAvailableUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await api.get('/api/admin/available-users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      setAvailableUsers(response.users || []);
    } catch (error) {
      console.error('Error fetching available users:', error);
    }
  };

  // Fetch filtered modules by user associations
  const fetchModuleUserAssociations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let url = '/api/admin/module-user-associations?';
      if (searchTerm) url += `search=${encodeURIComponent(searchTerm)}&`;
      if (filterUserId) url += `userId=${encodeURIComponent(filterUserId)}`;

      const response = await api.get(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      setModules(response.modules || []);
    } catch (error) {
      console.error('Error fetching module associations:', error);
      setError('Failed to fetch module associations: ' + error.message);
    }
  };

  // Handle search/filter change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    // Debounce search
    const timeoutId = setTimeout(() => {
      fetchModuleUserAssociations();
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const handleFilterUserChange = (e) => {
    setFilterUserId(e.target.value);
    fetchModuleUserAssociations();
  };
  const openReassignModal = (module) => {
    setSelectedModule(module);
    setFormData({ moduleId: module.id, userId: '', title: '', description: '' });
    setShowReassignModal(true);
    fetchAvailableUsers();
  };

  // Handle form input change
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Create module-user association
  const handleCreateAssociation = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setSubmitting(false);
        return;
      }

      await api.post('/api/admin/module-user-associations', formData, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      setSuccess('Association created successfully');
      setShowCreateModal(false);
      fetchModuleUserAssociations();
      fetchDashboardData(session.access_token);
    } catch (error) {
      console.error('Error creating association:', error);
      setError('Failed to create association: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Reassign module to different user
  const handleReassignModule = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setSubmitting(false);
        return;
      }

      await api.put(`/api/admin/module-user-associations/${formData.moduleId}`, 
        { userId: formData.userId },
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      setSuccess('Module reassigned successfully');
      setShowReassignModal(false);
      fetchModuleUserAssociations();
    } catch (error) {
      console.error('Error reassigning module:', error);
      setError('Failed to reassign module: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Close modals
  const closeCreateModal = () => {
    setShowCreateModal(false);
    setFormData({ moduleId: '', userId: '', title: '', description: '' });
    setError('');
  };

  const closeReassignModal = () => {
    setShowReassignModal(false);
    setSelectedModule(null);
    setFormData({ moduleId: '', userId: '', title: '', description: '' });
    setError('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (!session) {
    return (
      <div className="admin-dashboard-container">
        <div className="admin-login-required">
          <h2>🔐 Authentication Required</h2>
          <p>Please log in to access the admin dashboard.</p>
          <a href="/login" className="admin-login-btn">Go to Login</a>
        </div>
      </div>
    );
  }
  
  return (
    <div className="admin-dashboard-container">
      <div className="admin-header">
        <h1>🔧 Admin Dashboard</h1>
        <div className="admin-header-actions">
          <span className="admin-welcome">
            Welcome, {session.user.email}
          </span>
          <button 
            onClick={() => fetchDashboardData(session.access_token, true)} 
            className="admin-refresh-btn"
            disabled={refreshing}
          >
            {refreshing ? '⟳ Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-error-message">
          <span>⚠️</span> {error}
          <button onClick={() => setError('')} className="dismiss-btn">×</button>
        </div>
      )}
      {success && (
        <div className="admin-success-message">
          <span>✅</span> {success}
          <button onClick={() => setSuccess('')} className="dismiss-btn">×</button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <h3>⚠️ Confirm Deletion</h3>
            <p>
              {confirmDelete.type === 'user' 
                ? `Are you sure you want to delete user <strong>${confirmDelete.name}</strong>? This will permanently remove all their data including modules, activities, and chat history. This action cannot be undone!`
                : `Are you sure you want to delete module <strong>${confirmDelete.name}</strong>? This action cannot be undone!`
              }
            </p>
            <div className="admin-modal-actions">
              <button 
                className="admin-modal-btn cancel"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button 
                className="admin-modal-btn confirm"
                onClick={() => confirmDelete.type === 'user' 
                  ? handleDeleteUser(confirmDelete.id, confirmDelete.name)
                  : handleDeleteModule(confirmDelete.id, confirmDelete.name)
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Module Modal */}
      {showCreateModal && (
        <div className="admin-modal-overlay" onClick={closeCreateModal}>
          <div className="admin-modal admin-form-modal" onClick={e => e.stopPropagation()}>
            <h3>➕ Create New Module</h3>
            <form onSubmit={handleCreateAssociation}>
              <div className="form-group">
                <label>Assign to User *</label>
                <select
                  name="userId"
                  value={formData.userId}
                  onChange={handleFormChange}
                  required
                  className="form-select"
                >
                  <option value="">Select a user</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.email} {user.fullname ? `(${user.fullname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Module Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleFormChange}
                  required
                  placeholder="Enter module title"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  placeholder="Enter module description (optional)"
                  className="form-textarea"
                  rows="3"
                />
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-modal-btn cancel"
                  onClick={closeCreateModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-modal-btn confirm"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Module Modal */}
      {showReassignModal && selectedModule && (
        <div className="admin-modal-overlay" onClick={closeReassignModal}>
          <div className="admin-modal admin-form-modal" onClick={e => e.stopPropagation()}>
            <h3>🔄 Reassign Module</h3>
            <div className="current-assignment">
              <p><strong>Current Module:</strong> {selectedModule.title}</p>
              <p><strong>Current Owner:</strong> {selectedModule.userId}</p>
            </div>
            <form onSubmit={handleReassignModule}>
              <div className="form-group">
                <label>Reassign to User *</label>
                <select
                  name="userId"
                  value={formData.userId}
                  onChange={handleFormChange}
                  required
                  className="form-select"
                >
                  <option value="">Select a new user</option>
                  {availableUsers
                    .filter(u => u.id !== selectedModule.userId)
                    .map(user => (
                      <option key={user.id} value={user.id}>
                        {user.email} {user.fullname ? `(${user.fullname})` : ''}
                      </option>
                    ))}
                </select>
              </div>
              {error && <div className="form-error">{error}</div>}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-modal-btn cancel"
                  onClick={closeReassignModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-modal-btn confirm"
                  disabled={submitting}
                >
                  {submitting ? 'Reassigning...' : 'Reassign Module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button 
          className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users ({users.length})
        </button>
        <button 
          className={`admin-tab ${activeTab === 'modules' ? 'active' : ''}`}
          onClick={() => setActiveTab('modules')}
        >
          📁 Modules ({modules.length})
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'overview' && (
          <div className="admin-overview">
            {/* Stats Grid */}
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <h3>Total Users</h3>
                  <p className="stat-number">{summary?.totalUsers || 0}</p>
                </div>
              </div>
              <div className="admin-stat-card">
                <div className="stat-icon">📁</div>
                <div className="stat-info">
                  <h3>Total Modules</h3>
                  <p className="stat-number">{summary?.totalModules || 0}</p>
                </div>
              </div>
            </div>

            {/* User Module Upload Bar Graph */}
            <div className="admin-section">
              <h2>📊 User Module Uploads</h2>
              <div className="horizontal-bar-graph-container">
                <div className="bar-graph-section">
                  <div className="bar-graph-scroll">
                    {users.length > 0 ? (
                      <div className="bar-graph-container">
                        {users
                          .sort((a, b) => (b.modulesCount || 0) - (a.modulesCount || 0))
                          .map((user, index) => {
                            const maxModules = Math.max(...users.map(u => u.modulesCount || 0), 1);
                            const percentage = ((user.modulesCount || 0) / maxModules) * 100;
                            return (
                              <div 
                                key={user.id || index} 
                                className={`bar-graph-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                                onClick={() => handleUserClick(user)}
                              >
                                <div className="bar-label">
                                  <span className="user-name">{user.fullname || user.email?.split('@')[0] || 'Unknown'}</span>
                                  <span className="module-count">{user.modulesCount || 0} modules</span>
                                </div>
                                <div className="bar-track">
                                  <div 
                                    className="bar-fill" 
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="no-data">No user data available</p>
                    )}
                  </div>
                </div>
                
                {/* User Details Panel */}
                <div className="user-details-panel">
                  {selectedUser ? (
                    <div className="user-details-content">
                      <h3>👤 User Details</h3>
                      <div className="user-info">
                        <p><strong>Name:</strong> {selectedUser.fullname || 'N/A'}</p>
                        <p><strong>Email:</strong> {selectedUser.email || 'N/A'}</p>
                        <p><strong>Role:</strong> <span className={`role-badge ${selectedUser.role}`}>{selectedUser.role || 'user'}</span></p>
                        <p><strong>Modules:</strong> {selectedUser.modulesCount || 0}</p>
                        <p><strong>Joined:</strong> {selectedUser.created_at ? formatDate(selectedUser.created_at) : 'N/A'}</p>
                      </div>
                      <h4>📁 Recent Modules</h4>
                      {selectedUserModules.length > 0 ? (
                        <ul className="user-modules-list">
                          {selectedUserModules.slice(0, 5).map(module => (
                            <li key={module.id}>
                              <span className="module-title">{module.title}</span>
                              <span className="module-date">{formatDate(module.created_at)}</span>
                            </li>
                          ))}
                          {selectedUserModules.length > 5 && (
                            <li className="more-modules">
                              +{selectedUserModules.length - 5} more modules
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="no-modules">No modules found</p>
                      )}
                    </div>
                  ) : (
                    <div className="no-user-selected">
                      <p>👈 Click on a bar to view user details</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="admin-users">
            <div className="users-header">
              <h2>👥 All Users</h2>
              <div className="users-count">
                Total: {users.length} user{users.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="users-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('email')} className="sortable-column">
                      Email <SortIcon column="email" />
                    </th>
                    <th onClick={() => handleSort('fullname')} className="sortable-column">
                      Full Name <SortIcon column="fullname" />
                    </th>
                    <th onClick={() => handleSort('modulesCount')} className="sortable-column modules-col">
                      <span className="modules-header-content">
                        📁 Modules <SortIcon column="modulesCount" />
                      </span>
                    </th>
                    <th onClick={() => handleSort('role')} className="sortable-column">
                      Role <SortIcon column="role" />
                    </th>
                    <th onClick={() => handleSort('created_at')} className="sortable-column">
                      Created At <SortIcon column="created_at" />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedUsers().map((user) => (
                    <tr key={user.id || user.user_id}>
                      <td className="email-cell">
                        <span className="user-email-main">{user.email}</span>
                      </td>
                      <td>{user.fullname || 'N/A'}</td>
                      <td className="modules-cell">
                        <div className="module-count-display">
                          <span className={`module-count-badge ${user.modulesCount > 0 ? 'has-modules' : 'no-modules'}`}>
                            {user.modulesCount || 0}
                          </span>
                          {user.modulesCount > 0 && (
                            <span className="module-count-label">
                              module{user.modulesCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge ${user.role}`}>
                          {user.role || 'user'}
                        </span>
                      </td>
                      <td className="date-cell">{user.created_at ? formatDate(user.created_at) : 'N/A'}</td>
                      <td className="action-buttons">
                        {user.role !== 'admin' ? (
                          <>
                            <button 
                              className="admin-action-btn promote"
                              onClick={() => handleUpdateRole(user.user_id || user.id, 'admin')}
                              title="Promote to Admin"
                            >
                              ⬆️
                            </button>
                            <button 
                              className="admin-action-btn delete"
                              onClick={() => setConfirmDelete({ 
                                type: 'user', 
                                id: user.user_id || user.id, 
                                name: user.email 
                              })}
                              title="Delete User"
                            >
                              🗑️
                            </button>
                          </>
                        ) : (
                          <button 
                            className="admin-action-btn demote"
                            onClick={() => handleUpdateRole(user.user_id || user.id, 'user')}
                            title="Demote to User"
                          >
                            ⬇️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <p className="no-data">No users found</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'modules' && (
          <div className="admin-modules">
            <div className="modules-header">
              <h2>📁 Modules</h2>
              <div className="modules-actions">
              </div>
            </div>

            {/* Search and Filter Section */}
            <div className="modules-search-filter">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search by user name, email, or module title..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <div className="filter-box">
                <select
                  value={filterUserId}
                  onChange={handleFilterUserChange}
                  className="filter-select"
                >
                  <option value="">All Users</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.email} {user.fullname ? `(${user.fullname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results count */}
            <div className="modules-count">
              Showing {modules.length} module{modules.length !== 1 ? 's' : ''}
            </div>

            {/* Modules Table */}
            <div className="modules-table-container">
              {modules.length > 0 ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Description</th>
                      <th>Uploaded By</th>
                      <th>Created At</th>
                      <th>Updated At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module.id}>
                        <td className="module-title-cell">
                          <span className="module-title-text">{module.title}</span>
                        </td>
                        <td className="module-description-cell">
                          <span className="module-description-text">
                            {module.description && module.description.length > 100
                              ? `${module.description.substring(0, 100)}...`
                              : module.description || 'No description'}
                          </span>
                        </td>
                        <td className="module-uploader-cell">
                          <div className="uploader-info">
                            <span className="uploader-email">
                              {module.profiles?.email || 'Unknown User'}
                            </span>
                            <span className="uploader-name">
                              {module.profiles?.fullname || ''}
                            </span>
                          </div>
                        </td>
                        <td className="module-date-cell">
                          {module.created_at ? formatDate(module.created_at) : 'N/A'}
                        </td>
                        <td className="module-date-cell">
                          {module.updated_at ? formatDate(module.updated_at) : 'N/A'}
                        </td>
                        <td className="module-actions-cell">
                          <div className="action-buttons">
                            <button
                              className="admin-action-btn reassign"
                              onClick={() => openReassignModal(module)}
                              title="Reassign to different user"
                            >
                              🔄
                            </button>
                            <button
                              className="admin-action-btn delete"
                              onClick={() => setConfirmDelete({
                                type: 'module',
                                id: module.id,
                                name: module.title
                              })}
                              title="Delete Module"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="no-data-container">
                  <p className="no-data">No modules found</p>
                  <p className="no-data-hint">Try adjusting your search or filters, or create a new module.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;