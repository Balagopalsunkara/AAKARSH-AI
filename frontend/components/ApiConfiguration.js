import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const ApiConfiguration = ({ isOpen, onClose }) => {
    const [apis, setApis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        if (isOpen) {
            fetchApis();
        }
    }, [isOpen]);

    const fetchApis = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/v1/apis');
            if (response.ok) {
                const data = await response.json();
                setApis(data);
            }
        } catch (error) {
            console.error('Failed to fetch APIs', error);
            toast.error('Failed to load API configuration');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (apiId) => {
        try {
            const response = await fetch(`/api/v1/apis/${apiId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });

            if (response.ok) {
                toast.success('API configuration updated');
                setEditingId(null);
                fetchApis();
            } else {
                throw new Error('Failed to update');
            }
        } catch (error) {
            toast.error('Failed to update API configuration');
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                background: '#1c1c21',
                padding: '2rem',
                borderRadius: '1rem',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto',
                border: '1px solid #333'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0 }}>API Configuration</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
                </div>

                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {apis.map(api => (
                            <div key={api.id} style={{
                                background: '#2d2d2d',
                                padding: '1rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #444'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{api.name}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{
                                            fontSize: '0.8rem',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '1rem',
                                            background: api.enabled ? '#2ecc71' : '#e74c3c',
                                            color: '#fff'
                                        }}>
                                            {api.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                        <button
                                            onClick={() => {
                                                if (editingId === api.id) {
                                                    setEditingId(null);
                                                } else {
                                                    setEditingId(api.id);
                                                    setEditForm({ enabled: api.enabled });
                                                }
                                            }}
                                            style={{
                                                background: '#3498db',
                                                border: 'none',
                                                padding: '0.3rem 0.8rem',
                                                borderRadius: '0.3rem',
                                                color: '#fff',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {editingId === api.id ? 'Cancel' : 'Edit'}
                                        </button>
                                    </div>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#aaa' }}>{api.description}</p>

                                {editingId === api.id && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingTop: '1rem', borderTop: '1px solid #444' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={editForm.enabled}
                                                onChange={e => setEditForm({ ...editForm, enabled: e.target.checked })}
                                            />
                                            Enable API
                                        </label>

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>API Key</label>
                                            <input
                                                type="password"
                                                placeholder={api.hasKey ? '********' : 'Enter API Key'}
                                                onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.5rem',
                                                    background: '#111',
                                                    border: '1px solid #444',
                                                    borderRadius: '0.3rem',
                                                    color: '#fff'
                                                }}
                                            />
                                        </div>

                                        {api.id === 'google_search' && (
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Search Engine ID (CX)</label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter CX"
                                                    onChange={e => setEditForm({ ...editForm, cx: e.target.value })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.5rem',
                                                        background: '#111',
                                                        border: '1px solid #444',
                                                        borderRadius: '0.3rem',
                                                        color: '#fff'
                                                    }}
                                                />
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleSave(api.id)}
                                            style={{
                                                background: '#2ecc71',
                                                border: 'none',
                                                padding: '0.5rem',
                                                borderRadius: '0.3rem',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                marginTop: '0.5rem'
                                            }}
                                        >
                                            Save Configuration
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApiConfiguration;
