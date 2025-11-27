import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import toast from 'react-hot-toast';

const MessageRenderer = ({ content }) => {
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    return (
        <div className="markdown-content">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    code({ node, inline, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                            <div style={{ position: 'relative', margin: '1rem 0' }}>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.5rem 1rem',
                                    background: '#2d2d2d',
                                    borderTopLeftRadius: '0.5rem',
                                    borderTopRightRadius: '0.5rem',
                                    fontSize: '0.8rem',
                                    color: '#e0e0e0',
                                    borderBottom: '1px solid #444'
                                }}>
                                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{match[1]}</span>
                                    <button
                                        onClick={() => copyToClipboard(String(children).replace(/\n$/, ''))}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#e0e0e0',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}
                                        title="Copy code"
                                    >
                                        📋 Copy
                                    </button>
                                </div>
                                <SyntaxHighlighter
                                    style={vscDarkPlus}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                        margin: 0,
                                        borderTopLeftRadius: 0,
                                        borderTopRightRadius: 0,
                                        borderBottomLeftRadius: '0.5rem',
                                        borderBottomRightRadius: '0.5rem',
                                        padding: '1rem',
                                        fontSize: '0.9rem',
                                        lineHeight: '1.5'
                                    }}
                                    {...props}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            </div>
                        ) : (
                            <code className={className} style={{
                                background: 'rgba(255,255,255,0.1)',
                                padding: '0.2rem 0.4rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.9em',
                                fontFamily: 'monospace'
                            }} {...props}>
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
                                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '500px' }}>
                                    {children}
                                </table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead style={{ background: 'rgba(255,255,255,0.05)' }}>{children}</thead>;
                    },
                    th({ children }) {
                        return <th style={{ border: '1px solid #444', padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>{children}</th>;
                    },
                    td({ children }) {
                        return <td style={{ border: '1px solid #444', padding: '0.75rem' }}>{children}</td>;
                    },
                    p({ children }) {
                        return <p style={{ marginBottom: '1rem', lineHeight: '1.6' }}>{children}</p>;
                    },
                    ul({ children }) {
                        return <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>{children}</ol>;
                    },
                    li({ children }) {
                        return <li style={{ marginBottom: '0.5rem' }}>{children}</li>;
                    },
                    blockquote({ children }) {
                        return (
                            <blockquote style={{
                                borderLeft: '4px solid var(--primary)',
                                margin: '1rem 0',
                                padding: '0.5rem 0 0.5rem 1rem',
                                background: 'rgba(255,255,255,0.05)',
                                fontStyle: 'italic'
                            }}>
                                {children}
                            </blockquote>
                        );
                    },
                    a({ href, children }) {
                        return (
                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                {children}
                            </a>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MessageRenderer;
