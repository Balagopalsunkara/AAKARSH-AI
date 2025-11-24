import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Chat.module.css';
import toast, { Toaster } from 'react-hot-toast';

const STORAGE_KEY_PREFIX = 'ai-app-conv-';
const ACTIVE_CONVERSATION_KEY = 'ai-app-active-conversation';

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [temperature, setTemperature] = useState(0.7);
    const [conversationId, setConversationId] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [conversations, setConversations] = useState([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [conversationFilter, setConversationFilter] = useState('');
    const messagesEndRef = useRef(null);
    const promptLibrary = [
        {
            title: 'Explain like I am five',
            prompt: 'Explain the following concept in simple terms with a friendly tone: '
        },
        {
            title: 'Summarize research',
            prompt: 'Summarize the key findings and implications from this research:'
        },
        {
            title: 'Brainstorm ideas',
            prompt: 'Brainstorm creative ideas and list actionable next steps for: '
        }
    ];

    useEffect(() => {
        fetchModels();
        loadConversation();
        const savedTemperature = localStorage.getItem('ai-app-temperature');
        if (savedTemperature) {
            setTemperature(parseFloat(savedTemperature));
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        loadConversationsList();
    }, [conversationFilter]);

    useEffect(() => {
        // Save conversation whenever messages change
        if (conversationId && messages.length > 0) {
            saveConversation();
        }
    }, [messages, conversationId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const generateConversationId = () => {
        return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    };

    const loadConversation = () => {
        try {
            // Get active conversation ID
            const activeId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);

            if (activeId) {
                // Load existing conversation
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

            // Create new conversation if none exists
            const newId = generateConversationId();
            setConversationId(newId);
            localStorage.setItem(ACTIVE_CONVERSATION_KEY, newId);
            loadConversationsList();
        } catch (error) {
            console.error('Failed to load conversation:', error);
            // Fallback to new conversation
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
                temperature,
                updatedAt: new Date().toISOString(),
                title: messages[0]?.content?.substring(0, 50) || 'New Conversation'
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
            toast('No conversation to clear', { icon: 'ℹ️' });
            return;
        }

        if (confirm('Are you sure you want to clear this conversation? This cannot be undone.')) {
            try {
                // Remove from localStorage
                if (conversationId) {
                    localStorage.removeItem(STORAGE_KEY_PREFIX + conversationId);
                }

                // Create new conversation
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
            // Save current conversation first
            saveConversation();
        }

        // Create and switch to new conversation
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
            for (let i = 0; i < localStorage.length; i++) {
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
            // Sort by most recent first
            allConversations.sort((a, b) =>
                new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
            );
            const filtered = conversationFilter
                ? allConversations.filter(conv =>
                    (conv.title || 'New Conversation').toLowerCase().includes(conversationFilter.toLowerCase())
                )
                : allConversations;
            setConversations(filtered);
        } catch (error) {
            console.error('Failed to load conversations list:', error);
        }
    };

    const switchConversation = (convId) => {
        try {
            // Save current conversation
            if (conversationId && messages.length > 0) {
                saveConversation();
            }

            // Load selected conversation
            const savedConv = localStorage.getItem(STORAGE_KEY_PREFIX + convId);
            if (savedConv) {
                const conversation = JSON.parse(savedConv);
                setMessages(conversation.messages || []);
                setConversationId(convId);
                if (conversation.model) {
                    setSelectedModel(conversation.model);
                }
                if (typeof conversation.temperature === 'number') {
                    setTemperature(conversation.temperature);
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

                // If deleting active conversation, create a new one
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

    const fetchModels = async () => {
        try {
            // Use relative path for local dev/docker
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
            const response = await fetch(`${apiUrl}/api/v1/models`);
            const data = await response.json();

            setModels(data.models || []);
            // Prefer local models if available
            const defaultModel = data.models.find(m => m.id.includes('tinyllama'))?.id || data.default || data.models[0]?.id;
            setSelectedModel(defaultModel);
        } catch (error) {
            console.error('Failed to fetch models:', error);
            toast.error('Using offline mode');
            // Fallback models if API fails
            setModels([{ id: 'local/instruct', name: 'Offline Assistant' }]);
            setSelectedModel('local/instruct');
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
            const response = await fetch(`${apiUrl}/api/v1/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    model: selectedModel,
                    temperature
                })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to respond');

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.message,
                modelName: data.modelInfo?.name
            }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${error.message}. Please try a different model.`
            }]);
        } finally {
            setLoading(false);
        }
    };

    const copyMessage = async (content) => {
        try {
            await navigator.clipboard.writeText(content);
            toast.success('Response copied');
        } catch (error) {
            toast.error('Unable to copy text');
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
            <Toaster position="top-center" toastOptions={{
                style: {
                    background: '#1c1c21',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)'
                }
            }} />

            {/* Sidebar */}
            <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarHeader}>
                    <h2>Conversations</h2>
                    <button onClick={() => setSidebarOpen(false)} className={styles.closeSidebar}>✕</button>
                </div>
                <div className={styles.sidebarSearch}>
                    <input
                        type="search"
                        placeholder="Search titles"
                        value={conversationFilter}
                        onChange={(e) => setConversationFilter(e.target.value)}
                    />
                </div>
                <div className={styles.conversationsList}>
                    {conversations.length === 0 ? (
                        <div className={styles.emptyConversations}>
                            <p>No saved conversations</p>
                        </div>
                    ) : (
                        conversations.map(conv => (
                            <div
                                key={conv.id}
                                className={`${styles.conversationItem} ${conv.id === conversationId ? styles.activeConversation : ''}`}
                                onClick={() => switchConversation(conv.id)}
                            >
                                <div className={styles.conversationInfo}>
                                    <div className={styles.conversationTitle}>
                                        {conv.title || 'New Conversation'}
                                    </div>
                                    <div className={styles.conversationMeta}>
                                        {conv.messages?.length || 0} messages • {formatTime(conv.updatedAt)}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => deleteConversation(conv.id, e)}
                                    className={styles.deleteConversationBtn}
                                    title="Delete conversation"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Sidebar overlay */}
            {sidebarOpen && (
                <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
            )}

            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    {/* Floating Menu Button */}
                    <div className={styles.floatingMenuContainer}>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className={styles.floatingMenuButton}
                            title="Menu"
                        >
                            ⚙️
                        </button>

                        {menuOpen && (
                            <>
                                <div className={styles.menuOverlay} onClick={() => setMenuOpen(false)} />
                                <div className={styles.floatingMenu}>
                                    <div className={styles.menuItem} onClick={startNewConversation}>
                                        <span className={styles.menuIcon}>✨</span>
                                        <span>New Conversation</span>
                                    </div>
                                    <div
                                        className={`${styles.menuItem} ${messages.length === 0 ? styles.menuItemDisabled : ''}`}
                                        onClick={clearConversation}
                                    >
                                        <span className={styles.menuIcon}>🗑️</span>
                                        <span>Clear Conversation</span>
                                    </div>
                                    <div
                                        className={styles.menuItem}
                                        onClick={() => {
                                            setSidebarOpen(!sidebarOpen);
                                            setMenuOpen(false);
                                        }}
                                    >
                                        <span className={styles.menuIcon}>📜</span>
                                        <span>Conversation History</span>
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
                                            {models.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name} {m.free ? '(Free)' : '(Paid)'}
                                                </option>
                                                ))}
                                            </select>
                                    </div>
                                    <div className={styles.menuSection}>
                                        <label className={styles.menuLabel}>Temperature {temperature.toFixed(1)}</label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={temperature}
                                            onChange={(e) => {
                                                const value = parseFloat(e.target.value);
                                                setTemperature(value);
                                                localStorage.setItem('ai-app-temperature', String(value));
                                            }}
                                            className={styles.temperatureSlider}
                                        />
                                        <p className={styles.menuHint}>
                                            Lower values make responses more focused; higher values increase creativity.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <Link href="/" className={styles.backLink}>←</Link>
                    <h1 className={styles.title}>AI Chat</h1>
                </div>
            </header>

            <div className={styles.chatArea}>
                {messages.length === 0 && (
                    <div className={styles.emptyState}>
                        <h2>Start a new conversation</h2>
                        <p>Click ⚙️ to select a model and manage conversations.</p>
                        <div className={styles.promptGrid}>
                            {promptLibrary.map(prompt => (
                                <button
                                    key={prompt.title}
                                    className={styles.promptCard}
                                    onClick={() => setInput(prompt.prompt)}
                                >
                                    <span className={styles.promptTitle}>{prompt.title}</span>
                                    <span className={styles.promptText}>{prompt.prompt}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.assistantMessage}`}>
                        <div className={`${styles.avatar} ${msg.role === 'user' ? styles.userAvatar : styles.aiAvatar}`}>
                            {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className={styles.messageContent}>
                            {msg.role === 'assistant' && msg.modelName && (
                                <span className={styles.modelBadge}>{msg.modelName}</span>
                            )}
                            {msg.content}
                            {msg.role === 'assistant' && (
                                <button
                                    className={styles.copyButton}
                                    onClick={() => copyMessage(msg.content)}
                                    title="Copy response"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className={`${styles.message} ${styles.assistantMessage}`}>
                        <div className={`${styles.avatar} ${styles.aiAvatar}`}>🤖</div>
                        <div className={styles.loadingDots}>
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
                <form onSubmit={sendMessage} className={styles.inputForm}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className={styles.input}
                        disabled={loading}
                    />
                    <button type="submit" className={styles.sendButton} disabled={loading || !input.trim()}>
                        {loading ? '...' : '↑'}
                    </button>
                </form>
            </div>
        </div>
    );
}
