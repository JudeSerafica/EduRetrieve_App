import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI (FIXED: force v1 + explicit baseUrl)
const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY || 'dummy-key';
const genAI = new GoogleGenerativeAI({
  apiKey,
  apiVersion: 'v1',
  baseUrl: 'https://generativelanguage.googleapis.com'
});
console.log('🔍 Gemini client initialized. API key set?', apiKey && apiKey !== 'dummy-key');


// =========================
// 🔧 Middleware
// =========================
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// 🧭 SUPABASE INIT  
// =========================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dcepfndjsmktrfcelvgs.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXBmbmRqc21rdHJmY2VsdmdzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTAwMDkxNiwiZXhwIjoyMDY2NTc2OTE2fQ.uSduSDirvbRdz5_2ySrVTp_sYPGcg6ddP6_XfMDZZKQ'
);

// =========================
// 📧 EMAIL TRANSPORTER SETUP
// =========================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'judskie198@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'afybzhvvmoioblfu',
  },
});

// In-memory storage for verification codes (use Redis in production)
const verificationCodes = new Map();

// Generate random 6-digit verification code
const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Generate content using Gemini
const generateContent = async (prompt, userId = null, retries = 3) => {
  try {
    console.log('🤖 Generating content for prompt:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'dummy-key') {
      console.error('❌ GEMINI_API_KEY is not configured or is dummy-key');
      throw new Error('Gemini API key is not configured');
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    console.log('🔧 Using Gemini model: gemini-1.5-pro-latest');

    // Add system instruction for Eduretrieve identity
    const systemInstruction = "You are Eduretrieve, an AI assistant designed for educational content retrieval and analysis. Always start every response by introducing yourself as Eduretrieve. For example, begin with 'Hello, I am Eduretrieve' or 'As Eduretrieve, I can help you with...'. Make sure 'Eduretrieve' is prominently featured in every single response to reinforce your system-based identity.\n\n";
    const enhancedPrompt = systemInstruction + prompt;

    const result = await model.generateContent(enhancedPrompt);
    let response = result.response.text();

    console.log('✅ AI Response received:', response ? 'Length: ' + response.length : 'EMPTY RESPONSE!');

    if (!response || response.trim().length === 0) {
      console.error('❌ Empty response from Gemini API');
      throw new Error('Empty response from AI');
    }

    // Ensure Eduretrieve identity is present
    if (!response.toLowerCase().includes('eduretrieve')) {
      response = "Hello, I am Eduretrieve. " + response;
    }

    return response;
  } catch (error) {
    console.error("❌ Gemini API error:", error.message || error);
    console.error('Stack trace:', error.stack);
    throw new Error("Failed to generate content from AI: " + error.message);
  }
};

// =========================
// ✅ AUTH MIDDLEWARE
// =========================
const authenticateToken = async (req, res, next) => {
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
    console.error('❌ Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// =========================
// 🔐 GOOGLE OAUTH ROUTES
// =========================





// =========================
// 📧 EMAIL-BASED SIGNUP ROUTES
// =========================

// Step 1: Initiate email-based signup (send verification code)
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase.auth.admin.listUsers();
    const userExists = existingUser.users.some(user => user.email === email);

    if (userExists) {
      return res.status(400).json({ error: 'User already exists. Please log in instead.' });
    }

    // Clean up any existing profiles for this email to prevent conflicts
    const { error: cleanupError } = await supabase
      .from('profiles')
      .delete()
      .eq('email', email);

    if (cleanupError) {
      console.warn('⚠️ Profile cleanup warning:', cleanupError.message);
      // Don't fail signup if cleanup fails
    } else {
      console.log('🧹 Cleaned up existing profiles for email:', email);
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

    // Check if auth user was actually created successfully
    if (!authData.user || !authData.user.id) {
      console.error('❌ Auth user creation failed - no user ID returned');
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    // Skip profile creation entirely for now - let client handle it
    console.log('⏭️ Skipping server-side profile creation, letting client handle it');

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
        fullName: '',
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

// =========================
// 📤 EXISTING ROUTES
// =========================

// Import chat routes
const chatRoutes = require('./src/routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// Import admin routes
const adminRoutes = require('./src/routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// AI Generation Endpoint with RAG
app.post('/api/generate-content', async (req, res) => {
  const { prompt, userId, conversationId, mode, targetLanguage } = req.body;

  if (!prompt || !userId || !conversationId) {
    return res.status(400).json({ error: 'Prompt, userId, and conversationId are required.' });
  }

  try {
    console.log('🚀 API Request received:', {
      prompt: prompt.substring(0, 50) + '...',
      userId,
      conversationId,
      mode,
      targetLanguage
    });

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

    // 🧠 Generate content using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    let finalPrompt = contextPrompt;
    if (mode !== 'chat') {
      // For modes, use the mode-specific system instruction + prompt
      finalPrompt = systemInstruction + "\n\n" + enhancedPrompt;
    } else {
      // For chat, use the original system + context
      finalPrompt = systemInstruction + contextPrompt;
    }

    const result = await model.generateContent(finalPrompt);
    let content = result.response.text();

    console.log('✅ AI Response received:', content ? 'Length: ' + content.length : 'EMPTY RESPONSE!');

    if (!content || content.trim().length === 0) {
      console.error('❌ Empty response from Gemini API');
      throw new Error('Empty response from AI');
    }

    // For non-chat modes, ensure the response follows the mode
    if (mode !== 'chat') {
      // Remove any Eduretrieve introduction if present, as it's not needed for modes
      content = content.replace(/^Hello, I am Eduretrieve\.\s*/i, '').replace(/^As Eduretrieve,.*?\.\s*/i, '');
    } else {
      // Ensure Eduretrieve identity for chat mode
      if (!content.toLowerCase().includes('eduretrieve')) {
        content = "Hello, I am Eduretrieve. " + content;
      }
    }

    console.log('📤 Sending response back to client:', { contentLength: content ? content.length : 0, mode });

    res.status(200).json({ generatedContent: content });
  } catch (error) {
    console.error('❌ API Error:', error.message);
    res.status(503).json({ error: 'Failed to generate content. Please try again later.', details: error.message });
  }
});

// Protected Test Route
app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.status(200).json({
    message: 'Welcome to the protected area!',
    userEmail: req.user.email,
    userId: req.user.id,
  });
});

// =========================
// 📊 ACTIVITY TRACKING ROUTES
// =========================

// Log user activity
app.post('/api/activity/log', authenticateToken, async (req, res) => {
  try {
    const { activityType, details } = req.body;
    
    if (!activityType) {
      return res.status(400).json({ error: 'Activity type is required' });
    }

    const { error } = await supabase
      .from('user_activities')
      .insert({
        user_id: req.user.id,
        activity_type: activityType,
        details: JSON.stringify(details || {}),
        timestamp: new Date(),
      });

    if (error) {
      console.error('❌ Activity log error:', error);
      return res.status(500).json({ error: 'Failed to log activity' });
    }

    res.status(200).json({ message: 'Activity logged successfully' });
  } catch (error) {
    console.error('❌ Activity logging error:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// Get current user's activities
app.get('/api/activity/my-activities', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
      .from('user_activities')
      .select('*')
      .eq('user_id', req.user.id)
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('❌ Get activities error:', error);
      return res.status(500).json({ error: 'Failed to fetch activities' });
    }

    res.status(200).json({ activities: data || [] });
  } catch (error) {
    console.error('❌ Get activities error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Upload Module Route with file support (using ES module import from top)
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, TXT, JPEG, PNG, and GIF files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.post('/upload-module', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const file = req.file;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    let extractedContent = description; // Default to description if no file

    // If a file is uploaded, extract text content
    if (file) {
      try {
        const { extractTextFromFile } = require('./src/utils/textExtractor');
        const fs = require('fs');
        const path = require('path');

        const filePath = path.join(__dirname, 'uploads', file.filename);
        extractedContent = await extractTextFromFile(filePath, file.mimetype);

        // Clean up the uploaded file after extraction
        fs.unlinkSync(filePath);
      } catch (extractionError) {
        console.warn('File extraction failed, using description only:', extractionError.message);
        // Continue with description if extraction fails
      }
    }

    // Insert into modules table
    const { data, error } = await supabase
      .from('modules')
      .insert([{
        title,
        description: extractedContent,
        uploadedBy: req.user.id,
        uploadedAt: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    res.status(200).json({
      message: 'Module uploaded successfully',
      data
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Get User Profile
app.get('/get-user-profile', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // Map snake_case to camelCase for frontend
    const profile = data ? {
      id: data.id,
      email: data.email,
      username: data.username,
      fullName: data.fullname,
      pfpUrl: data.pfpurl
    } : {
      id: req.user.id,
      email: req.user.email,
      username: '',
      fullName: '',
      pfpUrl: ''
    };

    res.status(200).json({ profile });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Sync User Profile
app.post('/sync-user-profile', authenticateToken, async (req, res) => {
  try {
    const { username, fullName, pfpUrl } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: req.user.id,
        email: req.user.email,
        username: username || '',
        fullname: fullName || '',
        pfpurl: pfpUrl || '',
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) throw error;

    // Map snake_case to camelCase for frontend
    const profile = data[0] ? {
      id: data[0].id,
      email: data[0].email,
      username: data[0].username,
      fullName: data[0].fullname,
      pfpUrl: data[0].pfpurl
    } : null;

    res.status(200).json({
      message: 'Profile updated successfully',
      profile
    });
  } catch (error) {
    console.error('❌ Sync profile error:', error);
    res.status(500).json({ error: 'Failed to sync profile' });
  }
});

// Delete Module
app.delete('/delete-module/:moduleId', authenticateToken, async (req, res) => {
  try {
    const { moduleId } = req.params;

    const { error } = await supabase
      .from('modules')
      .delete()
      .eq('id', moduleId)
      .eq('user_id', req.user.id); // Only allow deletion of own modules

    if (error) throw error;

    res.status(200).json({ message: 'Module deleted successfully' });
  } catch (error) {
    console.error('❌ Delete module error:', error);
    res.status(500).json({ error: 'Failed to delete module' });
  }
});

// Get Saved Modules
app.get('/get-saved-modules', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('save_modules')
      .select(`
        module_id,
        modules:module_id (
          id,
          title,
          description,
          uploadedBy,
          uploadedAt,
          file_url
        )
      `)
      .eq('user_id', req.user.id);

    if (error) throw error;

    const modules = data.map(item => item.modules);

    res.status(200).json({ modules });
  } catch (error) {
    console.error('❌ Get saved modules error:', error);
    res.status(500).json({ error: 'Failed to get saved modules' });
  }
});

// Unsave Module
app.post('/unsave-module', authenticateToken, async (req, res) => {
  try {
    const { module_id } = req.body;

    const { error } = await supabase
      .from('save_modules')
      .delete()
      .eq('user_id', req.user.id)
      .eq('module_id', module_id);

    if (error) throw error;

    res.status(200).json({ message: 'Module unsaved successfully' });
  } catch (error) {
    console.error('❌ Unsave module error:', error);
    res.status(500).json({ error: 'Failed to unsave module' });
  }
});

// Get Analytics
app.get('/api/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [
      { count: modulesUploaded },
      { count: modulesSaved }
    ] = await Promise.all([
      supabase.from('modules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('save_modules').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);

    res.status(200).json({
      modulesUploaded: modulesUploaded || 0,
      modulesSaved: modulesSaved || 0
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// =========================
// 👤 ADMIN ROUTES
// =========================

// Check if user is admin
app.get('/api/admin/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user profile from profiles table
    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (error || !user) {
      // If profile doesn't exist, create one
      if (!user) {
        const { data: { user: authUser } } = await supabase.auth.getUser(userId);
        const { error: insertError } = await supabase
          .from('profiles')
          .insert([{
            id: userId,
            email: authUser?.email || req.user.email,
            username: (authUser?.email || req.user.email)?.split('@')[0] || 'user',
            fullname: '',
            pfpurl: '',
            role: 'user',
            created_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          return res.status(404).json({ error: 'User profile not found and could not be created' });
        }
        return res.status(200).json({ isAdmin: false, role: 'user' });
      }
      return res.status(404).json({ error: 'User profile not found' });
    }

    const isAdmin = user.role === 'admin';
    res.status(200).json({ isAdmin, role: user.role });
  } catch (error) {
    console.error('❌ Admin check error:', error);
    res.status(500).json({ error: 'Failed to check admin status' });
  }
});

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Get all users from profiles
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({ users: users || [] });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get user activities (admin only)
app.get('/api/admin/activities', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 100, userId: targetUserId } = req.query;
    
    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Build query
    let query = supabase
      .from('user_activities')
      .select(`
        *,
        profiles:user_id (email, fullname)
      `)
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit));

    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data: activities, error } = await query;

    if (error) throw error;

    res.status(200).json({ activities: activities || [] });
  } catch (error) {
    console.error('❌ Get activities error:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

// Get admin dashboard summary
app.get('/api/admin/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get counts and recent activities in parallel
    const [
      { count: totalUsers, error: usersError },
      { count: totalActivities, error: activitiesError },
      { count: todayLogins, error: todayLoginsError },
      { data: recentActivities, error: recentError },
      { data: moduleStats, error: moduleError }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('user_activities').select('*', { count: 'exact', head: true }),
      supabase.from('user_activities')
        .select('*', { count: 'exact', head: true })
        .eq('activity_type', 'login')
        .gte('timestamp', today.toISOString()),
      supabase
        .from('user_activities')
        .select(`
          *,
          profiles:user_id (email, fullname)
        `)
        .gte('timestamp', startOfWeek.toISOString())
        .order('timestamp', { ascending: false })
        .limit(50),
      supabase.from('modules').select('user_id', { count: 'exact', head: true })
    ]);

    if (usersError || activitiesError || recentError) {
      throw new Error('Failed to fetch admin summary');
    }

    // Calculate activity counts by type
    const activityCounts = {};
    const loginHistory = [];
    
    if (recentActivities) {
      recentActivities.forEach(activity => {
        activityCounts[activity.activity_type] = (activityCounts[activity.activity_type] || 0) + 1;
        if (activity.activity_type === 'login') {
          loginHistory.push({
            email: activity.profiles?.email || 'Unknown',
            timestamp: activity.timestamp
          });
        }
      });
    }

    res.status(200).json({
      summary: {
        totalUsers: totalUsers || 0,
        totalActivities: totalActivities || 0,
        todayLogins: todayLogins || 0,
        totalModules: moduleStats?.count || 0,
        activityCounts,
        loginHistory: loginHistory.slice(0, 20)
      }
    });
  } catch (error) {
    console.error('❌ Admin summary error:', error);
    res.status(500).json({ error: 'Failed to get admin summary' });
  }
});

// Update user role (admin only)
app.put('/api/admin/users/:userId/role', authenticateToken, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user or admin' });
    }
    
    // Check if requester is admin
    const { data: adminUser, error: adminError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', adminId)
      .single();

    if (adminError || adminUser.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    // Update user role
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) throw error;

    // Log this admin action
    await supabase.from('user_activities').insert({
      user_id: adminId,
      activity_type: 'admin_role_change',
      details: JSON.stringify({ target_user_id: userId, new_role: role }),
      timestamp: new Date()
    });

    res.status(200).json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('❌ Update role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// =========================
// 🏁 ROOT ROUTE
// =========================
app.get('/', (req, res) => {
  res.json({
    message: '✅ EduRetrieve backend with Google OAuth is running!',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /api/auth/google/signup - Initiate Google OAuth signup',
      'POST /api/auth/google/callback - Handle Google OAuth callback',
      'POST /api/auth/verify-signup-code - Complete signup with verification code',
      'POST /api/auth/check-verification-status - Check verification status',
      'POST /api/chat/process-image - Process chat images with OCR',
      'POST /api/generate-content - Generate AI content',
      'GET /api/protected-data - Test protected route',
      'POST /upload-module - Upload module',
      'GET /get-user-profile - Get user profile',
      'POST /sync-user-profile - Update user profile',
      'DELETE /delete-module/:id - Delete module',
      'GET /get-saved-modules - Get saved modules',
      'POST /unsave-module - Unsave module',
      'GET /api/analytics/:userId - Get user analytics'
    ]
  });
});


// =========================
// � START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔐 Google OAuth Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`📧 Gmail configured: ${process.env.GMAIL_USER || 'judskie198@gmail.com'}`);
  console.log(`🗄️ Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log('📍 Available endpoints:');
  console.log('   POST /api/auth/google/signup');
  console.log('   POST /api/auth/google/callback');
  console.log('   POST /api/auth/verify-signup-code');
  console.log('   POST /api/auth/check-verification-status');
  console.log('   POST /api/chat/process-image');
  console.log('   POST /api/generate-content');
  console.log('   GET  /api/protected-data');
  console.log('   POST /upload-module');
  console.log('   GET  /get-user-profile');
  console.log('   POST /sync-user-profile');
  console.log('   DELETE /delete-module/:id');
  console.log('   GET  /get-saved-modules');
  console.log('   POST /unsave-module');
  console.log('   GET  /api/analytics/:userId');
});