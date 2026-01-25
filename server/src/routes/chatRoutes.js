import express from 'express';
const router = express.Router();
import multer from 'multer';
import { saveChatEntry, getChatHistory, deleteChatEntriesByConversationId } from '../model/userModel.js';
import { extractFromImage, extractTextFromFile } from '../utils/textExtractor.js';
import authenticateToken from '../middleware/authMiddleware.js';
import { generateContent } from '../model/Model.js';

// Configure multer for file uploads (images and documents) - MEMORY STORAGE for serverless
const chatFileUpload = multer({
  storage: multer.memoryStorage(), // Use memory storage instead of disk
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, DOCX, TXT, and PPTX files are allowed'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for chat files
});

// POST /api/chat/save
router.post('/save', authenticateToken, async (req, res) => {
  const { prompt, response, conversationId, timestamp, mode } = req.body;
  const userId = req.user.id; // ✅ FIXED

  if (!userId || !prompt || !response || !conversationId || !timestamp) {
    return res.status(400).json({ error: 'Missing userId, prompt, response, conversationId, or timestamp.' });
  }

  try {
    await saveChatEntry(userId, prompt, response, conversationId, timestamp, mode || 'chat');
    res.status(200).json({ message: 'Chat entry saved successfully.' });
  } catch (error) {
    console.error('Error in /api/chat/save:', error);
    res.status(500).json({ error: 'Failed to save chat entry.' });
  }
});

// GET /api/chat/history
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.id; // ✅ FIXED

  if (!userId) return res.status(400).json({ error: 'Missing userId.' });

  try {
    const history = await getChatHistory(userId);
    res.status(200).json({ chatHistory: history });
  } catch (error) {
    console.error('Error in /api/chat/history:', error);
    res.status(500).json({ error: 'Failed to retrieve chat history.' });
  }
});

// DELETE /api/chat/delete/:conversationId
router.delete('/delete/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id; // ✅ FIXED

  if (!userId || !conversationId) {
    return res.status(400).json({ error: 'Missing userId or conversationId.' });
  }

  try {
    const deletedCount = await deleteChatEntriesByConversationId(userId, conversationId);
    if (deletedCount === 0) {
      return res.status(404).json({ message: `No chat messages found for conversation ID: ${conversationId}.` });
    }
    res.status(200).json({ message: `Successfully deleted ${deletedCount} chat entries.` });
  } catch (error) {
    console.error('Error in /api/chat/delete:', error);
    res.status(500).json({ error: 'Failed to delete chat entries.', details: error.message });
  }
});

// POST /api/chat/process-file
router.post('/process-file', chatFileUpload.single('file'), async (req, res) => {
  try {
    const { conversationId, prompt } = req.body;
    const userId = 'local-user'; // Mock user ID for localStorage approach
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required.' });
    }

    console.log('Processing chat file:', {
      userId,
      conversationId,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    });

    // Extract text from the uploaded file (using buffer from memory storage)
    let extractedText = '';
    const isImage = file.mimetype.startsWith('image/');

    try {
      if (isImage) {
        console.log('Processing image file for OCR...');
        extractedText = await extractFromImage(file.buffer);
        console.log('Image OCR extraction completed, text length:', extractedText.length);
      } else {
        console.log('Processing document file...');
        extractedText = await extractTextFromFile(file.buffer, file.mimetype);
        console.log('Document text extraction completed, text length:', extractedText.length);
      }
    } catch (extractionError) {
      console.error('Text extraction failed:', extractionError);
      // Provide more specific error messages based on file type
      if (isImage) {
        extractedText = '[Image uploaded - OCR processing failed in serverless environment. Please describe the image content manually for better AI responses.]';
      } else {
        extractedText = `[${file.mimetype.split('/')[1].toUpperCase()} file uploaded - text extraction failed. The AI can still help analyze this file if you describe its contents.]`;
      }
    }

    // No cleanup needed since we're using memory storage

    // Generate AI response based on user's question + extracted text
    const fileType = isImage ? 'image' : 'file';
    const aiPrompt = prompt
      ? `${prompt}\n\nHere is the extracted text from the uploaded ${fileType}:\n\n"${extractedText}"\n\nPlease answer the question using the ${fileType} content.`
      : `The user uploaded a ${fileType}. Here is the extracted text from the ${fileType}:\n\n"${extractedText}"\n\nPlease analyze this content and provide helpful insights or answer any questions the user might have about it.`;


    const aiResponse = await generateContent(aiPrompt);

    // Create timestamp
    const now = Date.now();
    const timestamp = {
      _seconds: Math.floor(now / 1000),
      _nanoseconds: (now % 1000) * 1_000_000
    };

    // Save the file message and AI response to chat history
    const fileMessage = {
      type: 'user',
      text: `[${isImage ? 'Image' : 'File'} uploaded] ${extractedText}`,
      timestamp,
      conversationId,
      fileUrl: null, // We don't store the file, just process it
      fileName: file.originalname,
      fileType: isImage ? 'image' : 'document'
    };

    const aiMessage = {
      type: 'ai',
      text: aiResponse,
      timestamp: {
        _seconds: Math.floor(Date.now() / 1000),
        _nanoseconds: (Date.now() % 1000) * 1_000_000
      },
      conversationId
    };

    // Return processed data - frontend will handle localStorage
    res.status(200).json({
      message: `${isImage ? 'Image' : 'File'} processed successfully`,
      extractedText,
      aiResponse,
      conversationId,
      fileName: file.originalname,
      fileType: isImage ? 'image' : 'document'
    });

  } catch (error) {
    console.error('Error processing chat file:', error);
    // Ensure we always return JSON, never HTML
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to process file',
        details: error.message
      });
    }
  }
});

export default router;



