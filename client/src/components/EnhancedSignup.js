import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import API_BASE_URL from '../config';

const EnhancedSignup = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('email');
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Countdown timer for code expiry
  useEffect(() => {
    let timer;
    if (timeRemaining > 0 && step === 'verification') {
      timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setStep('email');
            setError('Verification code expired. Please start over.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeRemaining, step]);
  useEffect(() => {
    let timer;
    if (timeRemaining > 0 && step === 'verification') {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setStep('email');
            setError('Verification code expired. Please start over.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeRemaining, step]);

  // Start signup (send OTP)
  const handleSignup = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please enter email, password, and confirm password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    console.log('🚀 Starting signup process for:', email);

    try {
      console.log('📡 Calling /api/signup...');
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      console.log('📡 Response status:', response.status);
      const result = await response.json();
      console.log('📡 Response data:', result);

      if (!response.ok) {
        console.error('❌ Signup API error:', result);
        throw new Error(result.error || 'Failed to send verification code');
      }

      console.log('✅ Signup successful, moving to verification step');
      setStep('verification');
      setMessage('Verification code sent to your email. Please enter it below.');
      setTimeRemaining(300); // 5 minutes

      // For testing without Gmail, show the code in console
      console.log('🎯 TEST MODE: Check server logs for verification code');
    } catch (err) {
      console.error('❌ Signup error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Verify code
  const handleVerifyCode = async (e) => {
    e.preventDefault();

    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    console.log('🔍 Starting verification process');
    console.log('Email:', email.trim());
    console.log('Code:', verificationCode.trim());

    try {
      console.log('📡 Calling /api/verify...');
      const response = await fetch(`${API_BASE_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: verificationCode.trim(),
          password: password
        }),
      });

      console.log('📡 Verify response status:', response.status);
      const result = await response.json();
      console.log('📡 Verify response data:', result);

      if (!response.ok) {
        console.error('❌ Verification failed:', result);
        throw new Error(result.error || 'Verification failed');
      }

      console.log('✅ Verification successful!');

      // Force profile creation on client side
      console.log('🔄 Ensuring profile exists for user:', result.user?.id);
      if (result.user?.id) {
        try {
          // First delete any existing profile to avoid conflicts
          console.log('🗑️ Deleting any existing profile for user:', result.user.id);
          const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', result.user.id);

          if (deleteError) {
            console.warn('⚠️ Profile delete warning:', deleteError.message);
          }

          // Now create the profile
          console.log('📝 Creating profile via client...');
          const { error: profileErr } = await supabase
            .from('profiles')
            .insert({
              id: result.user.id,
              email: result.user.email,
              username: result.user.email.split('@')[0],
              fullName: '',
              pfpurl: '',
              created_at: new Date().toISOString()
            });

          if (profileErr) {
            console.error('❌ Client profile creation error:', profileErr);
            // Fallback to upsert if insert fails
            if (profileErr.message.includes('duplicate key') || profileErr.code === '23505') {
              console.log('🔄 Fallback: Using upsert for profile creation');
              const { error: upsertErr } = await supabase
                .from('profiles')
                .upsert({
                  id: result.user.id,
                  email: result.user.email,
                  username: result.user.email.split('@')[0],
                  fullName: '',
                  pfpurl: '',
                  created_at: new Date().toISOString()
                }, { onConflict: 'id' });

              if (upsertErr) {
                console.error('❌ Client profile upsert also failed:', upsertErr);
              } else {
                console.log('✅ Client profile upsert succeeded');
              }
            }
          } else {
            console.log('✅ Client profile created successfully');
          }
        } catch (profileError) {
          console.error('❌ Profile creation attempt failed:', profileError);
        }
      }

      setStep('completed');
      setMessage('Signup completed successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      console.error('❌ Verification error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset flow
  const handleStartOver = () => {
    setStep('email');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setError('');
    setMessage('');
    setTimeRemaining(0);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
return (
  <div className="auth-container">
    <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-container-img" />
    <div className="auth-form-cards">
      <div className="auth-header-flex">
        <h2>Create your account</h2>
        <img src="/assets/eduretrieve-logo.png" alt="logo" className="auth-header-flex-img" />
      </div>

      {step === 'email' && (
        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label>Email Address:</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password:</label>
            <div className="password-input-container">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Confirm Password:</label>
            <div className="password-input-container">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {loading && (
            <div className="auth-loading">
              <div className="loading-spinner"></div>
              <span>Sending verification code...</span>
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : 'Send Verification Code'}
          </button>
        </form>
      )}

      {step === 'verification' && (
        <div>
          <div className="verification-success">
            <span className="success-icon">📧</span>
            <span>We've sent a verification code to {email}</span>
          </div>

          <form onSubmit={handleVerifyCode}>
            <div className="form-group">
              <label>Verification Code:</label>
              <input
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength="6"
                required
                disabled={loading}
              />
              {timeRemaining > 0 && (
                <small className="code-timer">
                  Code expires in: {formatTime(timeRemaining)}
                </small>
              )}
            </div>

            <button type="submit" disabled={loading || timeRemaining === 0}>
              {loading ? 'Verifying...' : 'Verify & Create Account'}
            </button>

            <button
              type="button"
              onClick={handleStartOver}
              className="secondary-button"
              disabled={loading}
            >
              Start Over
            </button>
          </form>
        </div>
      )}

      {step === 'completed' && (
        <div className="completion-screen">
          <div className="success-animation">
            <span className="success-icon large">🎉</span>
            <h3>Account Created Successfully!</h3>
            <p>Signup completed successfully! Redirecting to login...</p>
            <div className="loading-spinner small"></div>
          </div>
        </div>
      )}

      {error && (
        <div className="auth-message error">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {message && !error && step !== 'completed' && (
        <div className="auth-message success">
          <span className="success-icon">✅</span>
          <span>{message}</span>
        </div>
      )}

      {step !== 'completed' && (
        <p className="auth-link">
          Already have an account? <a href="/login">Sign in here</a>
        </p>
      )}
    </div>
  </div>
);
};

export default EnhancedSignup;