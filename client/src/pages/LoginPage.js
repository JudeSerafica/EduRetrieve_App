import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { trackActivity } from '../utils/activityTracker';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log('LoginPage: User already logged in, checking role...');
        // Check if user is admin
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        console.log('LoginPage: Profile data:', profileData);
        if (profileData?.role === 'admin') {
          console.log('LoginPage: Redirecting admin to /admin');
          navigate('/admin');
        } else {
          console.log('LoginPage: Redirecting user to /dashboard/home');
          navigate('/dashboard/home');
        }
      }
    };
    checkUser();
  }, [navigate]);


  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setUnverifiedUser(false);
    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (loginError) {
        if (loginError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (loginError.message.includes('Email not confirmed')) {
          setUnverifiedUser(true);
          setError('Please verify your email before logging in. Check your inbox for the verification email.');
        } else {
          setError(loginError.message);
        }
        return;
      }

      if (data.user && !data.user.email_confirmed_at) {
        setUnverifiedUser(true);
        setError('Please verify your email before logging in.');
        await supabase.auth.signOut();
        return;
      }

      // Track successful login
      await trackActivity('login', {
        email: email.trim(),
        timestamp: new Date().toISOString(),
      });

      // Check if user is admin via API
      let isAdmin = false;
      try {
        console.log('Checking admin status via API...');
        const response = await fetch('/api/admin/check', {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        console.log('Admin check response status:', response.status);

        if (response.ok) {
          const adminData = await response.json();
          isAdmin = adminData.isAdmin;
          console.log('Admin check result:', isAdmin, 'Full response:', adminData);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.log('Admin check error:', errorData);
          
          // FALLBACK: Check admin status from session email
          console.log('API failed, checking admin status via session email...');
          const userEmail = data.user?.email;
          console.log('LoginPage: User email:', userEmail);
          // Check if this is the admin user
          if (userEmail === 'admin@eduretrieve.com') {
            isAdmin = true;
            console.log('Fallback: User is admin based on email');
          } else {
            console.log('Fallback: User is NOT admin, email:', userEmail);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        
        // FALLBACK: Check admin status from session email
        console.log('API call failed, checking admin status via session email...');
        const userEmail = data.user?.email;
        console.log('LoginPage: User email:', userEmail);
        // Check if this is the admin user
        if (userEmail === 'admin@eduretrieve.com') {
          isAdmin = true;
          console.log('Fallback: User is admin based on email');
        } else {
          console.log('Fallback: User is NOT admin, email:', userEmail);
        }
      }

      console.log('Final isAdmin:', isAdmin, 'User ID:', data.user.id, 'Email:', data.user.email);
      if (isAdmin) {
        console.log('Login redirecting admin to /admin');
        navigate('/admin');
      } else {
        console.log('Login redirecting user to /dashboard/home');
        navigate('/dashboard/home');
      }

    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });

      if (resendError) {
        setError('Failed to resend verification email: ' + resendError.message);
      } else {
        alert('Verification email resent! Please check your inbox.');
      }
    } catch (err) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      alert('Password reset email sent! Please check your inbox.');
    } catch (error) {
      setError('Failed to send password reset email: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-container-img" />
      <div className="auth-form-card">
        <div className="auth-header-flex">
          <h2>Login</h2>
          <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-header-flex-img" />
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter your email"
            />
          </div>
          <div className="form-group">
            <label>Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="Enter your password"
            />
          </div>

          <p>
            <button 
              type="button" 
              onClick={handleForgotPassword}
              disabled={loading}
              className="link-button"
            >
              Forgot password?
            </button>
          </p>
          
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        {error && (
          <div className="auth-message error">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {unverifiedUser && (
          <div className="verification-section">
            <p className="verification-text">
              Haven't received the verification email?
            </p>
            <button 
              onClick={handleResendVerification}
              disabled={loading}
              className="resend-button"
            >
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>
        )}

        <p className="auth-link">
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;