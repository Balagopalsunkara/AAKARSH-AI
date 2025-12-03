import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import styles from '../styles/Chat.module.css';
import MessageRenderer from '../components/MessageRenderer';
import ApiConfiguration from '../components/ApiConfiguration';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const STORAGE_KEY_PREFIX = 'ai-app-conv-';
const ACTIVE_CONVERSATION_KEY = 'ai-app-active-conversation';

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [searchMode, setSearchMode] = useState('auto');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchModels();
    loadConversation();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (conversationId && messages.length > 0) {
      saveConversation();
    }
  }, [messages, conversationId]);

  const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateConversationId = () => `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const loadConversation = () => {
    try {
      const activeId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);

      if (activeId) {
        const savedConv = localStorage.getItem(STORAGE_KEY_PREFIX + activeId);
        if (savedConv) {
          const conversation = JSON.parse(savedConv);
          setMessages(conversation.messages || []);
          setConversationId(activeId);
          if (conversation.model) {
            setSelectedModel(conversation.model);
          }
          loadConversationsList();
          return;
        }
      }

      const newId = generateConversationId();
      setConversationId(newId);
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, newId);
      loadConversationsList();
    } catch (error) {
      console.error('Failed to load conversation:', error);
      const newId = generateConversationId();
      setConversationId(newId);
      loadConversationsList();
    }
  };

  const saveConversation = () => {
    try {
      const conversation = {
        id: conversationId,
        messages,
        model: selectedModel,
        updatedAt: new Date().toISOString(),
        title: messages[0]?.content?.substring(0, 50) || 'New Conversation',
      };
      localStorage.setItem(STORAGE_KEY_PREFIX + conversationId, JSON.stringify(conversation));
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
      loadConversationsList();
    } catch (error) {
      console.error('Failed to save conversation:', error);
      toast.error('Failed to save conversation');
    }
  };

  const clearConversation = () => {
    if (messages.length === 0) {
      toast('No conversation to clear', { icon: '!' });
      return;
    }

    if (confirm('Are you sure you want to clear this conversation? This cannot be undone.')) {
      try {
        if (conversationId) {
          localStorage.removeItem(STORAGE_KEY_PREFIX + conversationId);
        }

        const newId = generateConversationId();
        setConversationId(newId);
        setMessages([]);
        localStorage.setItem(ACTIVE_CONVERSATION_KEY, newId);
        loadConversationsList();
        toast.success('Conversation cleared');
        setMenuOpen(false);
      } catch (error) {
        console.error('Failed to clear conversation:', error);
        toast.error('Failed to clear conversation');
      }
    }
  };

  const startNewConversation = () => {
    if (messages.length > 0) {
      saveConversation();
    }

    const newId = generateConversationId();
    setConversationId(newId);
    setMessages([]);
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, newId);
    toast.success('Started new conversation');
    loadConversationsList();
    setMenuOpen(false);
  };

  const loadConversationsList = () => {
    try {
      const allConversations = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
          const data = localStorage.getItem(key);
          if (data) {
            try {
              const conv = JSON.parse(data);
              allConversations.push(conv);
            } catch (e) {
              console.error('Failed to parse conversation:', e);
            }
          }
        }
      }
      allConversations.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setConversations(allConversations);
    } catch (error) {
      console.error('Failed to load conversations list:', error);
    }
  };

  const switchConversation = (convId) => {
    try {
      if (conversationId && messages.length > 0) {
        saveConversation();
      }

      const savedConv = localStorage.getItem(STORAGE_KEY_PREFIX + convId);
      if (savedConv) {
        const conversation = JSON.parse(savedConv);
        setMessages(conversation.messages || []);
        setConversationId(convId);
        if (conversation.model) {
          setSelectedModel(conversation.model);
        }
        localStorage.setItem(ACTIVE_CONVERSATION_KEY, convId);
        setSidebarOpen(false);
        toast.success('Switched conversation');
      }
    } catch (error) {
      console.error('Failed to switch conversation:', error);
      toast.error('Failed to switch conversation');
    }
  };

  const deleteConversation = (convId, e) => {
    e.stopPropagation();

    if (confirm('Delete this conversation? This cannot be undone.')) {
      try {
        localStorage.removeItem(STORAGE_KEY_PREFIX + convId);

        if (convId === conversationId) {
          const newId = generateConversationId();
          setConversationId(newId);
          setMessages([]);
          localStorage.setItem(ACTIVE_CONVERSATION_KEY, newId);
        }

        loadConversationsList();
        toast.success('Conversation deleted');
      } catch (error) {
        console.error('Failed to delete conversation:', error);
        toast.error('Failed to delete conversation');
      }
    }
  };

  const exportConversation = (format) => {
    if (messages.length === 0) {
      toast.error('No conversation to export');
      return;
    }

    let content = '';
    if (format === 'json') {
      content = JSON.stringify({ messages, model: selectedModel }, null, 2);
    } else {
      content = messages.map(m => `**${m.role === 'user' ? 'You' : 'AI'}**: ${m.content}`).join('\n\n');
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${conversationId}.${format === 'json' ? 'json' : 'md'}`;
    a.click();
    setMenuOpen(false);
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  const regenerateMessage = async () => {
    if (messages.length === 0 || loading) return;

    const lastMsg = messages[messages.length - 1];
    let newMessages = [...messages];

    if (lastMsg.role === 'assistant') {
      newMessages.pop();
    }

    if (newMessages.length === 0) return;

    const lastUserMsg = newMessages[newMessages.length - 1];
    if (lastUserMsg.role !== 'user') return;

    setMessages(newMessages);
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', modelName: selectedModel }
    ]);

    try {
      const response = await fetch(apiUrl('/api/v1/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          model: selectedModel,
        }),
      });

      if (!response.ok) throw new Error('Failed to start streaming');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim() === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIndex = msgs.length - 1;
                  const last = { ...msgs[lastIndex] };
                  if (last.role === 'assistant') {
                    last.content += parsed.content;
                    msgs[lastIndex] = last;
                  }
                  return msgs;
                });
              }
            } catch (e) { }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        last.content += `\n[Error: ${error.message}]`;
        return msgs;
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch(apiUrl('/api/v1/models'));
      const data = await response.json();

      setModels(data.models || []);
      const defaultModel =
        data.models?.find((m) => m.id?.toLowerCase().includes('tinyllama'))?.id ||
        data.default ||
        data.models?.[0]?.id;
      setSelectedModel(defaultModel || '');
    } catch (error) {
      console.error('Failed to fetch models:', error);
      toast.error('Using offline mode');
      setModels([{ id: 'local/instruct', name: 'Offline Assistant' }]);
      setSelectedModel('local/instruct');
    }
  };

  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image too large (max 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        toast.error('Voice input failed');
      };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? ' ' : '') + transcript);
      };

      recognition.start();
    } else {
      toast.error('Voice input not supported in this browser');
    }
  };

  const speakMessage = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      // Remove markdown symbols for cleaner speech
      utterance.text = text.replace(/[*#`_\[\]]/g, '');
      window.speechSynthesis.speak(utterance);
    } else {
      toast.error('Text-to-speech not supported');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && !selectedImage) return;

    const userMessage = {
      role: 'user',
      content: input,
      ...(selectedImage && { image: selectedImage })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    setLoading(true);

    // Create a placeholder for the assistant response
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', modelName: selectedModel }
    ]);

    try {
      const response = await fetch(apiUrl('/api/v1/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel,
          options: { searchMode }
        }),
      });

      if (!response.ok) throw new Error('Failed to start streaming');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim() === '[DONE]') break;
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        lastMsg.content += `\n[Error: ${error.message}]`;
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Chat | AI-APP</title>
      </Head>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1c1c21',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />

      <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>Conversations</h2>
          <button onClick={() => setSidebarOpen(false)} className={styles.closeSidebar}>
            Close
          </button>
        </div>
        <div className={styles.conversationsList}>
          {conversations.length === 0 ? (
            <div className={styles.emptyConversations}>
              <p>No saved conversations</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`${styles.conversationItem} ${conv.id === conversationId ? styles.activeConversation : ''
                  }`}
                onClick={() => switchConversation(conv.id)}
              >
                <div className={styles.conversationInfo}>
                  <div className={styles.conversationTitle}>{conv.title || 'New Conversation'}</div>
                  <div className={styles.conversationMeta}>
                    {conv.messages?.length || 0} messages · {formatTime(conv.updatedAt)}
                  </div>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className={styles.deleteConversationBtn}
                  title="Delete conversation"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.floatingMenuContainer}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={styles.floatingMenuButton}
              title="Menu"
            >
              Menu
            </button>

            {menuOpen && (
              <>
                <div className={styles.menuOverlay} onClick={() => setMenuOpen(false)} />
                <div className={styles.floatingMenu}>
                  <div className={styles.menuItem} onClick={startNewConversation}>
                    <span className={styles.menuIcon}>+</span>
                    <span>New Conversation</span>
                  </div>
                  <div
                    className={`${styles.menuItem} ${messages.length === 0 ? styles.menuItemDisabled : ''}`}
                    onClick={clearConversation}
                  >
                    <span className={styles.menuIcon}>✕</span>
                    <span>Clear Conversation</span>
                  </div>
                  <div
                    className={styles.menuItem}
                    onClick={() => {
                      setSidebarOpen(!sidebarOpen);
                      setMenuOpen(false);
                    }}
                  >
                    <span className={styles.menuIcon}>≡</span>
                    <span>Conversation History</span>
                  </div>
                  <div className={styles.menuDivider} />
                  <div className={styles.menuItem} onClick={() => exportConversation('md')}>
                    <span className={styles.menuIcon}>⬇️</span>
                    <span>Export as Markdown</span>
                  </div>
                  <div className={styles.menuItem} onClick={() => exportConversation('json')}>
                    <span className={styles.menuIcon}>⬇️</span>
                    <span>Export as JSON</span>
                  </div>
                  <div className={styles.menuDivider} />
                  <div
                    className={styles.menuItem}
                    onClick={() => {
                      setApiConfigOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    <span className={styles.menuIcon}>🔌</span>
                    <span>API Configuration</span>
                  </div>
                  <div className={styles.menuDivider} />
                  <div className={styles.menuSection}>
                    <label className={styles.menuLabel}>Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => {
                        setSelectedModel(e.target.value);
                        setMenuOpen(false);
                      }}
                      className={styles.menuModelSelect}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.free ? '(Free)' : '(Paid)'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          <Link href="/" className={styles.backLink}>
            Back
          </Link>
          <h1 className={styles.title}>AI Chat</h1>
        </div>
      </header>

      <div className={styles.chatArea}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <h2>Start a new conversation</h2>
            <p>Click Menu to select a model and manage conversations.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
          >
            <div className={`${styles.avatar} ${msg.role === 'user' ? styles.userAvatar : styles.aiAvatar}`}>
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className={styles.messageContent}>
              {msg.role === 'assistant' && msg.modelName && (
                <span className={styles.modelBadge}>{msg.modelName}</span>
              )}
              {msg.image && (
                <img src={msg.image} alt="Uploaded" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
              )}
              {msg.role === 'assistant' ? (
                <>
                  <MessageRenderer content={msg.content} />
                  <button
                    onClick={() => speakMessage(msg.content)}
                    className={styles.iconButton}
                    style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.2rem' }}
                    title="Read Aloud"
                  >
                    🔊
                  </button>
                </>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <div className={`${styles.avatar} ${styles.aiAvatar}`}>AI</div>
            <div className={styles.loadingDots}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        {!loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
          <div className={styles.regenerateContainer}>
            <button onClick={regenerateMessage} className={styles.regenerateButton}>
              🔄 Regenerate Response
            </button>
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        {selectedImage && (
          <div style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#2d2d2d', borderRadius: '0.5rem 0.5rem 0 0' }}>
            <img src={selectedImage} alt="Preview" style={{ height: '50px', borderRadius: '0.25rem' }} />
            <button onClick={() => setSelectedImage(null)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        <form onSubmit={sendMessage} className={styles.inputForm}>
          <div className={styles.inputControls}>
            <button
              type="button"
              className={`${styles.iconButton} ${searchMode === 'on' ? styles.active : searchMode === 'off' ? styles.inactive : ''}`}
              onClick={() => setSearchMode(prev => prev === 'auto' ? 'on' : prev === 'on' ? 'off' : 'auto')}
              title={`Web Search: ${searchMode.toUpperCase()}`}
            >
              {searchMode === 'auto' ? '🌐 A' : searchMode === 'on' ? '🌐 On' : '🌐 Off'}
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => fileInputRef.current?.click()}
              title="Upload Image"
            >
              📷
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${isListening ? styles.active : ''}`}
              onClick={startListening}
              title="Voice Input"
            >
              {isListening ? '🔴' : '🎤'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? "Listening..." : "Type a message..."}
            className={styles.input}
            disabled={loading}
          />
          <button type="submit" className={styles.sendButton} disabled={loading || (!input.trim() && !selectedImage)}>
            {loading ? '...' : 'Send'}
          </button>
        </form>
      </div>


      <ApiConfiguration isOpen={apiConfigOpen} onClose={() => setApiConfigOpen(false)} />
    </div >
  );
}
