import React, { useState, useEffect, useRef, useCallback } from 'react';
import useAuthStatus from '../hooks/useAuthStatus';
import ReactMarkdown from 'react-markdown';
import { FaPaperPlane, FaStop, FaPlus, FaComments, FaTrash, FaFileUpload, FaBars } from 'react-icons/fa';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import {
  formatFirebaseTimestamp,
  generateUniqueId,
  fetchChatHistoryApi,
  saveChatEntryApi,
  deleteChatSessionApi,
  generateContentApi,
  processChatFileApi,
  getUserChatKey
} from '../utils/ChatHelpers';

function Chats() {
  const { user, loading: authLoading } = useAuthStatus();

  const [prompt, setPrompt] = useState('');
  const [activeChatMessages, setActiveChatMessages] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatHistorySessions, setChatHistorySessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [aiMode, setAiMode] = useState('chat'); // 'chat', 'summarize', 'paraphrase', 'translate'
  const [sourceLanguage, setSourceLanguage] = useState('English');
  const [targetLanguage, setTargetLanguage] = useState('Filipino');
  const [translatorInput, setTranslatorInput] = useState('');
  const [translatorOutput, setTranslatorOutput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatMessagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const translateTimeoutRef = useRef(null);

  const handleNewChat = useCallback(() => {
    if (activeChatMessages.length > 0 && activeSessionId) {
      setChatHistorySessions(prev =>
        prev.map(session => {
          if (session.id === activeSessionId && (session.title === 'New Chat' || session.title.startsWith('Chat from'))) {
            const firstUserMessage = session.messages.find(msg => msg.type === 'user');
            const sessionTitle = firstUserMessage?.text
                ? (firstUserMessage.text.length > 30 ? firstUserMessage.text.slice(0, 30) + '...' : firstUserMessage.text)
                : 'Untitled Chat';
            return { ...session, title: sessionTitle };
          }
          return session;
        })
      );
    }

    const newSessionId = generateUniqueId();
    setChatHistorySessions(prev => [
      {
        id: newSessionId,
        title: 'New Chat',
        messages: []
      },
      ...prev
    ]);
    setActiveSessionId(newSessionId);
    setActiveChatMessages([]);
    setPrompt('');
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
    setIsSidebarOpen(false); // Close sidebar on mobile after new chat
  }, [activeChatMessages, activeSessionId]);

 useEffect(() => {
   let isMounted = true;

   const loadInitialChatHistory = async () => {
     if (user && !authLoading) {
       try {
         const sessions = await fetchChatHistoryApi(user, aiMode);
         if (!isMounted) return;

         setChatHistorySessions(sessions);

         if (sessions.length > 0) {
           setActiveChatMessages(sessions[0].messages);
           setActiveSessionId(sessions[0].id);
         } else {
           // 🚨 Instead of calling handleNewChat directly
           const newSessionId = generateUniqueId();
           setChatHistorySessions([{
             id: newSessionId,
             title: "New Chat",
             messages: []
           }]);
           setActiveSessionId(newSessionId);
           setActiveChatMessages([]);
           setPrompt("");
           setError("");

         }
       } catch (err) {
         if (!isMounted) return;
         console.error("Error loading initial chat history:", err);
         setError(err.message || "Failed to load chat history.");
       }
     } else if (!user && !authLoading) {
       setChatHistorySessions([]);
       setActiveChatMessages([]);
       setActiveSessionId(null);
     }
   };

   loadInitialChatHistory();
   return () => { isMounted = false; };
 }, [user, authLoading, aiMode]); // 👈 added aiMode

 // Handle mode switching
 useEffect(() => {
   if (user && !authLoading) {
     const loadModeSessions = async () => {
       try {
         const sessions = await fetchChatHistoryApi(user, aiMode);
         setChatHistorySessions(sessions);
         if (sessions.length > 0) {
           setActiveChatMessages(sessions[0].messages);
           setActiveSessionId(sessions[0].id);
         } else {
           const newSessionId = generateUniqueId();
           setChatHistorySessions([{
             id: newSessionId,
             title: "New Chat",
             messages: []
           }]);
           setActiveSessionId(newSessionId);
           setActiveChatMessages([]);
         }
         setPrompt('');
         setError('');
         setSelectedFile(null);
         setFilePreview(null);
       } catch (err) {
         console.error("Error loading mode sessions:", err);
         setError(err.message || "Failed to load chat history.");
       }
     };
     loadModeSessions();
   }
 }, [aiMode, user, authLoading]);

 useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatMessages]);

  // Sync chatHistorySessions to localStorage
  useEffect(() => {
    if (user && chatHistorySessions.length > 0) {
      localStorage.setItem(getUserChatKey(user.id, aiMode), JSON.stringify(chatHistorySessions));
    }
  }, [chatHistorySessions, user, aiMode]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => setFilePreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null); // No preview for non-image files
      }
    }
  };


  const handleImageDoubleClick = (imageSrc) => {
    setEnlargedImage(imageSrc);
  };

  const handleCloseEnlargedImage = () => {
    setEnlargedImage(null);
  };

  const handleGenerateContent = async (e) => {
    e.preventDefault();
    if (!prompt.trim() && !selectedFile) return;

    setApiLoading(true);
    setError('');

    if (!user) {
      setError("You must be logged in to chat.");
      setApiLoading(false);
      return;
    }

    const currentPrompt = prompt;
    const currentFile = selectedFile;
    const currentFilePreview = filePreview;

    setPrompt('');
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const now = Date.now();
    const newTimestamp = {
      _seconds: Math.floor(now / 1000),
      _nanoseconds: (now % 1000) * 1_000_000
    };

    let currentConversationId = activeSessionId;
    if (!currentConversationId) {
      currentConversationId = generateUniqueId();
      setActiveSessionId(currentConversationId);
    }

    // Handle file upload if present
    if (currentFile) {
      try {
        console.log('Chats.js: Processing file upload');
        const fileData = await processChatFileApi(user, currentFile, currentConversationId, currentPrompt || null, aiMode);

        const newUserMessage = {
          type: 'user',
          text: currentPrompt
            ? `${currentPrompt}\n\n[${fileData.fileType === 'image' ? 'Image' : 'File'} uploaded] ${fileData.extractedText}`
            : `[${fileData.fileType === 'image' ? 'Image' : 'File'} uploaded] ${fileData.extractedText}`,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          filePreview: currentFilePreview,
          fileName: fileData.fileName,
          fileType: fileData.fileType
        };
        setActiveChatMessages(prev => [...prev, newUserMessage]);

        const newAiMessage = {
          type: 'ai',
          text: fileData.aiResponse,
          timestamp: {
            _seconds: Math.floor(Date.now() / 1000),
            _nanoseconds: (Date.now() % 1000) * 1_000_000
          },
          conversationId: currentConversationId,
        };
        setActiveChatMessages(prev => [...prev, newAiMessage]);

        setChatHistorySessions(prevSessions => {
          const sessionToUpdateIndex = prevSessions.findIndex(session => session.id === currentConversationId);
          if (sessionToUpdateIndex !== -1) {
            const updatedSessions = [...prevSessions];
            const session = updatedSessions[sessionToUpdateIndex];
            // Check if messages are already added to prevent duplication
            const lastMessage = session.messages[session.messages.length - 1];
            if (!lastMessage || lastMessage.text !== newAiMessage.text) {
              session.messages = [...session.messages, newUserMessage, newAiMessage];
            }
            if (session.title === 'New Chat' || session.title.startsWith('Chat from')) {
              session.title = fileData.fileType === 'image' ? 'Image Analysis Chat' : 'Document Analysis Chat';
            }
            return updatedSessions;
          } else {
            return [{
              id: currentConversationId,
              title: fileData.fileType === 'image' ? 'Image Analysis Chat' : 'Document Analysis Chat',
              messages: [newUserMessage, newAiMessage]
            }, ...prevSessions];
          }
        });

        await saveChatEntryApi(user, {
          prompt: newUserMessage.text,
          response: newAiMessage.text,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          filePreview: currentFilePreview,
          mode: aiMode,
        });

      } catch (err) {
        console.error('Image processing error:', err);
        setError(err.message || 'Failed to process image.');
        setApiLoading(false);
        return;
      }
    } else {
      // Handle text-only message
      const newUserMessage = {
        type: 'user',
        text: currentPrompt,
        timestamp: newTimestamp,
        conversationId: currentConversationId,
        mode: aiMode,
        targetLanguage: aiMode === 'translate' ? targetLanguage : null,
      };
      setActiveChatMessages(prev => [...prev, newUserMessage]);

      try {
        console.log('Chats.js: Calling generateContentApi with:', {
          userId: user?.id,
          prompt: currentPrompt?.substring(0, 50) + '...',
          conversationId: currentConversationId,
          mode: aiMode,
          targetLanguage: aiMode === 'translate' ? targetLanguage : null
        });
        const generateData = await generateContentApi(user, currentPrompt, currentConversationId, aiMode, aiMode === 'translate' ? targetLanguage : null);
        const newResponse = generateData.generatedContent;

        const newAiMessage = {
          type: 'ai',
          text: newResponse,
          timestamp: {
            _seconds: Math.floor(Date.now() / 1000),
            _nanoseconds: (Date.now() % 1000) * 1_000_000
          },
          conversationId: currentConversationId,
          mode: aiMode,
          targetLanguage: aiMode === 'translate' ? targetLanguage : null,
        };
        setActiveChatMessages(prev => [...prev, newAiMessage]);

        setChatHistorySessions(prevSessions => {
          const sessionToUpdateIndex = prevSessions.findIndex(session => session.id === currentConversationId);
          if (sessionToUpdateIndex !== -1) {
            const updatedSessions = [...prevSessions];
            const session = updatedSessions[sessionToUpdateIndex];
            // Check if messages are already added to prevent duplication
            const lastMessage = session.messages[session.messages.length - 1];
            if (!lastMessage || lastMessage.text !== newAiMessage.text) {
              session.messages = [...session.messages, newUserMessage, newAiMessage];
            }
            if (session.title === 'New Chat' || session.title.startsWith('Chat from')) {
              const firstPrompt = session.messages.find(msg => msg.type === 'user')?.text || 'Untitled Chat';
              session.title = firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt;
            }
            return updatedSessions;
          } else {
            const firstPrompt = newUserMessage.text || 'Untitled Chat';
            const newSessionTitle = firstPrompt.length > 30 ? firstPrompt.slice(0, 30) + '...' : firstPrompt;
            return [{
              id: currentConversationId,
              title: newSessionTitle,
              messages: [newUserMessage, newAiMessage]
            }, ...prevSessions];
          }
        });

        await saveChatEntryApi(user, {
          prompt: currentPrompt,
          response: newResponse,
          timestamp: newTimestamp,
          conversationId: currentConversationId,
          mode: aiMode,
        });

      } catch (err) {
        console.error('Frontend error:', err);
        setError(err.message || 'Failed to get response or save chat.');
        setActiveChatMessages(prev => {
          const userMsgIndex = prev.findIndex(msg => msg === newUserMessage);
          return userMsgIndex !== -1 ? prev.slice(0, userMsgIndex) : prev;
        });
        setChatHistorySessions(prevSessions => {
          if (!activeSessionId) {
              return prevSessions.filter(session => session.id !== currentConversationId);
          }
          return prevSessions.map(session => {
              if (session.id === activeSessionId && session.messages.length > 1) {
                  return { ...session, messages: session.messages.slice(0, -2) };
              }
              return session;
          });
        });
      }
    }

    setApiLoading(false);
  };

  const handleDeleteCurrentResult = (mode) => {

    const filteredMsgs = activeChatMessages.filter(msg => msg.mode === mode);

    const pairs = [];

    for (let i = 0; i < filteredMsgs.length; i += 2) {

      const userMsg = filteredMsgs[i];

      const aiMsg = filteredMsgs[i + 1];

      if (userMsg && aiMsg && userMsg.type === 'user' && aiMsg.type === 'ai') {

        pairs.push({ userMsg, aiMsg });

      }

    }

    if (pairs.length > 0) {

      const lastPair = pairs[pairs.length - 1];

      setActiveChatMessages(prev => prev.filter(msg => msg !== lastPair.userMsg && msg !== lastPair.aiMsg));

      setChatHistorySessions(prevSessions =>

        prevSessions.map(session =>

          session.id === activeSessionId

            ? {

                ...session,

                messages: session.messages.filter(msg => msg !== lastPair.userMsg && msg !== lastPair.aiMsg)

              }

            : session

        )

      );

    }

  };

  const loadChatSession = (session) => {
    setActiveChatMessages(session.messages);
    setActiveSessionId(session.id);
    setPrompt('');
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
    setIsSidebarOpen(false); // Close sidebar on mobile after selecting chat
  };

  const handleDeleteChatSession = async (sessionIdToDelete) => {
    if (!user) {
      setError("You must be logged in to delete chats.");
      return;
    }

    const sessionToDelete = chatHistorySessions.find(session => session.id === sessionIdToDelete);

    if (sessionToDelete && sessionToDelete.messages.length === 0) {
      const isCurrentlyActive = activeSessionId === sessionIdToDelete;
      const updatedSessions = chatHistorySessions.filter(session => session.id !== sessionIdToDelete);
      setChatHistorySessions(updatedSessions);

      if (isCurrentlyActive) {
        if (updatedSessions.length === 0) {
          setActiveChatMessages([]);
          setActiveSessionId(null);
        } else {
          handleNewChat();
        }
      }
      setError('');
      console.log(`Frontend: Deleted empty chat session ${sessionIdToDelete} from UI.`);
      return;
    }

    try {
      await deleteChatSessionApi(user, sessionIdToDelete, aiMode);

      const isCurrentlyActive = activeSessionId === sessionIdToDelete;
      const updatedSessions = chatHistorySessions.filter(session => session.id !== sessionIdToDelete);
      setChatHistorySessions(updatedSessions);

      if (isCurrentlyActive) {
        if (updatedSessions.length === 0) {
          setActiveChatMessages([]);
          setActiveSessionId(null);
        } else {
          handleNewChat();
        }
      }
      setError('');
      console.log(`Frontend: Successfully deleted chat session ${sessionIdToDelete} from backend and UI.`);
    } catch (err) {
      console.error('Error deleting chat session:', err);
      setError(err.message || 'Failed to delete chat session.');
    }
  };

  // Translator functions
  const performTranslation = useCallback(async (text) => {
    if (!text.trim() || !user) {
      setTranslatorOutput('');
      return;
    }

    try {
      const result = await generateContentApi(user, text, 'translator-session', 'translate', targetLanguage);
      setTranslatorOutput(result.generatedContent);
    } catch (error) {
      console.error('Translation error:', error);
      setTranslatorOutput('Translation failed. Please try again.');
    }
  }, [user, targetLanguage]);

  const handleTranslatorInputChange = useCallback((value) => {
    setTranslatorInput(value);
    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }
    translateTimeoutRef.current = setTimeout(() => {
      performTranslation(value);
    }, 500); // 500ms debounce
  }, [performTranslation]);

  const handleSwapLanguages = () => {
    const temp = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(temp);
    // Swap the texts as well
    const tempText = translatorInput;
    setTranslatorInput(translatorOutput);
    setTranslatorOutput(tempText);
  };

  const handleClearTranslator = () => {
    setTranslatorInput('');
    setTranslatorOutput('');
  };

  if (authLoading) {
    return (
      <div className="chat-page-content">
        <div className="chat-history-sidebar-section">
          <div className="history-panel-header">
            <Skeleton width="60%" height={30} />
            <Skeleton width={120} height={35} />
          </div>
          <div style={{ padding: '10px' }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} style={{ marginBottom: '10px' }}>
                <Skeleton width="100%" height={40} />
              </div>
            ))}
          </div>
        </div>
        <div className="chat-main-section">
          <div className="chat-messages-display">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="chat-message-card ai-message" style={{ marginBottom: '15px' }}>
                <div className="message-content">
                  <Skeleton width="80%" height={20} />
                  <Skeleton width="60%" height={20} style={{ marginTop: '5px' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <Skeleton width="100%" height={50} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page-content">
      <button className="hamburger-menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
        <FaBars size="1.2em" />
      </button>
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
      <div className={`chat-history-sidebar-section ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="history-panel-header">
          <h2>Your Chats</h2>
          <button className="new-chat-button" onClick={handleNewChat} disabled={apiLoading || !user}>
            <FaPlus size="1.2em" /> New Chat
          </button>
        </div>
        <ul className="chat-history-list">
          {chatHistorySessions.map((session) => (
            <li
              key={session.id}
                className={`chat-history-item ${activeSessionId === session.id ? 'active-session' : ''}`}
              onClick={() => loadChatSession(session)}
            >
              <FaComments className="chat-folder-icon" size="1.2em" />
              <strong className="chat-title-text">{session.title}</strong>
              <small>({session.messages.length} msg)</small>
              <button
                className="delete-session-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChatSession(session.id);
                }}
                title="Delete Chat"
              >
                <FaTrash size="1.1em" />
              </button>
            </li>
          ))}
          {chatHistorySessions.length === 0 && <p className="no-history-message">No saved chat sessions.</p>}
        </ul>
      </div>

      <div className="chat-main-section">
        {/* AI Mode Selector - always visible */}
        <div className="ai-mode-selector" style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              className={`mode-button ${aiMode === 'chat' ? 'active' : ''}`}
              onClick={() => setAiMode('chat')}
              style={{
                padding: '8px 16px',
                border: '1px solid #3458bb',
                backgroundColor: aiMode === 'chat' ? '#3458bb' : 'white',
                color: aiMode === 'chat' ? 'white' : '#3458bb',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              💬 AI Chat
            </button>
            <button
              className={`mode-button ${aiMode === 'summarize' ? 'active' : ''}`}
              onClick={() => setAiMode('summarize')}
              style={{
                padding: '8px 16px',
                border: '1px solid #3458bb',
                backgroundColor: aiMode === 'summarize' ? '#3458bb' : 'white',
                color: aiMode === 'summarize' ? 'white' : '#3458bb',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              📝 Summarizer
            </button>
            <button
              className={`mode-button ${aiMode === 'paraphrase' ? 'active' : ''}`}
              onClick={() => setAiMode('paraphrase')}
              style={{
                padding: '8px 16px',
                border: '1px solid #3458bb',
                backgroundColor: aiMode === 'paraphrase' ? '#3458bb' : 'white',
                color: aiMode === 'paraphrase' ? 'white' : '#3458bb',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🔄 Paraphrasing
            </button>
            <button
              className={`mode-button ${aiMode === 'translate' ? 'active' : ''}`}
              onClick={() => setAiMode('translate')}
              style={{
                padding: '8px 16px',
                border: '1px solid #3458bb',
                backgroundColor: aiMode === 'translate' ? '#3458bb' : 'white',
                color: aiMode === 'translate' ? 'white' : '#3458bb',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              🌐 Translator
            </button>
          </div>

        </div>

        <div className="chat-messages-display">
          {/* Chat Mode Container */}
          {aiMode === 'chat' && (
            <div className="mode-container chat-mode-container">
              {activeChatMessages.filter(msg => msg.mode === aiMode || !msg.mode).length === 0 && activeSessionId && !apiLoading && !error && user && (
                <div className="mode-description" style={{ padding: '15px', backgroundColor: '#e6f7ff', borderRadius: '8px', marginBottom: '15px', border: '1px solid #3458bb' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>💬 AI Chat Mode</h3>
                  <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5' }}>
                    Engage in natural conversations with the AI. Ask questions, get explanations, or discuss any topic. The AI can help with learning, problem-solving, creative writing, and much more.
                  </p>
                </div>
              )}
              {activeChatMessages.length === 0 && !apiLoading && !error && user && !activeSessionId && (
                <p className="no-messages-placeholder">
                  Select a chat from the left or click "New Chat" to begin!
                </p>
              )}
              {activeChatMessages.filter(msg => msg.mode === aiMode || !msg.mode).map((msg, index) => (
                <div key={index} className={`chat-message-card ${msg.type}-message`}>
                  <div className="message-content">
                    {msg.type === 'ai' && (
                      <small className="message-sender">Eduretrieve</small>
                    )}
                    {msg.mode && msg.mode !== 'chat' && (
                      <small className="message-mode" style={{
                        display: 'block',
                        fontSize: '12px',
                        color: '#666',
                        marginBottom: '5px',
                        textTransform: 'capitalize'
                      }}>
                        Mode: {msg.mode} {msg.targetLanguage ? `→ ${msg.targetLanguage}` : ''}
                      </small>
                    )}
                    {msg.filePreview && (
                      <div className="message-image-container">
                        <img
                          src={msg.filePreview}
                          alt="Uploaded"
                          className="message-image"
                          onClick={() => handleImageDoubleClick(msg.filePreview)}
                          style={{ cursor: 'pointer' }}
                        />
                      </div>
                    )}
                    {msg.fileName && !msg.filePreview && (
                      <div className="message-file-info">
                        <p>📄 {msg.fileName}</p>
                      </div>
                    )}
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                    {msg.timestamp && (
                      <small className="message-timestamp">
                        {formatFirebaseTimestamp(msg.timestamp)}
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summarizer Mode Container */}
          {aiMode === 'summarize' && (
            <div className="mode-container summarize-mode-container">
              <div className="mode-description" style={{ padding: '15px', backgroundColor: '#f0f8ff', borderRadius: '8px', marginBottom: '15px', border: '1px solid #3458bb' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>📝 Summarizer Mode</h3>
                <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5' }}>
                  The Summarizer analyzes your input text and generates concise, key-point summaries. It identifies main ideas, eliminates redundancy, and preserves essential information while reducing length. Perfect for quickly understanding long documents, articles, or conversations.
                </p>
              </div>
              <div className="dedicated-input-container" style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '20px', border: '1px solid #3458bb' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>Enter Text to Summarize</h4>
                <form onSubmit={handleGenerateContent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,.pdf,.docx,.txt,.pptx"
                    style={{ display: 'none' }}
                    id="summarize-file-upload"
                  />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows="6"
                    placeholder="Paste or type the text you want to summarize..."
                    style={{
                      width: '98%',
                      padding: '12px',
                      border: '1px solid #3458bb',
                      borderRadius: '4px',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                    disabled={apiLoading}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerateContent(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={apiLoading || (!prompt.trim() && !selectedFile)}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#3458bb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      alignSelf: 'flex-start'
                    }}
                  >
                    {apiLoading ? 'Processing...' : 'Summarize'}
                  </button>
                </form>
              </div>
              {activeChatMessages.length === 0 && activeSessionId && !apiLoading && !error && user && (
                <p className="no-messages-placeholder">
                  Start typing to begin using this mode!
                </p>
              )}
              {(() => {
                const filteredMsgs = activeChatMessages.filter(msg => msg.mode === aiMode);
                const pairs = [];
                for (let i = 0; i < filteredMsgs.length; i += 2) {
                  const userMsg = filteredMsgs[i];
                  const aiMsg = filteredMsgs[i + 1];
                  if (userMsg && aiMsg && userMsg.type === 'user' && aiMsg.type === 'ai') {
                    pairs.push({ userMsg, aiMsg });
                  }
                }
                return pairs.map((pair, index) => (
                  <div key={index} className="comparative-container" style={{ display: 'flex', gap: '20px', marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                    <div className="original-section" style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#3458bb', fontSize: '16px' }}>Original Text</h4>
                      <div className="message-content" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                        {pair.userMsg.filePreview && (
                          <div className="message-image-container" style={{ marginBottom: '10px' }}>
                            <img
                              src={pair.userMsg.filePreview}
                              alt="Uploaded"
                              className="message-image"
                              onClick={() => handleImageDoubleClick(pair.userMsg.filePreview)}
                              style={{ cursor: 'pointer', maxWidth: '100%', maxHeight: '200px' }}
                            />
                          </div>
                        )}
                        {pair.userMsg.fileName && !pair.userMsg.filePreview && (
                          <div className="message-file-info" style={{ marginBottom: '10px' }}>
                            <p>📄 {pair.userMsg.fileName}</p>
                          </div>
                        )}
                        <ReactMarkdown>{pair.userMsg.text}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="processed-section" style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#3458bb', fontSize: '16px' }}>Summary</h4>
                        <button
                          className="delete-result-button"
                          onClick={() => handleDeleteCurrentResult(aiMode)}
                          title="Delete this result"
                          style={{
                            backgroundColor: '#e04958',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div className="message-content" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                        <small className="message-sender" style={{ display: 'block', marginBottom: '5px' }}>EduRetrieve</small>
                        <ReactMarkdown>{pair.aiMsg.text}</ReactMarkdown>
                        {pair.aiMsg.timestamp && (
                          <small className="message-timestamp" style={{ display: 'block', marginTop: '10px', fontSize: '12px', color: '#666' }}>
                            {formatFirebaseTimestamp(pair.aiMsg.timestamp)}
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Paraphrasing Mode Container */}
          {aiMode === 'paraphrase' && (
            <div className="mode-container paraphrase-mode-container">
              <div className="mode-description" style={{ padding: '15px', backgroundColor: '#fff5ee', borderRadius: '8px', marginBottom: '15px', border: '1px solid #3458bb' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>🔄 Paraphrasing Mode</h3>
                <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5' }}>
                  The Paraphraser rephrases your text while maintaining the original meaning. It uses different words and sentence structures to express the same ideas, helping you avoid plagiarism, improve clarity, or create variations of your content.
                </p>
              </div>
              <div className="dedicated-input-container" style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '20px', border: '1px solid #3458bb' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>Enter Text to Paraphrase</h4>
                <form onSubmit={handleGenerateContent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,.pdf,.docx,.txt,.pptx"
                    style={{ display: 'none' }}
                    id="paraphrase-file-upload"
                  />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows="6"
                    placeholder="Paste or type the text you want to rephrase..."
                    style={{
                      width: '98%',
                      padding: '10px',
                      border: '1px solid #3458bb',
                      borderRadius: '4px',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                    disabled={apiLoading}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerateContent(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={apiLoading || (!prompt.trim() && !selectedFile)}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#3458bb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      alignSelf: 'flex-start'
                    }}
                  >
                    {apiLoading ? 'Processing...' : 'Paraphrase'}
                  </button>
                </form>
              </div>
              {activeChatMessages.length === 0 && activeSessionId && !apiLoading && !error && user && (
                <p className="no-messages-placeholder">
                  Start typing to begin using this mode!
                </p>
              )}
              {(() => {
                const filteredMsgs = activeChatMessages.filter(msg => msg.mode === aiMode);
                const pairs = [];
                for (let i = 0; i < filteredMsgs.length; i += 2) {
                  const userMsg = filteredMsgs[i];
                  const aiMsg = filteredMsgs[i + 1];
                  if (userMsg && aiMsg && userMsg.type === 'user' && aiMsg.type === 'ai') {
                    pairs.push({ userMsg, aiMsg });
                  }
                }
                // Show only the most recent pair for paraphrasing mode
                const recentPairs = pairs.slice(-1);
                return recentPairs.map((pair, index) => (
                  <div key={index} className="comparative-container" style={{ display: 'flex', gap: '20px', marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                    <div className="original-section" style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#3458bb', fontSize: '16px' }}>Original Text</h4>
                      <div className="message-content" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                        {pair.userMsg.filePreview && (
                          <div className="message-image-container" style={{ marginBottom: '10px' }}>
                            <img
                              src={pair.userMsg.filePreview}
                              alt="Uploaded"
                              className="message-image"
                              onClick={() => handleImageDoubleClick(pair.userMsg.filePreview)}
                              style={{ cursor: 'pointer', maxWidth: '100%', maxHeight: '200px' }}
                            />
                          </div>
                        )}
                        {pair.userMsg.fileName && !pair.userMsg.filePreview && (
                          <div className="message-file-info" style={{ marginBottom: '10px' }}>
                            <p>📄 {pair.userMsg.fileName}</p>
                          </div>
                        )}
                        <ReactMarkdown>{pair.userMsg.text}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="processed-section" style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#3458bb', fontSize: '16px' }}>Paraphrased Version</h4>
                      </div>
                      <div className="message-content" style={{ padding: '10px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                        <small className="message-sender" style={{ display: 'block', marginBottom: '5px' }}>Eduretrieve</small>
                        <ReactMarkdown>{pair.aiMsg.text}</ReactMarkdown>
                        {pair.aiMsg.timestamp && (
                          <small className="message-timestamp" style={{ display: 'block', marginTop: '10px', fontSize: '12px', color: '#666' }}>
                            {formatFirebaseTimestamp(pair.aiMsg.timestamp)}
                          </small>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Translator Mode Container */}
          {aiMode === 'translate' && (
            <div className="mode-container translate-mode-container">
              <div className="mode-description" style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', marginBottom: '15px', border: '1px solid #3458bb' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>🌐 Translator Mode</h3>
                <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5' }}>
                  Translate between any languages with real-time translation. Type in the left box and see the translation appear instantly in the right box.
                </p>
              </div>

              {/* Language Selectors and Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #3458bb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    minWidth: '120px'
                  }}
                >
                  <option value="English">English</option>
                  <option value="Filipino">Filipino</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Russian">Russian</option>
                  <option value="Italian">Italian</option>
                  <option value="Dutch">Dutch</option>
                  <option value="Swedish">Swedish</option>
                  <option value="Turkish">Turkish</option>
                  <option value="Vietnamese">Vietnamese</option>
                  <option value="Thai">Thai</option>
                  <option value="Indonesian">Indonesian</option>
                  <option value="Polish">Polish</option>
                  <option value="Czech">Czech</option>
                  <option value="Greek">Greek</option>
                  <option value="Hebrew">Hebrew</option>
                  <option value="Bengali">Bengali</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Marathi">Marathi</option>
                  <option value="Urdu">Urdu</option>
                  <option value="Persian">Persian</option>
                  <option value="Malay">Malay</option>
                  <option value="Swahili">Swahili</option>
                  <option value="Hausa">Hausa</option>
                  <option value="Yoruba">Yoruba</option>
                  <option value="Amharic">Amharic</option>
                  <option value="Zulu">Zulu</option>
                  <option value="Xhosa">Xhosa</option>
                  <option value="Afrikaans">Afrikaans</option>
                  <option value="Somali">Somali</option>
                  <option value="Haitian Creole">Haitian Creole</option>
                  <option value="Maori">Maori</option>
                  <option value="Samoan">Samoan</option>
                  <option value="Tongan">Tongan</option>
                  <option value="Fijian">Fijian</option>
                  <option value="Kiribati">Kiribati</option>
                  <option value="Marshallese">Marshallese</option>
                  <option value="Palauan">Palauan</option>
                  <option value="Chamorro">Chamorro</option>
                  <option value="Tahitian">Tahitian</option>
                </select>

                <button
                  onClick={handleSwapLanguages}
                  style={{
                    padding: '8px',
                    backgroundColor: '#3458bb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px'
                  }}
                  title="Swap languages"
                >
                  ⇄
                </button>

                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #3458bb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white',
                    minWidth: '120px'
                  }}
                >
                  <option value="Filipino">Filipino</option>
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Russian">Russian</option>
                  <option value="Italian">Italian</option>
                  <option value="Dutch">Dutch</option>
                  <option value="Swedish">Swedish</option>
                  <option value="Turkish">Turkish</option>
                  <option value="Vietnamese">Vietnamese</option>
                  <option value="Thai">Thai</option>
                  <option value="Indonesian">Indonesian</option>
                  <option value="Polish">Polish</option>
                  <option value="Czech">Czech</option>
                  <option value="Greek">Greek</option>
                  <option value="Hebrew">Hebrew</option>
                  <option value="Bengali">Bengali</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Marathi">Marathi</option>
                  <option value="Urdu">Urdu</option>
                  <option value="Persian">Persian</option>
                  <option value="Malay">Malay</option>
                  <option value="Swahili">Swahili</option>
                  <option value="Hausa">Hausa</option>
                  <option value="Yoruba">Yoruba</option>
                  <option value="Amharic">Amharic</option>
                  <option value="Zulu">Zulu</option>
                  <option value="Xhosa">Xhosa</option>
                  <option value="Afrikaans">Afrikaans</option>
                  <option value="Somali">Somali</option>
                  <option value="Haitian Creole">Haitian Creole</option>
                  <option value="Maori">Maori</option>
                  <option value="Samoan">Samoan</option>
                  <option value="Tongan">Tongan</option>
                  <option value="Fijian">Fijian</option>
                  <option value="Kiribati">Kiribati</option>
                  <option value="Marshallese">Marshallese</option>
                  <option value="Palauan">Palauan</option>
                  <option value="Chamorro">Chamorro</option>
                  <option value="Tahitian">Tahitian</option>
                </select>

                <button
                  onClick={handleClearTranslator}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#e04958',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                  title="Clear all text"
                >
                  Clear
                </button>
              </div>

              {/* Translation Columns */}
              <div style={{ display: 'flex', gap: '20px', height: '400px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>{sourceLanguage}</h4>
                  <textarea
                    value={translatorInput}
                    onChange={(e) => handleTranslatorInputChange(e.target.value)}
                    placeholder={`Type or paste text in ${sourceLanguage}...`}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #3458bb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'none',
                      outline: 'none'
                    }}
                    disabled={!user}
                  />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#3458bb' }}>{targetLanguage}</h4>
                  <textarea
                    value={translatorOutput}
                    readOnly
                    placeholder="Translation will appear here..."
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #3458bb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'none',
                      backgroundColor: '#f9f9f9',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {!user && (
                <p style={{ textAlign: 'center', color: '#666', marginTop: '10px' }}>
                  Please log in to use the translator.
                </p>
              )}
            </div>
          )}

          {apiLoading && (
            <div className="chat-message-card ai-message">
              <div className="message-content">
                <div className="thinking-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatMessagesEndRef} />
        </div>

        {aiMode === 'chat' && (
          <div className="chat-input-area">
            <form onSubmit={handleGenerateContent} className="chat-input-form">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,.pdf,.docx,.txt,.pptx"
                style={{ display: 'none' }}
                id="file-upload"
              />
              <label htmlFor="file-upload" className="file-upload-button">
                <FaFileUpload color="#3458bb" size="1.5em"/>
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows="1"
                placeholder={
                  user
                    ? "Type your message or upload a file or image..."
                    : "Please log in to chat."
                }
                disabled={apiLoading || !user || !activeSessionId}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateContent(e);
                  }
                }}
              ></textarea>
              <button className="send-button" disabled={apiLoading || !user || !activeSessionId || (!prompt.trim() && !selectedFile)}>
                {apiLoading ? <FaStop className="stop-icon" size="1.3em" /> : <FaPaperPlane className='send-icon' size="1.3em" />}
              </button>
            </form>
            {error && <p className="error-message">{error}</p>}
            {!user && !error && <p className="info-message">Please sign in to start chatting.</p>}
            {!activeSessionId && user && !error && <p className="info-message">Click "New Chat" or select a past chat to begin.</p>}
          </div>
        )}
      </div>

      {enlargedImage && (
        <div className="image-modal-overlay" onClick={handleCloseEnlargedImage}>
          <div className="image-modal-content">
            <img src={enlargedImage} alt="Enlarged" className="enlarged-image" />
            <button className="close-image-modal" onClick={handleCloseEnlargedImage}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chats;