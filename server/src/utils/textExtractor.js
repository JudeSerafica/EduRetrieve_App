import fs from 'fs';
import * as mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import PPTX2Json from 'pptx2json';

console.log('[textExtractor] v2 loader active');

/**
 * Extracts text content from various file types
 * @param {string|Buffer} input - Path to the file or file buffer
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromFile(input, mimeType) {
  try {
    switch (mimeType) {
      case 'application/pdf':
        return await extractFromPDF(input);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractFromDOCX(input);
      case 'text/plain':
        return await extractFromTXT(input);
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return await extractFromPPTX(input);
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        return await extractFromImage(input);
      default:
        throw new Error(`Unsupported MIME type: ${mimeType}`);
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

/**
 * Extract text from PDF files
 * Supports pdf-parse v1 (default function) and v2 (PDFParse class)
 */
async function extractFromPDF(input) {
  try {
    console.log('[textExtractor] Starting PDF extraction...');
    const dataBuffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);

    // Check buffer size - large PDFs might cause memory issues
    const bufferSizeMB = dataBuffer.length / (1024 * 1024);
    console.log(`[textExtractor] PDF buffer size: ${bufferSizeMB.toFixed(2)} MB`);

    if (bufferSizeMB > 50) {
      console.warn('[textExtractor] Large PDF detected, extraction may fail in serverless environment');
      return '[Large PDF uploaded - text extraction may be limited in serverless environment. Please try a smaller file or describe the content manually.]';
    }

    const mod = await import('pdf-parse');

    let text = '';

    if (typeof mod?.PDFParse === 'function') {
      console.log('[textExtractor] using PDFParse class (v2)');
      const parser = new mod.PDFParse({ data: dataBuffer });
      const result = await parser.getText();
      await parser.destroy();
      text = result?.text || '';
    } else if (typeof mod?.default === 'function') {
      console.log('[textExtractor] using default function (v1)');
      const result = await mod.default(dataBuffer);
      text = (result && typeof result === 'object' && 'text' in result) ? result.text : (typeof result === 'string' ? result : '');
    } else if (typeof mod === 'function') {
      console.log('[textExtractor] using module as function (interop)');
      const result = await mod(dataBuffer);
      text = (result && typeof result === 'object' && 'text' in result) ? result.text : (typeof result === 'string' ? result : '');
    } else {
      console.error('[textExtractor] unsupported pdf-parse export shape:', Object.keys(mod || {}));
      throw new Error('Unsupported pdf-parse export shape');
    }

    console.log(`[textExtractor] PDF extraction completed, extracted ${text.length} characters`);
    return text || '[PDF processed - no text content found]';

  } catch (error) {
    console.error('[textExtractor] PDF extraction error:', error);

    // Provide helpful fallback messages
    if (error.message.includes('timeout') || error.message.includes('time')) {
      return '[PDF uploaded - extraction timed out in serverless environment]';
    } else if (error.message.includes('memory') || error.message.includes('Memory') || error.message.includes('heap')) {
      return '[PDF uploaded - extraction failed due to memory limits]';
    } else if (error.message.includes('encrypted') || error.message.includes('password')) {
      return '[PDF uploaded - file appears to be password-protected]';
    } else {
      return `[PDF uploaded - extraction failed: ${error.message}]`;
    }
  }
}

/**
 * Extract text from DOCX files
 */
async function extractFromDOCX(input) {
  try {
    let result;
    if (Buffer.isBuffer(input)) {
      result = await mammoth.extractRawText({ arrayBuffer: input });
    } else {
      result = await mammoth.extractRawText({ path: input });
    }
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from TXT files
 */
async function extractFromTXT(input) {
  try {
    if (Buffer.isBuffer(input)) {
      return input.toString('utf8');
    } else {
      return fs.readFileSync(input, 'utf8');
    }
  } catch (error) {
    throw new Error(`TXT extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from PPTX files
 * Handles both constructor and function export styles
 */
async function extractFromPPTX(input) {
  try {
    let pptx;
    if (Buffer.isBuffer(input)) {
      // For buffers, we might need to create a temporary approach
      // For now, return a placeholder since PPTX processing with buffers is complex
      console.warn('PPTX buffer processing not fully implemented, returning placeholder');
      return '[PPTX file uploaded - processing not available in serverless environment]';
    } else {
      try {
        // Some versions expose a class
        pptx = new PPTX2Json(input);
      } catch (_e) {
        // Fallback: some builds expose a function default export
        const mod = await import('pptx2json');
        const fn = mod?.default ?? mod;
        pptx = await fn(input);
      }
    }

    let text = '';
    if (pptx?.slides) {
      pptx.slides.forEach(slide => {
        if (slide?.text) {
          text += slide.text + '\n';
        }
      });
    }
    return text.trim();
  } catch (error) {
    throw new Error(`PPTX extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from image files using OCR
 */
async function extractFromImage(input) {
  let worker;
  try {
    console.log('[textExtractor] Starting OCR extraction...');

    // Check if we're in a serverless environment and provide fallback
    const isServerless = process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || !process.env.USER;
    if (isServerless) {
      console.warn('[textExtractor] Serverless environment detected, OCR may fail. Providing fallback.');
      return '[Image uploaded - OCR processing not available in serverless environment. Please describe the image content manually.]';
    }

    worker = await createWorker('eng', 1, {
      logger: m => console.log('[Tesseract]', m)
    });

    let result;
    if (Buffer.isBuffer(input)) {
      console.log('[textExtractor] Processing buffer input...');
      result = await worker.recognize(input);
    } else {
      console.log('[textExtractor] Processing file path input...');
      result = await worker.recognize(input);
    }

    const extractedText = result.data.text.trim();
    console.log(`[textExtractor] OCR completed, extracted ${extractedText.length} characters`);

    return extractedText || '[Image processed - no text detected]';

  } catch (error) {
    console.error('[textExtractor] OCR extraction error:', error);

    // Provide helpful fallback messages based on error type
    if (error.message.includes('WebAssembly') || error.message.includes('wasm')) {
      return '[Image uploaded - OCR failed due to WebAssembly limitations in serverless environment]';
    } else if (error.message.includes('timeout') || error.message.includes('time')) {
      return '[Image uploaded - OCR timed out in serverless environment]';
    } else if (error.message.includes('memory') || error.message.includes('Memory')) {
      return '[Image uploaded - OCR failed due to memory limits]';
    } else {
      return `[Image uploaded - OCR failed: ${error.message}]`;
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate();
        console.log('[textExtractor] OCR worker terminated');
      } catch (e) {
        console.warn('[textExtractor] Error terminating worker:', e);
      }
    }
  }
}

export {
  extractTextFromFile,
  extractFromImage,
  extractFromPPTX
};