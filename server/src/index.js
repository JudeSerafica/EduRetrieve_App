import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// Import chat routes
import chatRoutes from './routes/chatRoutes.js';

// Import admin routes
import adminRoutes from './routes/adminRoutes.js';

console.log('🚀 Server index.js loaded successfully');
console.log('🔥 Loading routes...');

const app = express();
const upload = multer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize services with error handling
let groq, googleClient, supabase, transporter;

try {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
} catch (error) {
  console.warn('Failed to initialize Groq client:', error.message);
}

try {
  googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
} catch (error) {
  console.warn('Failed to initialize Google OAuth client:', error.message);
}

try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ';
  
  console.log('🔧 Supabase configuration:');
  console.log('   - URL configured:', supabaseUrl ? 'Yes' : 'No');
  console.log('   - Key configured:', supabaseKey ? 'Yes (length: ' + supabaseKey.length + ')' : 'No');
  
  supabase = createClient(supabaseUrl, supabaseKey);
  
  // Test Supabase connection
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn('⚠️ Supabase connection test failed:', error.message);
    } else {
      console.log('✅ Supabase client initialized successfully');
    }
  }).catch(err => {
    console.warn('⚠️ Supabase connection test error:', err.message);
  });
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error);
  supabase = null;
}

try {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'judskie198@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'afybzhvvmoioblfu',
    },
    tls: {
      rejectUnauthorized: false
    }
  });
} catch (error) {
  console.warn('Failed to initialize email transporter:', error.message);
}

const allowedOrigins = [
  'http://localhost:3000', // For development
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.FRONTEND_URL, // Add this env var in Vercel if needed
  process.env.CLIENT_URL, // For separate client deployment
  'https://edu-retrieve-app.vercel.app' // Your deployed client URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount chat routes
app.use('/api/chat', chatRoutes);

// Mount admin routes
console.log('🔥 Registering admin routes at /api/admin...');
app.use('/api/admin', adminRoutes);
console.log('✅ Admin routes registered');

// Test route
app.get('/api/test', (req, res) => {
  console.log('🔥 Test route hit!');
  res.json({ message: 'Test route working!' });
});

// =========================
// 📧 EMAIL-BASED SIGNUP ROUTES
// =========================

// Step 1: Initiate email-based signup (send verification code)
app.post('/api/signup', async (req, res) => {
  console.log('🔥 /api/signup route hit!', req.body);
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase.auth.admin.listUsers();
    const userExists = existingUser.users.some(user => user.email === email);

    if (userExists) {
      return res.status(400).json({ error: 'User already exists. Please log in instead.' });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store verification data
    verificationCodes.set(email, {
      code: verificationCode,
      expiresAt,
      password, // Store password temporarily
      action: 'email-signup'
    });

    console.log('🔐 Verification code generated for email signup:', email);

    // Send verification email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
          <h1>EduRetrieve</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>Verify Your Email</h2>
          <p>Hi there!</p>
          <p>Thank you for signing up for EduRetrieve. To complete your registration, please enter this verification code:</p>

          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #007bff; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 3px;">
              ${verificationCode}
            </div>
          </div>

          <p><strong>This code will expire in 5 minutes.</strong></p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"EduRetrieve" <${process.env.GMAIL_USER || 'judskie198@gmail.com'}>`,
          to: email,
          subject: 'Verify Your EduRetrieve Account',
          html: emailHtml,
        });
        console.log('✅ Verification email sent to:', email);
      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError);
        verificationCodes.delete(email); // Clean up on email failure
        return res.status(500).json({ error: 'Failed to send verification email' });
      }
    } else {
      console.warn('Email transporter not initialized, skipping email send');
      return res.status(500).json({ error: 'Email service not available' });
    }

    // Clean up expired codes
    setTimeout(() => {
      if (verificationCodes.has(email)) {
        verificationCodes.delete(email);
        console.log('🗑️ Expired verification code cleaned up for:', email);
      }
    }, 5 * 60 * 1000);

    res.status(200).json({ message: 'Verification code sent to your email' });
  } catch (error) {
    console.error('❌ Signup initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate signup' });
  }
});

// Step 2: Verify code and create account
app.post('/api/verify', async (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ error: 'Email, verification code, and password are required' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const verificationData = verificationCodes.get(email);

    if (!verificationData) {
      return res.status(400).json({ error: 'Verification code expired or not found. Please restart the signup process.' });
    }

    if (verificationData.action !== 'email-signup') {
      return res.status(400).json({ error: 'Invalid verification type' });
    }

    if (Date.now() > verificationData.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({ error: 'Verification code has expired. Please restart the signup process.' });
    }

    if (verificationData.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        signup_method: 'email'
      }
    });

    if (authError) {
      console.error('❌ Supabase signup error:', authError);

      if (authError.message.includes('duplicate key value')) {
        return res.status(400).json({ error: 'User already exists. Please log in instead.' });
      }

      return res.status(400).json({ error: authError.message });
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();

    if (!existingProfile) {
      // Create profile in database only if it doesn't exist
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email,
          username: email.split('@')[0],
          fullname: '',
          pfpurl: '',
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        console.error('❌ Profile creation error:', profileError);
        // Don't fail the entire signup if profile creation fails
        console.warn('⚠️ Continuing signup despite profile creation failure:', profileError.message);
      } else {
        console.log('✅ Profile created successfully');
      }
    } else {
      console.log('ℹ️ Profile already exists, skipping creation');
    }

    // Create a session for the new user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      console.error("❌ Session creation error:", signInError);
      return res.status(400).json({ error: signInError.message });
    }

    verificationCodes.delete(email);

    // Send back session so frontend can set it
    res.status(200).json({
      message: 'Signup completed successfully!',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: '', // Keep camelCase for frontend compatibility
      },
      session: signInData.session
    });

  } catch (error) {
    console.error('❌ Email signup verification error:', error);
    res.status(500).json({
      error: 'Failed to complete signup',
      details: error.message
    });
  }
});

const verificationCodes = new Map();

const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const generateContent = async (prompt, retries = 3) => {
  if (!groq) {
    throw new Error("AI service not initialized. Please check GROQ_API_KEY.");
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant", // Fast and free model
    });

    return chatCompletion.choices[0]?.message?.content || "";
  } catch (error) {
    throw new Error("Failed to generate content from AI.");
  }
};

const authenticateToken = async (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split('Bearer ')[1];
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

app.post('/api/save-module', authenticateToken, async (req, res) => {
  try {
    const { user_id, module_id } = req.body;

    const authenticatedUserId = req.user.id;

    if (!module_id) {
      return res.status(400).json({
        error: 'module_id is required'
      });
    }

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const { data: alreadySaved } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', authenticatedUserId)
      .eq('module_id', module_id)
      .single();

    if (alreadySaved) {
      return res.status(200).json({
        message: 'Module already saved',
        data: alreadySaved
      });
    }

    const { data, error } = await supabase
      .from('save_modules')
      .insert([{
        user_id: authenticatedUserId,
        module_id: module_id,
        saved_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({
          message: 'Module already saved by this user',
          data: null
        });
      }

      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Module saved successfully',
      data: data[0]
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to save module: ' + error.message });
  }
});

app.post('/api/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;
    const authenticatedUserId = req.user.id;

    if (!module_id) {
      return res.status(400).json({
        error: 'module_id is required'
      });
    }

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', authenticatedUserId)
      .eq('module_id', module_id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Module unsaved successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

app.post('/api/auth/google/signup', async (req, res) => {
  if (!googleClient) {
    return res.status(500).json({ error: 'Google OAuth service not initialized' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    console.log('Vercel URL:', process.env.VERCEL_URL);
    console.log('Redirect URI for OAuth:', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/auth/callback` : 'http://localhost:3000/auth/callback');

    const authUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: JSON.stringify({ email, action: 'signup' }),
      prompt: 'consent'
    });

    res.status(200).json({
      message: 'Redirect to Google for authorization',
      authUrl,
      email
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});


app.post('/api/auth/google/callback', async (req, res) => {
  console.log('Google callback POST received:', {
    body: req.body,
    headers: req.headers
  });

  if (!googleClient) {
    return res.status(500).json({ error: 'Google OAuth service not initialized' });
  }

  const { code, state } = req.body;

  if (!code || !state) {
    return res.status(400).json({
      error: 'Missing authorization code or state',
      details: 'Both code and state parameters are required'
    });
  }

  try {
    let parsedState;
    try {
      parsedState = JSON.parse(state);
    } catch (parseError) {
      return res.status(400).json({
        error: 'Invalid state parameter',
        details: 'Could not parse state JSON'
      });
    }

    const { email: originalEmail, action } = parsedState;

    if (!originalEmail) {
      return res.status(400).json({
        error: 'Invalid state: missing email',
        details: 'State parameter must contain email'
      });
    }

    let tokens;
    try {
      const redirectUri = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/auth/callback` : 'http://localhost:3000/auth/callback';
      console.log('Using redirect_uri for token exchange:', redirectUri);

      const tokenResponse = await googleClient.getToken({
        code,
        redirect_uri: redirectUri
      });
      tokens = tokenResponse.tokens;
    } catch (tokenError) {
      return res.status(400).json({
        error: 'Failed to exchange authorization code',
        details: tokenError.message
      });
    }

    googleClient.setCredentials(tokens);

    let googleUserInfo;
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Google API responded with status ${response.status}`);
      }

      googleUserInfo = await response.json();
    } catch (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch user info from Google',
        details: fetchError.message
      });
    }

    if (googleUserInfo.email !== originalEmail) {
      return res.status(400).json({
        error: 'Email mismatch. Please use the same email address.',
        details: `Expected ${originalEmail}, got ${googleUserInfo.email}`
      });
    }

    if (!googleUserInfo.verified_email) {
      return res.status(400).json({
        error: 'Google email is not verified. Please verify your email with Google first.'
      });
    }

    const verificationCode = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    verificationCodes.set(originalEmail, {
      code: verificationCode,
      expiresAt,
      googleUserInfo,
      action
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #007bff; color: white; padding: 20px; text-align: center;">
          <h1>EduRetrieve</h1>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa;">
          <h2>Complete Your Registration</h2>
          <p>Hi ${googleUserInfo.name}!</p>
          <p>Your Google account has been verified successfully. To complete your EduRetrieve registration, please enter this verification code:</p>

          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #007bff; color: white; padding: 15px 30px; border-radius: 8px; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 3px;">
              ${verificationCode}
            </div>
          </div>

          <p><strong>This code will expire in 10 minutes.</strong></p>
          <p>Google Account Details:</p>
          <ul>
            <li>Email: ${googleUserInfo.email}</li>
            <li>Name: ${googleUserInfo.name}</li>
            <li>Verified: Yes</li>
          </ul>
        </div>
      </div>
    `;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"EduRetrieve" <${process.env.GMAIL_USER || 'judskie198@gmail.com'}>`,
          to: originalEmail,
          subject: 'Complete Your EduRetrieve Registration',
          html: emailHtml,
        });
      } catch (emailError) {
        console.warn('Email sending failed:', emailError.message);
      }
    } else {
      console.warn('Email transporter not initialized, skipping email send');
    }

    setTimeout(() => {
      if (verificationCodes.has(originalEmail)) {
        verificationCodes.delete(originalEmail);
      }
    }, 10 * 60 * 1000);

    res.status(200).json({
      message: 'Google verification successful. Check your email for the final verification code.',
      email: originalEmail,
      name: googleUserInfo.name,
      googleVerified: true,
      codeExpires: new Date(expiresAt).toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to process Google authentication',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/auth/verify-signup-code', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({
      error: 'Email, verification code, and password are required'
    });
  }

  try {
    const verificationData = verificationCodes.get(email);

    if (!verificationData) {
      return res.status(400).json({
        error: 'Verification code expired or not found. Please restart the signup process.'
      });
    }

    if (Date.now() > verificationData.expiresAt) {
      verificationCodes.delete(email);
      return res.status(400).json({
        error: 'Verification code has expired. Please restart the signup process.'
      });
    }

    if (verificationData.code !== code) {
      return res.status(400).json({
        error: 'Invalid verification code. Please check and try again.'
      });
    }

    const userMeta = verificationData.googleUserInfo || {};

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: userMeta.name || '',
        first_name: userMeta.given_name || '',
        last_name: userMeta.family_name || '',
        avatar_url: userMeta.picture || '',
        google_verified: true,
        google_id: userMeta.id || ''
      }
    });

    if (authError) {
      console.error('Auth Error Details:', {
        code: authError.code,
        message: authError.message,
        details: authError.details
      });

      if (authError.message.includes('duplicate key value') ||
          authError.message.includes('already registered') ||
          authError.code === 'user_already_exists') {
        return res.status(400).json({
          error: 'User already exists. Please log in instead.'
        });
      }

      return res.status(500).json({ error: 'Database error creating new user' });
    }

    // ✅ FIXED: Changed fullName to fullname, pfpUrl to pfpurl
    const profileData = {
      id: authData.user.id,
      email,
      username: userMeta.given_name || email.split('@')[0],
      fullname: userMeta.name || '',
      pfpurl: userMeta.picture || '',
      google_verified: true,
      google_id: userMeta.id || '',
      created_at: new Date().toISOString()
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert([profileData]);

    if (profileError) {
      console.error('Profile Error Details:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details
      });

      if (profileError.code === '23505' || profileError.message.includes('duplicate key')) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            email,
            username: userMeta.given_name || email.split('@')[0],
            fullname: userMeta.name || '',
            pfpurl: userMeta.picture || '',
            google_verified: true,
            google_id: userMeta.id || '',
            updated_at: new Date().toISOString()
          })
          .eq('id', authData.user.id);

        if (updateError) {
          console.error('Profile Update Error:', updateError);
          return res.status(500).json({ error: 'Database error creating new user' });
        }
      } else {
        return res.status(500).json({ error: 'Database error creating new user' });
      }
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      return res.status(400).json({ error: signInError.message });
    }

    verificationCodes.delete(email);

    res.status(200).json({
      message: 'Signup completed successfully!',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: userMeta.name || '', // This is just response data, not database
        avatar: userMeta.picture || '',
        googleVerified: true
      },
      session: signInData.session
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to complete signup',
      details: error.message
    });
  }
});

app.post('/api/auth/check-user-status', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
      return res.status(500).json({ error: 'Failed to check user status' });
    }

    const user = users.find(u => u.email === email.trim().toLowerCase());

    if (!user) {
      return res.status(404).json({
        exists: false,
        message: 'No account found with this email'
      });
    }

    const isEmailConfirmed = !!user.email_confirmed_at;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    res.status(200).json({
      exists: true,
      emailConfirmed: isEmailConfirmed,
      hasProfile: !!profile,
      user: {
        id: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to check user status' });
  }
});

app.post('/api/auth/sync-profile-on-login', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  const { userId, email, userData } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ error: 'User ID and email are required' });
  }

  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    const authUser = users.find(u => u.id === userId);
    const userMetadata = authUser?.user_metadata || {};

    const { data: existingProfile, error: selectError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    // ✅ FIXED: Changed existingProfile?.fullName to existingProfile?.fullname
    const fullname = userMetadata.full_name ||
                    userData?.full_name ||
                    userData?.name ||
                    existingProfile?.fullname ||
                    email.split('@')[0].split('.').map(part =>
                      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
                    ).join(' ');

    const username = userMetadata.first_name ||
                    userData?.first_name ||
                    fullname.split(' ')[0] ||
                    email.split('@')[0];

    // ✅ FIXED: Changed existingProfile?.pfpUrl to existingProfile?.pfpurl
    const pfpurl = userMetadata.avatar_url ||
                  userData?.avatar_url ||
                  userData?.picture ||
                  existingProfile?.pfpurl ||
                  '';

    // ✅ FIXED: Changed fullName to fullname, pfpUrl to pfpurl
    const profileData = {
      id: userId,
      email: email,
      username: username,
      fullname: fullname,
      pfpurl: pfpurl,
      google_verified: userMetadata.google_verified || userData?.google_verified || false,
      google_id: userMetadata.google_id || userData?.google_id || null,
      updated_at: new Date().toISOString()
    };

    if (!existingProfile) {
      profileData.created_at = new Date().toISOString();
    }

    const { data: upsertedProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert([profileData])
      .select()
      .single();

    if (upsertError) {
      throw upsertError;
    }

    res.status(200).json({
      message: existingProfile ? 'Profile updated successfully' : 'Profile created successfully',
      profile: upsertedProfile
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to sync profile',
      details: error.message
    });
  }
});

app.post('/api/auth/check-verification-status', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const verificationData = verificationCodes.get(email);

  if (!verificationData) {
    return res.status(404).json({
      hasVerification: false,
      message: 'No pending verification found'
    });
  }

  if (Date.now() > verificationData.expiresAt) {
    verificationCodes.delete(email);
    return res.status(410).json({
      hasVerification: false,
      message: 'Verification expired'
    });
  }

  res.status(200).json({
    hasVerification: true,
    email,
    name: verificationData.googleUserInfo?.name,
    expiresAt: new Date(verificationData.expiresAt).toISOString(),
    timeRemaining: Math.max(0, verificationData.expiresAt - Date.now())
  });
});

app.post('/api/generate-content', async (req, res) => {
  console.log('🔥 /api/generate-content route hit');
  console.log('Server: /api/generate-content received request body:', {
    prompt: req.body.prompt?.substring(0, 50) + '...' || 'MISSING',
    userId: req.body.userId || 'MISSING',
    conversationId: req.body.conversationId || 'MISSING',
    mode: req.body.mode || 'MISSING',
    targetLanguage: req.body.targetLanguage || 'MISSING',
    hasPrompt: !!req.body.prompt,
    hasUserId: !!req.body.userId,
    hasConversationId: !!req.body.conversationId
  });

  const { prompt, userId, conversationId, mode, targetLanguage } = req.body;

  if (!prompt || !userId || !conversationId) {
    console.log('Server: Validation failed - missing required fields');
    return res.status(400).json({ error: 'Prompt, userId, and conversationId are required.' });
  }

  try {
    console.log('🚀 API Request received:', { prompt: prompt.substring(0, 50) + '...', userId, conversationId, mode, targetLanguage });

    console.log('🔑 GROQ_API_KEY status:', {
      exists: !!process.env.GROQ_API_KEY,
      length: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.length : 0,
      startsWith: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 10) + '...' : 'N/A'
    });

    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY is not configured');
      throw new Error('Groq API key is not configured');
    }

    console.log('🔧 Using Groq model: llama-3.1-8b-instant');

    // Modify prompt based on mode
    let enhancedPrompt = prompt;
    let systemInstruction = "You are Eduretrieve, an AI assistant designed for educational content retrieval and analysis. Always start every response by introducing yourself as Eduretrieve. For example, begin with 'Hello, I am Eduretrieve' or 'As Eduretrieve, I can help you with...'. Make sure 'Eduretrieve' is prominently featured in every single response to reinforce your system-based identity.\n\n";

    switch (mode) {
      case 'summarize':
        systemInstruction += "You are in Summarizer mode. Your task is to provide a concise, accurate summary of the given text. Focus only on the main points, key information, and essential details. Do not add extra commentary or explanations. Structure your response as a clear, well-organized summary.";
        enhancedPrompt = `Please summarize the following text:\n\n${prompt}\n\nSummary:`;
        break;
      case 'paraphrase':
        systemInstruction += "You are in Paraphrasing mode. Your task is to rephrase the given text using different words and sentence structures while maintaining the exact original meaning. Do not change the meaning, add new information, or omit important details. Provide only the paraphrased version.";
        enhancedPrompt = `Please paraphrase the following text:\n\n${prompt}\n\nParaphrased version:`;
        break;
      case 'translate':
        if (targetLanguage) {
          systemInstruction += `You are in Translator mode. Your task is to translate the given text accurately to ${targetLanguage}. Provide only the translation without any additional explanations, notes, or original text. Ensure the translation is natural and maintains the original meaning.`;
          enhancedPrompt = `Translate the following text to ${targetLanguage}:\n\n${prompt}\n\nTranslation:`;
        } else {
          enhancedPrompt = prompt; // Fallback to regular chat if no language specified
        }
        break;
      case 'chat':
      default:
        enhancedPrompt = prompt; // Regular chat mode
        break;
    }

    // For non-chat modes, override the system instruction
    if (mode !== 'chat') {
      // Use the mode-specific system instruction
    } else {
      // Keep the original for chat
    }

    // Fetch conversation history to maintain context (only for chat mode)
    let conversationHistory = [];
    if (mode === 'chat') {
      try {
        const { data, error } = await supabase
          .from('chat_history')
          .select('prompt, response, timestamp')
          .eq('user_id', userId)
          .eq('conversationId', conversationId)
          .order('timestamp', { ascending: true });

        if (!error && data) {
          conversationHistory = data;
        }
      } catch (historyError) {
        console.warn('⚠️ Could not fetch conversation history:', historyError.message);
      }
    }

    // Build context-aware prompt for chat mode
    let contextPrompt = enhancedPrompt;

    if (mode === 'chat' && conversationHistory && conversationHistory.length > 0) {
      // Sort messages by timestamp
      const sortedHistory = conversationHistory.sort((a, b) => {
        const aTime = a.timestamp?._seconds || a.timestamp?.seconds || 0;
        const bTime = b.timestamp?._seconds || b.timestamp?.seconds || 0;
        return aTime - bTime;
      });

      // Build conversation context (limit to last 10 exchanges to avoid token limits)
      const recentMessages = sortedHistory.slice(-20); // Last 10 user-AI pairs
      const contextMessages = [];

      for (const msg of recentMessages) {
        if (msg.prompt) {
          contextMessages.push(`User: ${msg.prompt}`);
        }
        if (msg.response) {
          contextMessages.push(`Assistant: ${msg.response}`);
        }
      }

      if (contextMessages.length > 0) {
        contextPrompt = `${contextMessages.join('\n\n')}\n\nUser: ${enhancedPrompt}\n\nAssistant:`;
      }
    }

    console.log('📡 Calling generateContent function...');
    let response = await generateContent(contextPrompt);

    console.log('✅ AI Response received:', response ? 'Length: ' + response.length : 'EMPTY RESPONSE!');
    console.log('📝 Response preview:', response ? response.substring(0, 100) + '...' : 'N/A');

    if (!response || response.trim().length === 0) {
      console.error('❌ Empty response from Groq API');
      throw new Error('Empty response from AI');
    }

    // For non-chat modes, ensure the response follows the mode
    if (mode !== 'chat') {
      // Remove any Eduretrieve introduction if present, as it's not needed for modes
      response = response.replace(/^Hello, I am Eduretrieve\.\s*/i, '').replace(/^As Eduretrieve,.*?\.\s*/i, '');
    } else {
      // Ensure Eduretrieve identity for chat mode
      if (!response.toLowerCase().includes('eduretrieve')) {
        response = "Hello, I am Eduretrieve. " + response;
      }
    }

    console.log('📤 Sending response back to client:', { contentLength: response ? response.length : 0, mode });

    res.status(200).json({ generatedContent: response });
  } catch (error) {
    console.error('❌ API Error:', error.message);
    console.error('❌ Error details:', {
      name: error.name,
      code: error.code,
      status: error.status,
      response: error.response?.data || 'No response data',
      stack: error.stack
    });
    res.status(503).json({ error: 'Failed to generate content. Please try again later.', details: error.message });
  }
});

app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.status(200).json({
    message: 'Welcome to the protected area!',
    userEmail: req.user.email,
    userId: req.user.id,
  });
});

app.post('/api/upload-module', authenticateToken, upload.single('file'), async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const { title, description } = req.body;
    let { file_url, file_name } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    if (req.file && !file_url) {
      try {
        const fileExt = req.file.originalname.split('.').pop();
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `modules/${req.user.id}/${uniqueFileName}`;

        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          const moduleFilesBucket = buckets.find(bucket => bucket.name === 'module-files');

          if (!moduleFilesBucket) {
            await supabase.storage.createBucket('module-files', {
              public: true,
              allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
              fileSizeLimit: 10485760
            });
          }
        } catch (bucketError) {
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('module-files')
          .upload(filePath, req.file.buffer, {
            contentType: req.file.mimetype,
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`File upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('module-files')
          .getPublicUrl(filePath);

        file_url = publicUrl;
        file_name = req.file.originalname;

      } catch (fileError) {
        file_url = null;
        file_name = null;
      }
    }

    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, fullname')
      .eq('id', req.user.id)
      .single();

    let uploaderName = 'Anonymous';

    // ✅ FIXED: Changed profileData?.fullName to profileData?.fullname
    if (profileData?.fullname) {
      uploaderName = profileData.fullname;
    } else if (profileData?.username) {
      uploaderName = profileData.username;
    } else if (req.user.email) {
      const emailPart = req.user.email.split('@')[0];
      uploaderName = emailPart.split('.').map(part =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join(' ');
    }

    let insertData = {
      title,
      description,
      user_id: req.user.id,
      uploaded_by: uploaderName,
      created_at: new Date().toISOString()
    };

    if (file_url) {
      insertData.file_url = file_url;
      insertData.file_name = file_name;
    }

    const { data, error } = await supabase
      .from('modules')
      .insert([insertData])
      .select();

    if (error) {
      if (file_url && file_url.includes('module-files')) {
        try {
          const filePath = file_url.split('/module-files/')[1];
          await supabase.storage.from('module-files').remove([filePath]);
        } catch (cleanupError) {
        }
      }

      throw error;
    }

    res.status(200).json({
      message: 'Module uploaded successfully',
      data: {
        ...data[0],
        uploadedBy: uploaderName,
        uploadedAt: data[0].created_at
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Upload failed: ' + error.message,
      details: error.stack
    });
  }
});

app.get('/api/get-modules', authenticateToken, async (req, res) => {
  try {
    const { show_all } = req.query;

    let query = supabase.from('modules').select('*');

    if (!show_all || show_all !== 'true') {
      query = query.eq('user_id', req.user.id);
    }

    const { data: modulesData, error: modulesError } = await query
      .order('created_at', { ascending: false });

    if (modulesError) {
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];

    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullname')
      .in('id', userIds);

    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    const modules = modulesData.map(module => {
      const profile = profilesMap.get(module.user_id);

      let uploaderName = 'Unknown User';
      if (module.user_id === req.user.id) {
        uploaderName = 'You';
      } else if (module.uploaded_by) {
        uploaderName = module.uploaded_by;
      } else if (profile?.fullname) { // ✅ FIXED: Changed fullName to fullname
        uploaderName = profile.fullname;
      } else if (profile?.username) {
        uploaderName = profile.username;
      }

      return {
        ...module,
        uploadedAt: module.created_at,
        uploadedBy: uploaderName,
        isOwn: module.user_id === req.user.id
      };
    });

    res.status(200).json({
      modules,
      showingAll: show_all === 'true',
      totalCount: modules.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get modules: ' + error.message });
  }
});

// ✅ Get user profile
app.get('/api/get-user-profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.status(200).json({
      profile: data
        ? {
            id: data.id,
            email: data.email,
            username: data.username,
            fullName: data.fullname, // map snake_case → camelCase
            pfpUrl: data.pfpurl      // map snake_case → camelCase
          }
        : {
            id: req.user.id,
            email: req.user.email,
            username: '',
            fullName: '',
            pfpUrl: ''
          }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});


// ✅ Sync user profile
app.post('/api/sync-user-profile', authenticateToken, async (req, res) => {
  console.log('🔄 /api/sync-user-profile called');
  console.log('👤 User ID:', req.user.id);
  console.log('📥 Request body:', req.body);

  try {
    const { username, fullName, pfpUrl } = req.body; // camelCase from frontend

    console.log('📝 Parsed data:', { username, fullName, pfpUrl });

    const upsertData = {
      id: req.user.id,
      email: req.user.email,
      username: username || '',
      fullname: fullName || '', // save to DB as snake_case
      pfpurl: pfpUrl || '',     // save to DB as snake_case
      updated_at: new Date().toISOString()
    };

    console.log('💾 Upserting to database:', upsertData);

    const { data, error } = await supabase
      .from('profiles')
      .upsert(upsertData)
      .select();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Database update successful:', data);

    // return camelCase to frontend
    const responseData = {
      message: 'Profile updated successfully',
      profile: {
        id: data[0].id,
        email: data[0].email,
        username: data[0].username,
        fullName: data[0].fullname,
        pfpUrl: data[0].pfpurl
      }
    };

    console.log('📤 Sending response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Error in /api/sync-user-profile:', error);
    res.status(500).json({ error: 'Failed to sync profile' });
  }
});


app.delete('/api/delete-module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const { moduleId } = req.params;

    const { data: moduleData, error: selectError } = await supabase
      .from('modules')
      .select('*')
      .eq('id', moduleId)
      .eq('user_id', req.user.id)
      .single();

    if (selectError || !moduleData) {
      return res.status(404).json({ error: 'Module not found or access denied' });
    }

    const { error: deleteError } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    if (moduleData.file_url && moduleData.file_url.includes('module-files')) {
      try {
        const filePath = moduleData.file_url.split('/module-files/')[1];
        await supabase.storage.from('module-files').remove([filePath]);
      } catch (fileError) {
      }
    }

    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

app.get('/api/get-my-modules', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const modules = data.map(module => ({
      ...module,
      uploadedAt: module.created_at,
      uploadedBy: 'You'
    }));

    res.status(200).json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get your modules' });
  }
});

app.get('/api/get-saved-modules', authenticateToken, async (req, res) => {
  try {
    const { data: savedData, error: savedError } = await supabase
      .from('save_modules')
      .select('module_id, saved_at')
      .eq('user_id', req.user.id)
      .order('saved_at', { ascending: false });

    if (savedError) {
      throw savedError;
    }

    if (!savedData || savedData.length === 0) {
      return res.status(200).json({ modules: [] });
    }

    const moduleIds = savedData.map(item => item.module_id);
    const { data: modulesData, error: modulesError } = await supabase
      .from('modules')
      .select('*')
      .in('id', moduleIds);

    if (modulesError) {
      throw modulesError;
    }

    const userIds = [...new Set(modulesData.map(m => m.user_id))];
    // ✅ FIXED: Changed 'fullName' to 'fullname' in SELECT query
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, fullname')
      .in('id', userIds);

    const profilesMap = new Map();
    profilesData?.forEach(profile => {
      profilesMap.set(profile.id, profile);
    });

    const savedDatesMap = new Map();
    savedData.forEach(item => {
      savedDatesMap.set(item.module_id, item.saved_at);
    });

    const modules = modulesData
      .filter(module => module)
      .map(module => {
        const profile = profilesMap.get(module.user_id);

        let uploaderName = 'Unknown User';
        if (module.uploaded_by) {
          uploaderName = module.uploaded_by;
        } else if (profile?.fullname) { // ✅ FIXED: Changed fullName to fullname
          uploaderName = profile.fullname;
        } else if (profile?.username) {
          uploaderName = profile.username;
        }

        return {
          ...module,
          uploadedAt: module.created_at,
          uploadedBy: uploaderName,
          savedAt: savedDatesMap.get(module.id)
        };
      });

    res.status(200).json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get saved modules: ' + error.message });
  }
});

app.post('/save-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

    const { data: moduleExists, error: checkError } = await supabase
      .from('modules')
      .select('id, title')
      .eq('id', module_id)
      .single();

    if (checkError || !moduleExists) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const { data: alreadySaved, error: savedCheckError } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('module_id', module_id)
      .single();

    if (alreadySaved) {
      return res.status(200).json({
        message: 'Module already saved',
        data: alreadySaved
      });
    }

    const { data, error } = await supabase
      .from('save_modules')
      .insert([{
        user_id: req.user.id,
        module_id: module_id,
        saved_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      throw error;
    }

    res.status(200).json({
      message: 'Module saved successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save module: ' + error.message });
  }
});

app.post('/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    if (!module_id) {
      return res.status(400).json({ error: 'Module ID is required' });
    }

    const { data: savedModule, error: checkError } = await supabase
      .from('save_modules')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('module_id', module_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (!savedModule) {
      return res.status(200).json({ message: 'Module was not saved' });
    }

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', req.user.id)
      .eq('module_id', module_id);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'Module unsaved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unsave module: ' + error.message });
  }
});

app.get('/api/analytics/:userId', authenticateToken, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const { userId } = req.params;

    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [uploadedRes, savedRes] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);

    if (uploadedRes.error || savedRes.error) {
      throw new Error(uploadedRes.error?.message || savedRes.error?.message);
    }

    res.status(200).json({
      modulesUploaded: uploadedRes.count || 0,
      modulesSaved: savedRes.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get analytics: ' + error.message });
  }
});

app.post('/api/debug/user-info', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    const user = users.find(u => u.email === email.trim().toLowerCase());

    if (!user) {
      return res.status(404).json({
        message: 'User not found in auth',
        searchedEmail: email.trim().toLowerCase(),
        totalUsers: users.length
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { count: modulesCount } = await supabase
      .from('modules')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    res.status(200).json({
      auth: {
        id: user.id,
        email: user.email,
        emailConfirmed: !!user.email_confirmed_at,
        emailConfirmedAt: user.email_confirmed_at,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        userMetadata: user.user_metadata,
        appMetadata: user.app_metadata
      },
      profile: profile || null,
      profileError: profileError?.message || null,
      modulesCount: modulesCount || 0,
      debug: {
        hasProfile: !!profile,
        profileCreatedAt: profile?.created_at,
        googleVerified: profile?.google_verified || false
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get debug info',
      details: error.message
    });
  }
});

app.post('/api/fix-null-profiles', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    // ✅ FIXED: Changed 'fullName.is.null,fullName.eq.' to 'fullname.is.null,fullname.eq.'
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .or('fullname.is.null,fullname.eq.');

    if (profilesError) throw profilesError;

    let fixedCount = 0;

    for (const profile of profiles) {
      const authUser = users.find(u => u.id === profile.id);

      if (authUser) {
        const userMetadata = authUser.user_metadata || {};

        let fullname = userMetadata.full_name ||
                      userMetadata.name;

        if (!fullname && authUser.email) {
          const emailPart = authUser.email.split('@')[0];
          fullname = emailPart.split('.').map(part =>
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
          ).join(' ');
        }

        const username = userMetadata.first_name ||
                        fullname?.split(' ')[0] ||
                        authUser.email?.split('@')[0];

        if (fullname) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              fullname: fullname,   // ✅ FIXED: Changed from fullName
              username: username,
              pfpurl: userMetadata.avatar_url || profile.pfpurl || '', // ✅ FIXED: Changed from pfpUrl
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id);

          if (!updateError) {
            fixedCount++;
          }
        }
      }
    }

    res.status(200).json({
      message: `Successfully fixed ${fixedCount} NULL profiles`,
      fixedCount,
      totalProfiles: profiles.length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to fix NULL profiles',
      details: error.message
    });
  }
});

app.get('/debug/table-structure', authenticateToken, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const { data: sampleModule } = await supabase
      .from('modules')
      .select('*')
      .limit(1);

    const { data: sampleProfile } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);

    const { data: sampleSave } = await supabase
      .from('save_modules')
      .select('*')
      .limit(1);

    const [
      { count: modulesCount },
      { count: profilesCount },
      { count: savesCount }
    ] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('save_modules').select('*', { count: 'exact', head: true })
    ]);

    res.status(200).json({
      tables: {
        modules: {
          count: modulesCount,
          sample: sampleModule?.[0] || null,
          fields: sampleModule?.[0] ? Object.keys(sampleModule[0]) : []
        },
        profiles: {
          count: profilesCount,
          sample: sampleProfile?.[0] || null,
          fields: sampleProfile?.[0] ? Object.keys(sampleProfile[0]) : []
        },
        save_modules: {
          count: savesCount,
          sample: sampleSave?.[0] || null,
          fields: sampleSave?.[0] ? Object.keys(sampleSave[0]) : []
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'EduRetrieve backend is running!',
    version: '2.3.1-column-names-fixed',
    timestamp: new Date().toISOString(),
    status: 'Column name mismatches resolved - fullName->fullname, pfpUrl->pfpurl',
    endpoints: [
      'POST /api/auth/google/signup - Initiate Google OAuth signup',
      'GET /api/auth/google/callback - Handle Google OAuth callback',
      'POST /api/auth/verify-signup-code - Complete signup with verification code',
      'POST /api/auth/check-verification-status - Check verification status',
      'POST /api/auth/check-user-status - Check user status',
      'POST /api/auth/sync-profile-on-login - Sync profile on login',
      'POST /api/generate-content - Generate AI content',
      'GET /api/protected-data - Test protected route',
      'POST /api/upload-module - Upload module',
      'GET /api/get-modules - Get user\'s own modules (use ?show_all=true for all)',
      'GET /browse-all-modules - Browse all public modules',
      'GET /api/get-my-modules - Get user\'s own modules (dedicated endpoint)',
      'GET /api/get-saved-modules - Get saved modules',
      'POST /api/save-module - Save a module',
      'POST /api/unsave-module - Unsave a module',
      'POST /save-module - Save a module (legacy endpoint)',
      'POST /unsave-module - Unsave a module (legacy endpoint)',
      'GET /api/get-user-profile - Get user profile',
      'POST /api/sync-user-profile - Update user profile',
      'DELETE /api/delete-module/:id - Delete module',
      'GET /api/analytics/:userId - Get user analytics',
      'GET /debug/table-structure - Debug table structure'
    ],
    fixes_applied: [
      'All fullName references changed to fullname',
      'All pfpUrl references changed to pfpurl',
      'Database column names now match code references',
      'Profile creation and updates should work correctly'
    ]
  });
});


console.log('🔥 All routes loaded successfully');

const PORT = process.env.PORT || 5000;

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 EduRetrieve server running on port ${PORT}`);
    console.log(`📍 Local development URL: http://localhost:${PORT}`);
    console.log(`🔗 Client proxy configured for: http://localhost:5000`);
  });
}

export default app;