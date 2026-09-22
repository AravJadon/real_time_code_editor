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

const ImageIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
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

const AIAssistant = ({ code, language, fileName, backendUrl, triggerAction, roomId, onApplyCode }) => {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAgentMode, setIsAgentMode] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);
    const [useStreaming, setUseStreaming] = useState(true);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const lastTriggerIdRef = useRef(null);
    const fileInputRef = useRef(null);
    const historyLoadedRef = useRef(false);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    // Phase 5: Load chat history on mount
    useEffect(() => {
        if (!roomId || historyLoadedRef.current) return;
        historyLoadedRef.current = true;

        async function loadHistory() {
            try {
                const response = await fetch(`${backendUrl}/api/chat/${roomId}`);
                if (!response.ok) return;
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    const loaded = data.messages.map((msg, idx) => ({
                        id: `history-${idx}`,
                        role: msg.role,
                        action: msg.action || 'chat',
                        content: msg.content,
                        rawContent: msg.content,
                        model: msg.model || null,
                        fixes: msg.fixes || [],
                        timestamp: new Date(msg.createdAt).toLocaleTimeString(),
                    }));
                    setMessages(loaded);
                }
            } catch (err) {
                console.warn('Failed to load chat history:', err.message);
            }
        }

        loadHistory();
    }, [roomId, backendUrl]);

    // ─── Standard (non-streaming) AI request ───
    const sendStandardRequest = useCallback(async (action, customPrompt) => {
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
            const conversationHistory = action === 'chat'
                ? messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
                    role: m.role,
                    content: m.rawContent || m.content,
                }))
                : [];

            const body = {
                action,
                code: code || '',
                language: language || 'javascript',
                prompt: customPrompt || '',
                conversationHistory,
                roomId: roomId || '',
                fileName: fileName || '',
            };

            // Phase 8: Multi-modal — attach image if present
            if (imageBase64) {
                body.imageBase64 = imageBase64;
            }

            const response = await fetch(`${backendUrl}/api/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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
                fixes: data.fixes || [],
                ragSources: data.ragSources || [],
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
            clearImage();
        }
    }, [code, language, fileName, backendUrl, messages, roomId, imageBase64]);

    // ─── Phase 2: Streaming AI request ───
    const sendStreamingRequest = useCallback(async (action, customPrompt) => {
        const userMessage = {
            id: Date.now(),
            role: 'user',
            action,
            content: customPrompt || `${QUICK_ACTIONS.find((a) => a.id === action)?.label || action}: ${fileName || 'current code'}`,
            timestamp: new Date().toLocaleTimeString(),
        };

        const aiMessageId = Date.now() + 1;
        const aiMessage = {
            id: aiMessageId,
            role: 'assistant',
            action,
            content: '',
            rawContent: '',
            model: '',
            isStreaming: true,
            timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, userMessage, aiMessage]);
        setIsLoading(true);

        try {
            const conversationHistory = action === 'chat'
                ? messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
                    role: m.role,
                    content: m.rawContent || m.content,
                }))
                : [];

            const body = {
                action,
                code: code || '',
                language: language || 'javascript',
                prompt: customPrompt || '',
                conversationHistory,
                roomId: roomId || '',
                fileName: fileName || '',
            };

            if (imageBase64) {
                body.imageBase64 = imageBase64;
            }

            const response = await fetch(`${backendUrl}/api/ai/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let modelName = '';
            let ragSources = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                const lines = text.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'token') {
                            fullContent += parsed.content;
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === aiMessageId
                                        ? { ...m, content: fullContent, rawContent: fullContent }
                                        : m
                                )
                            );
                        } else if (parsed.type === 'done') {
                            modelName = parsed.model || '';
                            ragSources = parsed.ragSources || [];
                        } else if (parsed.type === 'error') {
                            throw new Error(parsed.error);
                        }
                    } catch (parseErr) {
                        if (parseErr.message && !parseErr.message.includes('JSON')) {
                            throw parseErr;
                        }
                    }
                }
            }

            // Finalize the streaming message
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === aiMessageId
                        ? { ...m, isStreaming: false, model: modelName, ragSources }
                        : m
                )
            );
        } catch (error) {
            setMessages((prev) => [
                ...prev.filter((m) => m.id !== aiMessageId || m.content),
                {
                    id: Date.now() + 2,
                    role: 'error',
                    content: error.message || 'Streaming failed.',
                    timestamp: new Date().toLocaleTimeString(),
                },
            ]);
        } finally {
            setIsLoading(false);
            clearImage();
        }
    }, [code, language, fileName, backendUrl, messages, roomId, imageBase64]);

    // ─── Phase 7: Agent mode request ───
    const sendAgentRequest = useCallback(async (customPrompt) => {
        const userMessage = {
            id: Date.now(),
            role: 'user',
            action: 'agent',
            content: customPrompt,
            timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            const response = await fetch(`${backendUrl}/api/agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: customPrompt,
                    roomId: roomId || '',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Agent failed (${response.status})`);
            }

            // Show tool call log
            if (data.toolCalls && data.toolCalls.length > 0) {
                const toolLogMessage = {
                    id: Date.now() + 1,
                    role: 'assistant',
                    action: 'agent-tools',
                    content: data.toolCalls.map((tc) =>
                        `🔧 **${tc.tool}**(${JSON.stringify(tc.args).slice(0, 80)}…)\n→ ${tc.result.slice(0, 200)}${tc.result.length > 200 ? '…' : ''}`
                    ).join('\n\n'),
                    rawContent: JSON.stringify(data.toolCalls, null, 2),
                    isToolLog: true,
                    timestamp: new Date().toLocaleTimeString(),
                };
                setMessages((prev) => [...prev, toolLogMessage]);
            }

            const aiMessage = {
                id: Date.now() + 2,
                role: 'assistant',
                action: 'agent',
                content: data.response,
                rawContent: data.response,
                model: data.model,
                iterations: data.iterations,
                timestamp: new Date().toLocaleTimeString(),
            };

            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            setMessages((prev) => [...prev, {
                id: Date.now() + 1,
                role: 'error',
                content: error.message || 'Agent execution failed.',
                timestamp: new Date().toLocaleTimeString(),
            }]);
        } finally {
            setIsLoading(false);
        }
    }, [backendUrl, roomId]);

    // ─── Dispatch to the right handler ───
    const sendAIRequest = useCallback(async (action, customPrompt) => {
        if (isLoading) return;

        if (isAgentMode && (action === 'chat' || !action)) {
            return sendAgentRequest(customPrompt);
        }

        if (useStreaming && action !== 'suggest') {
            return sendStreamingRequest(action, customPrompt);
        }

        return sendStandardRequest(action, customPrompt);
    }, [isLoading, isAgentMode, useStreaming, sendAgentRequest, sendStreamingRequest, sendStandardRequest]);

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
        if (!trimmed && !imageBase64) return;
        setInputValue('');
        sendAIRequest('chat', trimmed);
    }, [inputValue, imageBase64, sendAIRequest]);

    const handleClearChat = useCallback(async () => {
        setMessages([]);
        // Phase 5: Clear from DB too
        if (roomId) {
            try {
                await fetch(`${backendUrl}/api/chat/${roomId}`, { method: 'DELETE' });
            } catch {
                // ignore
            }
        }
    }, [roomId, backendUrl]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    }, [handleSendMessage]);

    // ─── Phase 8: Image handling ───
    const handleImageSelect = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            return; // Max 5MB
        }

        const reader = new FileReader();
        reader.onload = () => {
            setImageBase64(reader.result);
            setImagePreview(URL.createObjectURL(file));
        };
        reader.readAsDataURL(file);
    }, []);

    const clearImage = useCallback(() => {
        setImagePreview(null);
        setImageBase64(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    // ─── Phase 6: Apply fix handler ───
    const handleApplyFix = useCallback((fix) => {
        if (onApplyCode && fix.newCode) {
            onApplyCode(fix.newCode, fix.fileName);
        }
    }, [onApplyCode]);

    return (
        <div className="aiAssistant">
            {/* Header */}
            <div className="aiAssistant__header">
                <div className="aiAssistant__headerLeft">
                    <span className="aiAssistant__sparkle"><SparkleIcon /></span>
                    <span className="aiAssistant__title">AI Assistant</span>
                    {isAgentMode && <span className="aiAssistant__agentBadge">🤖 Agent</span>}
                    {!isAgentMode && <span className="aiAssistant__model">
                        {useStreaming ? '⚡ Stream' : 'Gemini'}
                    </span>}
                </div>
                <div className="aiAssistant__headerRight">
                    {messages.length > 0 && (
                        <button className="aiAssistant__clearBtn" onClick={handleClearChat} title="Clear conversation">
                            <TrashIcon />
                        </button>
                    )}
                </div>
            </div>

            {/* Mode Toggles */}
            <div className="aiAssistant__toggles">
                <button
                    className={`aiToggle ${isAgentMode ? 'aiToggle--active' : ''}`}
                    onClick={() => setIsAgentMode(!isAgentMode)}
                    title="Agent mode: AI can search code, create files, and run code autonomously"
                >
                    🤖 Agent
                </button>
                <button
                    className={`aiToggle ${useStreaming ? 'aiToggle--active' : ''}`}
                    onClick={() => setUseStreaming(!useStreaming)}
                    title="Stream responses word by word"
                >
                    ⚡ Stream
                </button>
            </div>

            {/* Quick Actions */}
            {!isAgentMode && (
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
            )}

            {/* Messages */}
            <div className="aiAssistant__messages">
                {messages.length === 0 && !isLoading && (
                    <div className="aiAssistant__welcome">
                        <div className="aiAssistant__welcomeIcon">🤖</div>
                        <h3>{isAgentMode ? 'AI Agent Mode' : 'AI Code Assistant'}</h3>
                        <p>
                            {isAgentMode
                                ? 'The agent can search code, create files, and run code autonomously. Try: "Create a hello.py and run it"'
                                : 'Use the quick actions above or type a question about your code below.'
                            }
                        </p>
                        <div className="aiAssistant__welcomeHints">
                            {isAgentMode ? (
                                <>
                                    <span>💡 "Create a sorting utility and test it"</span>
                                    <span>💡 "Find all database queries in this project"</span>
                                    <span>💡 "Create a REST API endpoint for users"</span>
                                </>
                            ) : (
                                <>
                                    <span>💡 "Optimize this function"</span>
                                    <span>💡 "Add error handling"</span>
                                    <span>💡 "What does this do?"</span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`aiMessage aiMessage--${msg.role} ${msg.isToolLog ? 'aiMessage--toolLog' : ''} ${msg.isStreaming ? 'aiMessage--streaming' : ''}`}>
                        <div className="aiMessage__header">
                            <span className="aiMessage__avatar">
                                {msg.role === 'user' ? '👤' : msg.role === 'error' ? '⚠️' : msg.isToolLog ? '🔧' : '🤖'}
                            </span>
                            <span className="aiMessage__sender">
                                {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : msg.isToolLog ? 'Tool Calls' : 'AI Assistant'}
                            </span>
                            {msg.action && msg.role === 'user' && (
                                <span className="aiMessage__action">{msg.action}</span>
                            )}
                            {msg.isStreaming && (
                                <span className="aiMessage__streamingBadge">⚡ streaming</span>
                            )}
                            {msg.iterations && (
                                <span className="aiMessage__action">🔧 {msg.iterations} tool calls</span>
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

                        {/* Phase 6: Apply Fix buttons */}
                        {msg.fixes && msg.fixes.length > 0 && (
                            <div className="aiMessage__fixes">
                                <div className="aiMessage__fixesHeader">💡 Suggested Fixes:</div>
                                {msg.fixes.map((fix, fixIdx) => (
                                    <div key={fixIdx} className="aiMessage__fix">
                                        <div className="aiMessage__fixInfo">
                                            <span className="aiMessage__fixFile">📄 {fix.fileName}</span>
                                            <span className="aiMessage__fixDesc">{fix.description}</span>
                                        </div>
                                        <button
                                            className="aiMessage__applyBtn"
                                            onClick={() => handleApplyFix(fix)}
                                            title="Apply this fix to the editor"
                                        >
                                            ✅ Apply Fix
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* RAG Context indicator */}
                        {msg.ragSources && msg.ragSources.length > 0 && (
                            <div className="aiMessage__ragBadge">
                                <span className="aiMessage__ragIcon">📚</span>
                                <span className="aiMessage__ragLabel">RAG Context Used</span>
                                <span className="aiMessage__ragFiles">
                                    {[...new Set(msg.ragSources.map(s => s.fileName))].map((name, i) => (
                                        <span key={i} className="aiMessage__ragFile">{name}</span>
                                    ))}
                                </span>
                            </div>
                        )}

                        {msg.role === 'assistant' && !msg.isToolLog && (
                            <div className="aiMessage__footer">
                                <CopyButton text={msg.rawContent || msg.content} />
                                {msg.model && <span className="aiMessage__model">{msg.model}</span>}
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && !messages.some((m) => m.isStreaming) && (
                    <div className="aiMessage aiMessage--assistant aiMessage--loading">
                        <div className="aiMessage__header">
                            <span className="aiMessage__avatar">{isAgentMode ? '🤖' : '🤖'}</span>
                            <span className="aiMessage__sender">{isAgentMode ? 'Agent Working…' : 'AI Assistant'}</span>
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

            {/* Image Preview */}
            {imagePreview && (
                <div className="aiAssistant__imagePreview">
                    <img src={imagePreview} alt="Upload preview" />
                    <button className="aiAssistant__imageRemove" onClick={clearImage}>✕</button>
                </div>
            )}

            {/* Input */}
            <form className="aiAssistant__input" onSubmit={handleSendMessage}>
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleImageSelect}
                />
                <button
                    type="button"
                    className="aiAssistant__imageBtn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload image (screenshot → code)"
                    disabled={isLoading}
                >
                    <ImageIcon />
                </button>
                <textarea
                    ref={inputRef}
                    className="aiAssistant__textarea"
                    placeholder={isAgentMode ? 'Give the agent a task…' : 'Ask about your code…'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className="aiAssistant__sendBtn"
                    disabled={isLoading || (!inputValue.trim() && !imageBase64)}
                    title="Send message"
                >
                    <SendIcon />
                </button>
            </form>
        </div>
    );
};

export default AIAssistant;
