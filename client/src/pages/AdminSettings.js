import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import '../styles/App.css';
import './AdminSettings.css';

// Toast Notification Component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span className="toast-message">{message}</span>
    </div>
  );
}

// Modal Component
function Modal({ isOpen, onClose, title, children, confirmText = 'Confirm', onConfirm, danger = false }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {onConfirm && (
            <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Card Component
function SettingsCard({ title, description, children }) {
  return (
    <div className="settings-card">
      <div className="card-header">
        <h3>{title}</h3>
        {description && <p className="card-description">{description}</p>}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

// Form Field Component
function FormField({ label, children, required }) {
  return (
    <div className="form-field">
      <label className="form-label">
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children}
    </div>
  );
}

function AdminSettings() {
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [saveTimeout, setSaveTimeout] = useState(null);
  
  // Profile state
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatar: null,
    avatarPreview: null
  });
  const [originalName, setOriginalName] = useState('');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  // Modal states
  const [activeModal, setActiveModal] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [exportOptions, setExportOptions] = useState({
    profile: true,
    settings: true,
    activity: true,
    content: false,
    messages: false
  });

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        loadUserData(session.user);
      }
    };
    getSession();
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const loadUserData = async (user) => {
    // Load user profile data from users table (using user_id column)
    const { data: profileData, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.log('Profile not found in users table, using defaults');
    }
    
    const name = profileData?.full_name || user.email?.split('@')[0] || '';
    setOriginalName(name);
    
    setProfile({
      name: name,
      email: user.email || '',
      avatar: profileData?.avatar_url || null,
      avatarPreview: profileData?.avatar_url || null
    });
  };

  // Auto-save profile name on change
  const handleNameChange = (e) => {
    const newName = e.target.value;
    setProfile(prev => ({ ...prev, name: newName }));
    
    // Clear previous timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    // Set new timeout for auto-save (debounce 1 second)
    const timeout = setTimeout(() => {
      if (newName !== originalName && newName.trim()) {
        autoSaveProfile(newName);
      }
    }, 1000);
    
    setSaveTimeout(timeout);
  };

  const autoSaveProfile = async (name) => {
    setLoading(true);
    try {
      // Use users table with user_id column
      console.log('DEBUG: Attempting to upsert to users table with:', {
        user_id: session?.user?.id,
        full_name: name.trim(),
        updated_at: new Date().toISOString()
      });
      
      const { error } = await supabase
        .from('users')
        .upsert({
          user_id: session?.user?.id,
          full_name: name.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) {
        console.error('Error saving to users table:', error);
        // Diagnostic: Check if profiles table exists and has different column name
        console.log('DEBUG: Checking profiles table as fallback...');
        const { data: profileCheck, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .limit(1);
        
        if (profileError) {
          console.error('profiles table also failed:', profileError);
        } else if (profileCheck && profileCheck.length > 0) {
          console.log('DEBUG: profiles table exists with columns:', Object.keys(profileCheck[0]));
          console.log('DEBUG: profiles table uses "fullname" not "full_name"');
        }
        throw error;
      }
      
      setOriginalName(name.trim());
      showToast('Profile name auto-saved', 'success');
    } catch (error) {
      console.error('Auto-save error:', error);
      showToast('Failed to auto-save: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .upsert({
          user_id: session?.user?.id,
          full_name: profile.name.trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) {
        console.error('Error saving profile:', error);
        throw error;
      }
      
      setOriginalName(profile.name.trim());
      showToast('Profile updated successfully', 'success');
    } catch (error) {
      showToast('Failed to update profile: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });
      
      if (error) throw error;
      showToast('Password changed successfully', 'success');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      showToast('Failed to change password: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Show loading state
    setLoading(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${session?.user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      // Update local state immediately
      setProfile(prev => ({ ...prev, avatar: publicUrl, avatarPreview: publicUrl }));
      
      // Save to users table
      const { error: saveError } = await supabase
        .from('users')
        .upsert({
          user_id: session?.user?.id,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (saveError) throw saveError;
      
      showToast('Profile picture updated successfully', 'success');
    } catch (error) {
      showToast('Failed to upload avatar: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      showToast('Please type DELETE to confirm', 'error');
      return;
    }
    
    setLoading(true);
    
    try {
      const userId = session?.user?.id;
      
      // Delete user's data from various tables
      const tablesToClear = ['activities', 'modules', 'saves', 'usage_time'];
      
      for (const table of tablesToClear) {
        try {
          await supabase.from(table).delete().eq('user_id', userId);
        } catch (e) {
          console.log(`Table ${table} may not exist or be accessible:`, e.message);
        }
      }
      
      // Update user status instead of deleting (to avoid auth issues)
      await supabase
        .from('users')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'deleted'
        })
        .eq('user_id', userId);
      
      // Sign out the user
      await supabase.auth.signOut();
      
      showToast('Account deleted successfully', 'success');
      
      // Redirect to home page after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
      
    } catch (error) {
      console.error('Delete account error:', error);
      showToast('Failed to delete account: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setActiveModal(null);
      setDeleteConfirmText('');
    }
  };

  const handleExportData = async () => {
    setLoading(true);
    
    try {
      const userId = session?.user?.id;
      const exportData = {
        exportDate: new Date().toISOString(),
        user: {
          id: userId,
          email: profile.email,
          name: profile.name
        }
      };

      // Fetch profile data from users table
      if (exportOptions.profile) {
        const { data: profileData } = await supabase
          .from('users')
          .select('*')
          .eq('user_id', userId)
          .single();
        exportData.profile = profileData;
      }

      // Fetch activities
      if (exportOptions.activity) {
        const { data: activities, error: activityError } = await supabase
          .from('activities')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        
        if (!activityError) {
          exportData.activities = activities || [];
        }
      }

      // Fetch modules
      if (exportOptions.content) {
        const { data: modules, error: modulesError } = await supabase
          .from('modules')
          .select('*')
          .eq('user_id', userId);
        
        if (!modulesError) {
          exportData.modules = modules || [];
        }
      }

      // Fetch saves
      if (exportOptions.content) {
        const { data: saves, error: savesError } = await supabase
          .from('saves')
          .select('*')
          .eq('user_id', userId);
        
        if (!savesError) {
          exportData.saves = saves || [];
        }
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eduretrieve-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export data: ' + error.message, 'error');
    } finally {
      setLoading(false);
      setActiveModal(null);
    }
  };

  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'danger', label: 'Danger Zone', icon: '⚠️' }
  ];

  return (
    <div className="admin-settings">
      {/* Breadcrumbs */}
      <div className="breadcrumbs">
        <span>Home</span>
        <span className="breadcrumb-separator">/</span>
        <span>Admin</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">Settings</span>
      </div>

      <div className="settings-header">
        <h1>Admin Settings</h1>
        <p className="settings-subtitle">Manage your account settings and preferences</p>
      </div>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
          />
        ))}
      </div>

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <nav className="settings-sidebar">
          <ul className="sidebar-nav">
            {tabs.map(tab => (
              <li key={tab.id}>
                <button
                  className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  <span className="nav-label">{tab.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <div className="settings-content">
          {/* Profile Section */}
          {activeTab === 'profile' && (
            <>
              <SettingsCard title="Profile Information" description="Update your personal information and profile picture">
                <div className="profile-section">
                  <div className="avatar-upload">
                    <div className="avatar-preview">
                      {profile.avatarPreview ? (
                        <img src={profile.avatarPreview} alt="Profile" className="avatar-image" />
                      ) : (
                        <div className="avatar-placeholder">
                          {profile.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                      )}
                    </div>
                    <label className="avatar-upload-btn">
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
                      <span>{loading ? 'Uploading...' : 'Upload Photo'}</span>
                    </label>
                    <p className="avatar-help">JPG, GIF or PNG. Max size 2MB</p>
                  </div>

                  <div className="profile-form">
                    <FormField label="Full Name" required>
                      <input
                        type="text"
                        className="form-input"
                        value={profile.name}
                        onChange={handleNameChange}
                        placeholder="Enter your full name"
                      />
                      <p className="form-help">Name auto-saves after 1 second of inactivity</p>
                    </FormField>

                    <FormField label="Email Address" required>
                      <input
                        type="email"
                        className="form-input"
                        value={profile.email}
                        disabled
                        placeholder="your@email.com"
                      />
                      <p className="form-help">Contact support to change your email address</p>
                    </FormField>
                  </div>
                </div>

                <div className="card-actions">
                  <button className="btn btn-primary" onClick={handleSaveProfile} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </SettingsCard>

              <SettingsCard title="Change Password" description="Update your password to keep your account secure">
                <div className="password-form">
                  <FormField label="Current Password">
                    <input
                      type="password"
                      className="form-input"
                      value={passwordData.currentPassword}
                      onChange={e => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="Enter current password"
                    />
                  </FormField>

                  <FormField label="New Password">
                    <input
                      type="password"
                      className="form-input"
                      value={passwordData.newPassword}
                      onChange={e => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter new password"
                    />
                    <p className="form-help">Minimum 8 characters with numbers and special characters</p>
                  </FormField>

                  <FormField label="Confirm New Password">
                    <input
                      type="password"
                      className="form-input"
                      value={passwordData.confirmPassword}
                      onChange={e => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password"
                    />
                  </FormField>
                </div>

                <div className="card-actions">
                  <button className="btn btn-primary" onClick={handlePasswordChange} disabled={loading}>
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </SettingsCard>
            </>
          )}

          {/* Danger Zone Section */}
          {activeTab === 'danger' && (
            <SettingsCard title="Danger Zone" description="Irreversible actions - proceed with caution">
              <div className="danger-zone">
                <div className="danger-item">
                  <div className="danger-info">
                    <h4>Delete Account</h4>
                    <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
                  </div>
                  <button className="btn btn-danger" onClick={() => setActiveModal('delete')}>
                    Delete Account
                  </button>
                </div>

                <div className="danger-item">
                  <div className="danger-info">
                    <h4>Export Data</h4>
                    <p>Download a copy of all your data including settings, preferences, and content.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setActiveModal('export')}>
                    Export Data
                  </button>
                </div>
              </div>
            </SettingsCard>
          )}
        </div>
      </div>

      {/* Delete Account Modal */}
      <Modal
        isOpen={activeModal === 'delete'}
        onClose={() => { setActiveModal(null); setDeleteConfirmText(''); }}
        title="Delete Account"
        confirmText="Delete My Account"
        danger
        onConfirm={handleDeleteAccount}
      >
        <div className="modal-warning">
          <p><strong>This action is irreversible!</strong></p>
          <p>Deleting your account will:</p>
          <ul>
            <li>Permanently remove all your profile data</li>
            <li>Delete all your activities and history</li>
            <li>Remove all saved modules and content</li>
            <li>Cancel any active sessions</li>
          </ul>
          <p>Please type <code>DELETE</code> to confirm.</p>
          <input
            type="text"
            className="form-input"
            placeholder="DELETE"
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
          />
        </div>
      </Modal>

      {/* Export Data Modal */}
      <Modal
        isOpen={activeModal === 'export'}
        onClose={() => setActiveModal(null)}
        title="Export Your Data"
        confirmText="Download Data"
        onConfirm={handleExportData}
      >
        <div className="export-options">
          <p>Select the data you want to include in your export:</p>
          <div className="export-checkboxes">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.profile}
                onChange={e => setExportOptions(prev => ({ ...prev, profile: e.target.checked }))}
              />
              <span>Profile Information</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.settings}
                onChange={e => setExportOptions(prev => ({ ...prev, settings: e.target.checked }))}
              />
              <span>Settings & Preferences</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.activity}
                onChange={e => setExportOptions(prev => ({ ...prev, activity: e.target.checked }))}
              />
              <span>Activity History</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.content}
                onChange={e => setExportOptions(prev => ({ ...prev, content: e.target.checked }))}
              />
              <span>Uploaded Content</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.messages}
                onChange={e => setExportOptions(prev => ({ ...prev, messages: e.target.checked }))}
              />
              <span>Messages & Communications</span>
            </label>
          </div>
          <p className="form-help">A JSON file will be downloaded immediately.</p>
        </div>
      </Modal>
    </div>
  );
}

export default AdminSettings;
