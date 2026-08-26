import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ─── SVG Icons ─── */
const SparkleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
);

const SendIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const CopySmallIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

/* ─── Lightweight Markdown Renderer ─── */

function renderMarkdown(text) {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code blocks
        if (line.trim().startsWith('```')) {
            const lang = line.trim().slice(3).trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            elements.push(
                <div className="ai-code-block" key={key++}>
                    {lang && <span className="ai-code-lang">{lang}</span>}
                    <pre><code>{codeLines.join('\n')}</code></pre>
                    {/* <pre> ka matlab Preformatted Text.
                    Ye spaces aur newlines ko preserve karta hai. */}
                    <CopyButton text={codeLines.join('\n')} />
                </div>
            );
            continue;
        }

        // Empty line
        if (line.trim() === '') {
            elements.push(<div className="ai-md-spacer" key={key++} />);
            i++;
            continue;
        }

        // Headings
        const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const Tag = `h${level}`;
            elements.push(<Tag className="ai-md-heading" key={key++}>{renderInline(headingMatch[2])}</Tag>);
            i++;
            continue;
        }

        // Numbered list items
        const numMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
                const m = lines[i].match(/^\d+\.\s+(.+)/);
                items.push(<li key={items.length}>{renderInline(m[1])}</li>);
                i++;
            }
            elements.push(<ol className="ai-md-list" key={key++}>{items}</ol>);
            continue;
        }

        // Unordered list items
        if (/^[-*]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
                const m = lines[i].match(/^[-*]\s+(.+)/);
                items.push(<li key={items.length}>{renderInline(m[1])}</li>);
                i++;
            }
            elements.push(<ul className="ai-md-list" key={key++}>{items}</ul>);
            continue;
        }

        // Regular paragraph
        elements.push(<p className="ai-md-para" key={key++}>{renderInline(line)}</p>);
        i++;
    }

    return elements;
}

function renderInline(text) {
    if (!text) return text;

    // Split by inline code, bold, and italic
    const parts = [];
    let remaining = text;
    let partKey = 0;

    while (remaining.length > 0) {
        // Inline code
        const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/s);
        if (codeMatch) {
            if (codeMatch[1]) parts.push(renderInlineFormatting(codeMatch[1], partKey++));
            parts.push(<code className="ai-inline-code" key={partKey++}>{codeMatch[2]}</code>);
            remaining = codeMatch[3];
            continue;
        }
        parts.push(renderInlineFormatting(remaining, partKey++));
        break;
    }

    return parts;
}

function renderInlineFormatting(text, key) {
    // Bold
    const boldParts = text.split(/\*\*(.+?)\*\*/g);
    if (boldParts.length > 1) {
        return (
            <React.Fragment key={key}>
                {boldParts.map((part, i) =>
                    i % 2 === 1
                        ? <strong key={i}>{part}</strong>
                        : <React.Fragment key={i}>{part}</React.Fragment>
                )}
            </React.Fragment>
        );
    }
    return <React.Fragment key={key}>{text}</React.Fragment>;
}

/* ─── Copy Button Component ─── */

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
        }
    };

    return (
        <button className="ai-copy-btn" onClick={handleCopy} title="Copy code">
            {copied ? <CheckIcon /> : <CopySmallIcon />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

/* ─── Quick Action Cards ─── */

const QUICK_ACTIONS = [
    { id: 'suggest', icon: '🔮', label: 'Suggest', desc: 'AI code completion' },
    { id: 'explain', icon: '📖', label: 'Explain', desc: 'Understand this code' },
    { id: 'review', icon: '🔍', label: 'Review', desc: 'Quality & security' },
    { id: 'bugfix', icon: '🐛', label: 'Bug Fix', desc: 'Detect & fix bugs' },
];

/* ─── Main Component ─── */

const AIAssistant = ({ code, language, fileName, backendUrl, triggerAction }) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const lastTriggerIdRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    const sendAIRequest = useCallback(async (action, customPrompt) => {
        if (isLoading) return;

        const userMessage = {
            id: Date.now(),
            role: 'user',
            action,
            content: customPrompt || `${QUICK_ACTIONS.find((a) => a.id === action)?.label || action}: ${fileName || 'current code'}`,
            timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // Build conversation history for chat mode
            const conversationHistory = action === 'chat'
                ? messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
                    role: m.role,
                    content: m.rawContent || m.content,
                }))
                : [];

            const response = await fetch(`${backendUrl}/api/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    code: code || '',
                    language: language || 'javascript',
                    prompt: customPrompt || '',
                    conversationHistory,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Request failed (${response.status})`);
            }

            const aiMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                action,
                content: data.response,
                rawContent: data.response,
                model: data.model,
                usage: data.usage,
                timestamp: new Date().toLocaleTimeString(),
            };

            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            const errorMessage = {
                id: Date.now() + 1,
                role: 'error',
                content: error.message || 'Failed to get AI response.',
                timestamp: new Date().toLocaleTimeString(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, code, language, fileName, backendUrl, messages]);

    useEffect(() => {
        if (triggerAction && triggerAction.action && triggerAction.id !== lastTriggerIdRef.current) {
            lastTriggerIdRef.current = triggerAction.id;
            sendAIRequest(triggerAction.action, triggerAction.prompt || '');
        }
    }, [triggerAction, sendAIRequest]);

    const handleQuickAction = useCallback((actionId) => {
        sendAIRequest(actionId);
    }, [sendAIRequest]);

    const handleSendMessage = useCallback((e) => {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        setInputValue('');
        sendAIRequest('chat', trimmed);
    }, [inputValue, sendAIRequest]);

    const handleClearChat = useCallback(() => {
        setMessages([]);
    }, []);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    }, [handleSendMessage]);

    return (
        <div className="aiAssistant">
            {/* Header */}
            <div className="aiAssistant__header">
                <div className="aiAssistant__headerLeft">
                    <span className="aiAssistant__sparkle"><SparkleIcon /></span>
                    <span className="aiAssistant__title">AI Assistant</span>
                    <span className="aiAssistant__model">Gemini Flash</span>
                </div>
                {messages.length > 0 && (
                    <button className="aiAssistant__clearBtn" onClick={handleClearChat} title="Clear conversation">
                        <TrashIcon />
                    </button>
                )}
            </div>

            {/* Quick Actions */}
            <div className="aiAssistant__actions">
                {QUICK_ACTIONS.map((action) => (
                    <button
                        key={action.id}
                        className="aiAction"
                        onClick={() => handleQuickAction(action.id)}
                        disabled={isLoading || (!code && action.id !== 'suggest')}
                        title={action.desc}
                    >
                        <span className="aiAction__icon">{action.icon}</span>
                        <span className="aiAction__label">{action.label}</span>
                    </button>
                ))}
            </div>

            {/* Messages */}
            <div className="aiAssistant__messages">
                {messages.length === 0 && !isLoading && (
                    <div className="aiAssistant__welcome">
                        <div className="aiAssistant__welcomeIcon">🤖</div>
                        <h3>AI Code Assistant</h3>
                        <p>Use the quick actions above or type a question about your code below.</p>
                        <div className="aiAssistant__welcomeHints">
                            <span>💡 "Optimize this function"</span>
                            <span>💡 "Add error handling"</span>
                            <span>💡 "What does this do?"</span>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`aiMessage aiMessage--${msg.role}`}>
                        <div className="aiMessage__header">
                            <span className="aiMessage__avatar">
                                {msg.role === 'user' ? '👤' : msg.role === 'error' ? '⚠️' : '🤖'}
                            </span>
                            <span className="aiMessage__sender">
                                {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI Assistant'}
                            </span>
                            {msg.action && msg.role === 'user' && (
                                <span className="aiMessage__action">{msg.action}</span>
                            )}
                            <span className="aiMessage__time">{msg.timestamp}</span>
                        </div>
                        <div className="aiMessage__body">
                            {msg.role === 'assistant' ? (
                                <div className="aiMessage__markdown">
                                    {renderMarkdown(msg.content)}
                                </div>
                            ) : (
                                <p>{msg.content}</p>
                            )}
                        </div>
                        {msg.role === 'assistant' && (
                            <div className="aiMessage__footer">
                                <CopyButton text={msg.rawContent || msg.content} />
                                {msg.model && <span className="aiMessage__model">{msg.model}</span>}
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && (
                    <div className="aiMessage aiMessage--assistant aiMessage--loading">
                        <div className="aiMessage__header">
                            <span className="aiMessage__avatar">🤖</span>
                            <span className="aiMessage__sender">AI Assistant</span>
                        </div>
                        <div className="aiTyping">
                            <span className="aiTyping__dot" />
                            <span className="aiTyping__dot" />
                            <span className="aiTyping__dot" />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form className="aiAssistant__input" onSubmit={handleSendMessage}>
                <textarea
                    ref={inputRef}
                    className="aiAssistant__textarea"
                    placeholder="Ask about your code…"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="aiAssistant__sendBtn"
                    disabled={isLoading || !inputValue.trim()}
                    title="Send message"
                >
                    <SendIcon />
                </button>
            </form>
        </div>
    );
};

export default AIAssistant;
