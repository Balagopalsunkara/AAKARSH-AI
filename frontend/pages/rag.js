import { useState, useEffect } from 'react';
import Head from 'next/head';
import toast from 'react-hot-toast';
import styles from '../styles/Chat.module.css';
import Link from 'next/link';

export default function RAG() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [source, setSource] = useState('auto');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [documents, setDocuments] = useState([]);
  const [ragStatus, setRagStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('query'); // query, upload, documents

  useEffect(() => {
    fetchModels();
    fetchRagStatus();
    fetchDocuments();
  }, []);

  const fetchModels = async () => {
    try {
      const apiUrl = 'https://13.221.65.9';
      const response = await fetch(`${apiUrl}/api/v1/models`);
      const data = await response.json();
      
      setModels(data.models || []);
      setSelectedModel(data.default || data.models[0]?.id);
    } catch (error) {
      console.error('Failed to fetch models:', error);
    }
  };

  const fetchRagStatus = async () => {
    try {
      const apiUrl = 'https://13.221.65.9';
      const response = await fetch(`${apiUrl}/api/v1/rag/status`);
      const data = await response.json();
      setRagStatus(data);
    } catch (error) {
      console.error('Failed to fetch RAG status:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const apiUrl = 'https://13.221.65.9';
      const response = await fetch(`${apiUrl}/api/v1/rag/documents`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  const handleQuery = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/v1/rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          source,
          model: selectedModel,
          options: {
            maxTokens: 1000,
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get response');
      }

      const data = await response.json();
      setResult(data);
      toast.success('Answer generated with RAG!');
    } catch (error) {
      console.error('RAG query error:', error);
      toast.error(error.message || 'Failed to process query');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const filename = formData.get('filename');
    const content = formData.get('content');

    if (!filename || !content) {
      toast.error('Filename and content are required');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/v1/rag/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename, content })
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      toast.success('Document uploaded successfully!');
      e.target.reset();
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to upload document');
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/v1/rag/documents/${filename}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      toast.success('Document deleted!');
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>RAG - AI-APP</title>
        <meta name="description" content="Retrieval-Augmented Generation" />
      </Head>

      <div className={styles.chatContainer}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Link href="/" className={styles.backLink}>← Back to Home</Link>
            <h1>📚 RAG (Retrieval-Augmented Generation)</h1>
          </div>
        </div>

        <div className={styles.tabs}>
          <button 
            className={activeTab === 'query' ? styles.activeTab : ''}
            onClick={() => setActiveTab('query')}
          >
            Query
          </button>
          <button 
            className={activeTab === 'upload' ? styles.activeTab : ''}
            onClick={() => setActiveTab('upload')}
          >
            Upload Document
          </button>
          <button 
            className={activeTab === 'documents' ? styles.activeTab : ''}
            onClick={() => setActiveTab('documents')}
          >
            Documents ({documents.length})
          </button>
          <button 
            className={activeTab === 'status' ? styles.activeTab : ''}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
        </div>

        {activeTab === 'query' && (
          <div className={styles.querySection}>
            <form onSubmit={handleQuery} className={styles.queryForm}>
              <div className={styles.formGroup}>
                <label>Query:</label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a question about your documents or GitHub repository..."
                  rows="4"
                  disabled={loading}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Source:</label>
                  <select value={source} onChange={(e) => setSource(e.target.value)} disabled={loading}>
                    <option value="auto">Auto (Both)</option>
                    <option value="github">GitHub Repository</option>
                    <option value="server">Server Documents</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Model:</label>
                  <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} disabled={loading}>
                    {models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.provider})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" disabled={loading || !query.trim()} className={styles.sendButton}>
                {loading ? 'Processing...' : 'Submit Query'}
              </button>
            </form>

            {result && (
              <div className={styles.result}>
                {Array.isArray(result.notices) && result.notices.length > 0 && (
                  <div className={styles.noticeList}>
                    {result.notices.map((notice, idx) => (
                      <div key={idx} className={styles.noticeItem}>
                        {notice}
                      </div>
                    ))}
                  </div>
                )}
                <h3>Answer:</h3>
                <div className={styles.answer}>{result.answer}</div>

                <h4>Sources ({result.sources.length}):</h4>
                <div className={styles.sources}>
                  {result.sources.map((src, idx) => (
                    <div key={idx} className={styles.source}>
                      <strong>{src.source}:</strong> {src.path}
                      {src.url && <a href={src.url} target="_blank" rel="noopener"> View</a>}
                      <span className={styles.score}>Score: {src.score.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className={styles.uploadSection}>
            <form onSubmit={handleUpload} className={styles.uploadForm}>
              <div className={styles.formGroup}>
                <label>Filename:</label>
                <input type="text" name="filename" placeholder="document.txt" required />
              </div>

              <div className={styles.formGroup}>
                <label>Content:</label>
                <textarea name="content" placeholder="Paste your document content here..." rows="15" required />
              </div>

              <button type="submit" className={styles.sendButton}>Upload Document</button>
            </form>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className={styles.documentsSection}>
            <table className={styles.documentsTable}>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, idx) => (
                  <tr key={idx}>
                    <td>{doc.filename}</td>
                    <td>{(doc.size / 1024).toFixed(2)} KB</td>
                    <td>{new Date(doc.modified).toLocaleString()}</td>
                    <td>
                      <button onClick={() => handleDelete(doc.filename)} className={styles.deleteButton}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {documents.length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center' }}>No documents uploaded yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'status' && ragStatus && (
          <div className={styles.statusSection}>
            <h3>RAG Configuration Status</h3>
            
            <div className={styles.statusCard}>
              <h4>GitHub Source</h4>
              <p>Configured: {ragStatus.github.configured ? '✅ Yes' : '❌ No'}</p>
              {ragStatus.github.configured && (
                <>
                  <p>Owner: {ragStatus.github.owner || 'Not set'}</p>
                  <p>Repository: {ragStatus.github.repo || 'Not set'}</p>
                </>
              )}
              {!ragStatus.github.configured && (
                <p className={styles.helpText}>
                  Set GITHUB_TOKEN, GITHUB_RAG_OWNER, and GITHUB_RAG_REPO in .env
                </p>
              )}
            </div>

            <div className={styles.statusCard}>
              <h4>Server Storage</h4>
              <p>Configured: ✅ Yes</p>
              <p>Path: {ragStatus.server.path}</p>
              <p>Documents: {documents.length}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
