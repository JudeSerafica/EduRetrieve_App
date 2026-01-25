import React, { useState, useEffect } from 'react';
import { FaUserCircle, FaCamera } from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import API_BASE_URL from '../config';

function UserProfile({ user }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [pfpUrl, setPfpUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;

      try {
        const {
          data: { session },
          error
        } = await supabase.auth.getSession();

        if (error) throw error;
        const accessToken = session?.access_token;

        const res = await fetch(`${API_BASE_URL}/api/get-user-profile`, {
          headers: {
            Authorization: `Bearer ${accessToken}`, // ✅ fixed
          },
        });

        const result = await res.json();
        if (res.ok && result.profile) {
          const { username, fullName, pfpUrl } = result.profile;
          setUsername(username || '');
          setFullName(fullName || '');
          setPfpUrl(pfpUrl || '');
        } else {
          console.warn('No profile found:', result.error);
        }
      } catch (err) {
        console.error('Error fetching profile:', err.message);
      }
    };

    fetchUserProfile();
  }, [user]);

  const handlePfpUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    setUploading(true);
    setMessage('');

    // Live preview
    const previewUrl = URL.createObjectURL(file);
    setPfpUrl(previewUrl);

    const fileExt = file.name.split('.').pop();
    const filePath = `avatars/${user.id}.${fileExt}`; // ✅ fixed string interpolation

    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setPfpUrl(data.publicUrl);

      setMessage('✅ Profile picture uploaded. Click "Save Changes" to apply.');
    } catch (err) {
      console.error('❌ Upload failed:', err.message);
      setMessage('❌ Failed to upload picture.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setMessage('');

    console.log('🔄 Starting profile update...');
    console.log('📤 Data to send:', { username, fullName, pfpUrl });

    try {
      const {
        data: { session },
        error
      } = await supabase.auth.getSession();

      if (error) throw error;
      const accessToken = session?.access_token;

      console.log('🔑 Access token exists:', !!accessToken);
      console.log('🔑 Token length:', accessToken ? accessToken.length : 0);

      const requestBody = {
        username,
        fullName,
        pfpUrl,
      };

      console.log('📡 Sending request to: /api/sync-user-profile');
      console.log('📦 Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${API_BASE_URL}/api/sync-user-profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`, // ✅ fixed
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📥 Response status:', response.status);
      console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));

      const result = await response.json();
      console.log('📥 Response body:', result);

      if (!response.ok) throw new Error(result.error || 'Failed to update profile.');

      // Update Supabase user metadata to sync with sidebar display
      console.log('🔄 Updating Supabase user metadata...');
      await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      console.log('✅ Profile update successful');
      setMessage(result.message || '✅ Profile updated!');

      // Re-fetch profile data to update the UI with the latest changes
      console.log('🔄 Re-fetching profile data...');
      const fetchUpdatedProfile = async () => {
        try {
          const {
            data: { session },
            error: sessionError
          } = await supabase.auth.getSession();

          if (sessionError) throw sessionError;
          const accessToken = session?.access_token;

          const res = await fetch(`${API_BASE_URL}/api/get-user-profile`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          const result = await res.json();
          if (res.ok && result.profile) {
            const { username: newUsername, fullName: newFullName, pfpUrl: newPfpUrl } = result.profile;
            console.log('🔄 Updated profile data:', { newUsername, newFullName, newPfpUrl });
            setUsername(newUsername || '');
            setFullName(newFullName || '');
            setPfpUrl(newPfpUrl || '');
          }
        } catch (err) {
          console.error('❌ Error re-fetching profile:', err.message);
        }
      };

      await fetchUpdatedProfile();
      setIsEditing(false);
    } catch (err) {
      console.error('❌ Error updating profile:', err.message);
      console.error('❌ Error details:', err);
      setMessage('❌ Failed to update profile.');
    }
  };

  if (!user) return <p>Please sign in to view your profile.</p>;

  return (
    <div className="profile-panel">
      <h4>Your Profile</h4>
      <div className="profile-pfp-section">
        {pfpUrl ? (
          <img src={pfpUrl} alt="Profile" className="profile-pfp" />
        ) : (
          <FaUserCircle className="profile-pfp-placeholder" />
        )}

        {isEditing && (
          <>
            <label className="pfp-upload-button">
              <FaCamera /> Change
              <input type="file" accept="image/*" onChange={handlePfpUpload} style={{ display: 'none' }} />
            </label>

            {pfpUrl && (
              <button onClick={() => setPfpUrl('')} className="remove-pfp-btn">
                Remove Photo
              </button>
            )}
          </>
        )}
      </div>

      <div className="profile-info-grid">
        <label>Email:</label>
        <input type="text" value={user.email} disabled className="locked-input" />

        <label>Username:</label>
        {isEditing ? (
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
        ) : (
          <span>{username || 'Not set'}</span>
        )}

        <label>Full Name:</label>
        {isEditing ? (
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        ) : (
          <span>{fullName || 'Not set'}</span>
        )}
      </div>

      <div className="profile-actions">
        {isEditing ? (
          <>
            <button onClick={handleSaveProfile} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Save Changes'}
            </button>
            <button onClick={() => setIsEditing(false)} className="cancel-button">Cancel</button>
          </>
        ) : (
          <button onClick={() => setIsEditing(true)}>Edit Profile</button>
        )}
      </div>

      {message && <p className="profile-message">{message}</p>}
    </div>
  );
}

export default UserProfile;
  