import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router-dom';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import FileTree from '../components/FileTree';
import VideoCall from '../components/VideoCall';
import AIAssistant from '../components/AIAssistant';
import { BACKEND_URL } from '../config';
import { DEFAULT_LANGUAGE, LANGUAGE_OPTIONS, getLanguageLabel } from '../languages';
import { initSocket } from '../socket';
import { mergeFix, findFixTarget } from '../utils/applyFix';
import { useWebRTC } from '../hooks/useWebRTC';

/* ─── SVG Icons ─── */
const FilesIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
    </svg>
);

const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
);

const UsersIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const VideoIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
);

const TerminalIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
);

const SidebarIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
);

const CopyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const LogOutIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const SparklesIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
);

/* ─── Helpers ─── */

function startDocumentResize(mouseDownEvent, cursor, onResize) {
    mouseDownEvent.preventDefault();
    document.body.style.cursor = cursor;

    function handleMouseMove(mouseMoveEvent) {
        onResize(mouseMoveEvent);
    }

    function stopResize() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        document.body.style.cursor = 'default';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
}

/* ─── Active panel enum ─── */
const PANELS = { FILES: 'files', RUN: 'run', MEMBERS: 'members', AI: 'ai' };

/* ========================================================================= */

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef('');

    const location = useLocation();
    const { roomId } = useParams();
    const navigate = useNavigate();
    const username = location.state?.username;

    const [clients, setClients] = useState([]);
    const [socketClient, setSocketClient] = useState(null);

    // File Tree State
    const [files, setFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState(null);
    const [mainFileId, setMainFileId] = useState(null);
    const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

    // Execution / UI State
    const [stdin, setStdin] = useState('');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [terminalHeight, setTerminalHeight] = useState(200);
    const [activePanel, setActivePanel] = useState(PANELS.FILES);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [isTerminalVisible, setIsTerminalVisible] = useState(true);

    // AI Assistant State
    const [aiTriggerAction, setAiTriggerAction] = useState(null);

    // WebRTC Video Call
    const {
        localStream,
        peerStreams,
        peerUsernames,
        isMuted,
        isCameraOff,
        isVideoCallActive,
        callError,
        callRoomInfo,
        startCall,
        endCall,
        toggleMic,
        toggleCamera,
    } = useWebRTC(socketClient, roomId, username);

    const activeFile = files.find((f) => f._id === activeFileId);
    const initialCode = activeFile ? activeFile.code : '';

    const handleCodeChange = useCallback((code) => {
        codeRef.current = code;
    }, []);

    const startTerminalResizing = useCallback((mouseDownEvent) => {
        startDocumentResize(mouseDownEvent, 'row-resize', (mouseMoveEvent) => {
            const newHeight = window.innerHeight - mouseMoveEvent.clientY;
            if (newHeight >= 100 && newHeight <= window.innerHeight - 100) {
                setTerminalHeight(newHeight);
            }
        });
    }, []);

    const startSidebarResizing = useCallback((mouseDownEvent) => {
        startDocumentResize(mouseDownEvent, 'col-resize', (mouseMoveEvent) => {
            const newWidth = mouseMoveEvent.clientX - 50; // subtract activity bar width
            if (newWidth >= 180 && newWidth <= 500) {
                setSidebarWidth(newWidth);
            }
        });
    }, []);

    const togglePanel = (panel) => {
        if (activePanel === panel && isSidebarVisible) {
            setIsSidebarVisible(false);
        } else {
            setActivePanel(panel);
            setIsSidebarVisible(true);
        }
    };

    /* ─── Socket setup ─── */

    useEffect(() => {
        if (!username) return undefined;
        let ignore = false;

        async function connectToRoom() {
            const socket = await initSocket();
            if (ignore) {
                socket.disconnect();
                return;
            }

            socketRef.current = socket;
            setSocketClient(socket);

            function handleSocketError(error) {
                console.log('socket error', error);
                toast.error('Socket connection failed, try again later.');
                navigate('/');
            }

            socket.on('connect_error', handleSocketError);
            socket.on('connect_failed', handleSocketError);

            socket.on(ACTIONS.JOINED, ({ clients: joinedClients, username: joinedUser }) => {
                if (joinedUser !== username) {
                    toast.success(`${joinedUser} joined the room.`);
                }
                setClients(joinedClients);
            });

            socket.on(ACTIONS.DISCONNECTED, ({ socketId, username: leftUser }) => {
                if (leftUser) toast.success(`${leftUser} left the room.`);
                setClients((currentClients) =>
                    currentClients.filter((client) => client.socketId !== socketId)
                );
            });

            socket.on(ACTIONS.SYNC_FILES, ({ files: dbFiles, mainFileId: dbMainFileId }) => {
                setFiles(dbFiles);
                setMainFileId(dbMainFileId);
                if (dbFiles.length > 0 && !activeFileId) {
                    const firstFile = dbFiles.find((f) => f.type === 'file');
                    if (firstFile) {
                        setActiveFileId(firstFile._id);
                        codeRef.current = firstFile.code || '';
                        setLanguage(firstFile.language || DEFAULT_LANGUAGE);
                    }
                }
            });

            socket.on(ACTIONS.FILE_CREATE, ({ file }) => {
                setFiles((prev) => [...prev, file]);
            });

            socket.on(ACTIONS.FILE_DELETE, ({ fileId, allDeletedIds }) => {
                const deletedSet = new Set(allDeletedIds || [fileId]);
                setFiles((prev) => prev.filter((f) => !deletedSet.has(f._id)));
                setActiveFileId((prev) => (deletedSet.has(prev) ? null : prev));
                setMainFileId((prev) => (deletedSet.has(prev) ? null : prev));
            });

            socket.on(ACTIONS.FILE_RENAME, ({ file }) => {
                setFiles((prev) => prev.map((f) => (f._id === file._id ? file : f)));
            });

            socket.on(ACTIONS.SET_MAIN_FILE, ({ fileId }) => {
                setMainFileId(fileId);
            });

            socket.on(ACTIONS.LANGUAGE_CHANGE, ({ fileId, language: newLang }) => {
                setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, language: newLang } : f)));
            });

            // Update files array code for non-active files so switching shows latest content
            socket.on(ACTIONS.CODE_CHANGE, ({ fileId, code }) => {
                setFiles((prev) =>
                    prev.map((f) => (f._id === fileId ? { ...f, code } : f))
                );
            });

            socket.emit(ACTIONS.JOIN, { roomId, username });
        }

        connectToRoom();

        return () => {
            ignore = true;
            setSocketClient(null);
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate, roomId, username]);

    // Update active language if external change
    useEffect(() => {
        if (activeFile && activeFile.language !== language) {
            setLanguage(activeFile.language || DEFAULT_LANGUAGE);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFile?.language]);

    useEffect(() => {
        if (callError) {
            toast.error(callError);
        }
    }, [callError]);

    // Notify when someone else starts a call and the current user isn't in it
    const prevCallActiveRef = useRef(false);
    useEffect(() => {
        const callIsActive = callRoomInfo.isActive;
        const wasActive = prevCallActiveRef.current;
        prevCallActiveRef.current = callIsActive;

        // Only show notification when call transitions from inactive → active
        // and the current user is NOT already in the call
        if (callIsActive && !wasActive && !isVideoCallActive) {
            const callerNames = callRoomInfo.participants
                .map((p) => p.username)
                .filter((name) => name !== username);
            const who = callerNames.length > 0 ? callerNames.join(', ') : 'Someone';
            toast(
                `📹 ${who} started a video call!`,
                {
                    duration: 6000,
                    icon: '🔔',
                    style: {
                        background: '#1e293b',
                        color: '#f1f5f9',
                        border: '1px solid rgba(74, 222, 128, 0.3)',
                    },
                }
            );
        }
    }, [callRoomInfo.isActive, callRoomInfo.participants, isVideoCallActive, username]);

    /* ─── Handlers ─── */

    const handleFileSelect = (fileId) => {
        if (fileId === activeFileId) return;

        // Save current active file's code to local state array
        if (activeFileId) {
            setFiles((prev) =>
                prev.map((f) =>
                    f._id === activeFileId ? { ...f, code: codeRef.current } : f
                )
            );
        }

        setActiveFileId(fileId);
        const newFile = files.find((f) => f._id === fileId);
        codeRef.current = newFile?.code || '';
        setLanguage(newFile?.language || DEFAULT_LANGUAGE);
    };

    const handleCreateFile = (parentId) => {
        const name = prompt('File name:');
        if (!name) return;
        socketClient?.emit(ACTIONS.FILE_CREATE, { roomId, name, type: 'file', parentId });
    };

    const handleCreateFolder = (parentId) => {
        const name = prompt('Folder name:');
        if (!name) return;
        socketClient?.emit(ACTIONS.FILE_CREATE, { roomId, name, type: 'folder', parentId });
    };

    const handleRename = (fileId, name) => {
        socketClient?.emit(ACTIONS.FILE_RENAME, { roomId, fileId, name });
    };

    const handleDelete = (fileId) => {
        if (window.confirm('Are you sure you want to delete this?')) {
            socketClient?.emit(ACTIONS.FILE_DELETE, { roomId, fileId });
        }
    };

    const handleSetMain = (fileId) => {
        socketClient?.emit(ACTIONS.SET_MAIN_FILE, { roomId, fileId });
    };

    const handleLanguageChange = (event) => {
        const nextLanguage = event.target.value;
        setLanguage(nextLanguage);
        if (activeFileId) {
            setFiles((prev) =>
                prev.map((f) => (f._id === activeFileId ? { ...f, language: nextLanguage } : f))
            );
            socketClient?.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, fileId: activeFileId, language: nextLanguage });
        }
        toast.success(`Language changed to ${getLanguageLabel(nextLanguage)}`);
    };

    function formatRunResult(data) {
        const hasError = data.error && data.error.trim() !== '';
        const result = hasError
            ? `${data.output ? `${data.output}\n` : ''}Error:\n${data.error}`
            : data.output || '(No output)';
        const details = [
            data.status ? `Status: ${data.status}` : null,
            data.time ? `Time: ${data.time}s` : null,
            data.memory ? `Memory: ${data.memory} KB` : null,
        ].filter(Boolean);

        return details.length ? `${result}\n\n${details.join(' | ')}` : result;
    }

    async function runCode() {
        if (!activeFile) {
            toast.error('Open a file to run it.');
            return;
        }
// read the current written code using this variable -> codeRef.current
        const codeToRun = codeRef.current;

        if (!codeToRun || codeToRun.trim() === '') {
            toast.error('Code is empty!');
            return;
        }

        setIsRunning(true);
        setOutput(`Running ${activeFile.name}...`);
        setIsTerminalVisible(true);

        try {
            const response = await fetch(`${BACKEND_URL}/api/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: codeToRun, language: activeFile.language || language, stdin }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Run failed with status ${response.status}`);
            }

            setOutput(formatRunResult(data));
        } catch (error) {
            setOutput(`Failed to run code.\n${error.message}`);
        } finally {
            setIsRunning(false);
        }
    }

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID copied to clipboard!');
        } catch (error) {
            toast.error('Could not copy the Room ID');
        }
    }

    const handleAIExplain = useCallback((codeSnippet) => {
        setActivePanel(PANELS.AI);
        setIsSidebarVisible(true);
        setAiTriggerAction({
            action: 'explain',
            prompt: `Explain this code:\n\n${codeSnippet}`,
            id: Date.now()
        });
    }, []);

    const handleAIBugfix = useCallback((codeSnippet) => {
        setActivePanel(PANELS.AI);
        setIsSidebarVisible(true);
        setAiTriggerAction({
            action: 'bugfix',
            prompt: `Find bugs and suggest fixes for this code:\n\n${codeSnippet}`,
            id: Date.now()
        });
    }, []);

    const handleAISuggest = useCallback((codeContext) => {
        setActivePanel(PANELS.AI);
        setIsSidebarVisible(true);
        setAiTriggerAction({
            action: 'suggest',
            prompt: `Complete this code:\n\n${codeContext}`,
            id: Date.now()
        });
    }, []);

    // Phase 6: Apply code from AI fix.
    //
    // `newCode` is a *snippet* — the replacement for `oldCode`, not the whole file.
    // Writing it over the entire buffer (what this used to do) deleted everything
    // else in the file whenever the model returned a one-line fix.
    const handleApplyCode = useCallback((fix) => {
        if (!fix || !fix.newCode) return;

        const target = findFixTarget(files, fix.fileName, activeFile);

        if (!target) {
            toast.error(`Could not find "${fix.fileName}" in this room.`);
            return;
        }

        const current = target._id === activeFileId ? codeRef.current : target.code || '';
        const result = mergeFix(current, fix);

        if (!result.ok) {
            if (result.reason === 'already-applied') {
                toast('That fix is already applied.');
            } else if (result.reason === 'anchor-not-found') {
                toast.error('Could not locate the original snippet — the file may have changed.');
            }
            return;
        }

        const updated = result.code;

        if (target._id === activeFileId) {
            codeRef.current = updated;
        }

        if (socketClient) {
            socketClient.emit(ACTIONS.CODE_CHANGE, {
                roomId,
                fileId: target._id,
                code: updated,
            });
        }

        setFiles((prev) =>
            prev.map((f) => (f._id === target._id ? { ...f, code: updated } : f))
        );

        toast.success(
            target._id === activeFileId
                ? 'Fix applied.'
                : `Fix applied to ${target.name}.`
        );
    }, [files, activeFile, activeFileId, socketClient, roomId]);

    if (!location.state) {
        return <Navigate to="/" />;
    }

    /* ─── Render helpers ─── */

    const renderFilesPanel = () => (
        <>
            <FileTree
                files={files}
                activeFileId={activeFileId}
                mainFileId={mainFileId}
                onFileSelect={handleFileSelect}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onRename={handleRename}
                onDelete={handleDelete}
                onSetMain={handleSetMain}
            />

            <div className="sideSection">
                <span className="sideSection__label">Language</span>
                <select
                    id="language-select"
                    value={language}
                    onChange={handleLanguageChange}
                    className="languageSelect"
                    disabled={!activeFileId}
                >
                    {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </>
    );

    const renderRunPanel = () => (
        <>
            <div className="sideSection">
                <span className="sideSection__label">Input (stdin)</span>
                <textarea
                    id="stdin-input"
                    className="stdinInput"
                    placeholder="Program input…"
                    value={stdin}
                    onChange={(event) => setStdin(event.target.value)}
                />
            </div>

            <div className="sideSection">
                <button
                    type="button"
                    className="runBtn"
                    onClick={runCode}
                    disabled={isRunning || !activeFileId}
                >
                    <PlayIcon />
                    {isRunning ? 'Running…' : `Run ${activeFile?.name || 'File'}`}
                </button>
            </div>

            <div className="callStatusSection">
                <h3>Video Call</h3>
                {callRoomInfo.isActive && !isVideoCallActive ? (
                    <div className="callStatusActive">
                        <div className="callStatusInfo">
                            <span className="callStatusDot" />
                            <span>Call Active — {callRoomInfo.participants.length} in call</span>
                        </div>
                        <div className="callStatusParticipants">
                            {callRoomInfo.participants.map((p) => (
                                <span key={p.socketId} className="callStatusName">{p.username}</span>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="joinCallBtn"
                            onClick={startCall}
                            disabled={!socketClient?.connected}
                        >
                            Join Call
                        </button>
                    </div>
                ) : isVideoCallActive ? (
                    <div className="callStatusActive">
                        <div className="callStatusInfo">
                            <span className="callStatusDot" />
                            <span>You are in the call</span>
                        </div>
                    </div>
                ) : (
                    <div className="callStatusInactive">
                        <span>No active call</span>
                    </div>
                )}
            </div>
        </>
    );

    const renderMembersPanel = () => (
        <div className="membersSection">
            <h3>Members ({clients.length})</h3>
            <div className="membersList">
                {clients.map((client) => (
                    <Client key={client.socketId} username={client.username} />
                ))}
            </div>
        </div>
    );

    const renderAIPanel = () => (
        <AIAssistant
            code={codeRef.current}
            language={language}
            fileName={activeFile ? activeFile.name : ''}
            backendUrl={BACKEND_URL}
            triggerAction={aiTriggerAction}
            roomId={roomId}
            onApplyCode={handleApplyCode}
        />
    );

    const panelTitles = {
        [PANELS.FILES]: 'Explorer',
        [PANELS.RUN]: 'Run & Call',
        [PANELS.MEMBERS]: `Members (${clients.length})`,
        [PANELS.AI]: 'AI Assistant',
    };

    return (
        <div className="editorPage">
            {/* ─── Activity Bar ─── */}
            <div className="activityBar">
                <div className="activityBar__top">
                    <img
                        src="/images/synccode_logo_highres.png"
                        alt="SyncCode"
                        className="activityBtn__logo"
                    />

                    <button
                        className={`activityBtn ${activePanel === PANELS.FILES && isSidebarVisible ? 'activityBtn--active' : ''}`}
                        onClick={() => togglePanel(PANELS.FILES)}
                        title="Explorer"
                    >
                        <FilesIcon />
                    </button>

                    <button
                        className={`activityBtn ${activePanel === PANELS.RUN && isSidebarVisible ? 'activityBtn--active' : ''}`}
                        onClick={() => togglePanel(PANELS.RUN)}
                        title="Run & Call"
                    >
                        <PlayIcon />
                    </button>

                    <button
                        className={`activityBtn ${activePanel === PANELS.MEMBERS && isSidebarVisible ? 'activityBtn--active' : ''}`}
                        onClick={() => togglePanel(PANELS.MEMBERS)}
                        title="Members"
                    >
                        <UsersIcon />
                        {clients.length > 1 && (
                            <span className="activityBtn__badge">{clients.length}</span>
                        )}
                    </button>

                    <button
                        className={`activityBtn ${activePanel === PANELS.AI && isSidebarVisible ? 'activityBtn--active' : ''}`}
                        onClick={() => togglePanel(PANELS.AI)}
                        title="AI Assistant"
                    >
                        <SparklesIcon />
                    </button>
                </div>

                <div className="activityBar__bottom">
                    <button
                        className={`activityBtn ${isVideoCallActive ? 'activityBtn--active' : ''} ${callRoomInfo.isActive && !isVideoCallActive ? 'activityBtn--callRinging' : ''}`}
                        onClick={isVideoCallActive ? endCall : startCall}
                        disabled={!socketClient?.connected}
                        title={isVideoCallActive ? 'End Video Call' : callRoomInfo.isActive ? 'Join Ongoing Call' : 'Start Video Call'}
                    >
                        <VideoIcon />
                        {callRoomInfo.isActive && !isVideoCallActive && (
                            <span className="activityBtn__callBadge" title={`${callRoomInfo.participants.length} in call`}>
                                {callRoomInfo.participants.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* ─── Sidebar Panel ─── */}
            {isSidebarVisible && (
                <>
                    <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
                        <div className="sidebar__header">
                            <span className="sidebar__title">{panelTitles[activePanel]}</span>
                        </div>

                        <div className="sidebar__body">
                            {activePanel === PANELS.FILES && renderFilesPanel()}
                            {activePanel === PANELS.RUN && renderRunPanel()}
                            {activePanel === PANELS.MEMBERS && renderMembersPanel()}
                            {activePanel === PANELS.AI && renderAIPanel()}
                        </div>

                        <div className="sidebar__footer">
                            <div className="sidebarBtnRow">
                                <button type="button" className="copyBtn" onClick={copyRoomId}>
                                    <CopyIcon /> Copy ID
                                </button>
                                <button type="button" className="leaveBtn" onClick={() => navigate('/')}>
                                    <LogOutIcon /> Leave
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="sidebar-resizer" onMouseDown={startSidebarResizing}>
                        <div className="grip-vertical" />
                    </div>
                </>
            )}

            {/* ─── Main Editor Area ─── */}
            <div className="main">
                {/* Floating call notification banner */}
                {callRoomInfo.isActive && !isVideoCallActive && (
                    <div className="incomingCallBanner">
                        <div className="incomingCallBanner__left">
                            <span className="incomingCallBanner__dot" />
                            <span className="incomingCallBanner__icon">📹</span>
                            <span className="incomingCallBanner__text">
                                <strong>Video call in progress</strong>
                                <span className="incomingCallBanner__names">
                                    {callRoomInfo.participants.map((p) => p.username).join(', ')}
                                </span>
                            </span>
                        </div>
                        <button
                            type="button"
                            className="incomingCallBanner__joinBtn"
                            onClick={startCall}
                            disabled={!socketClient?.connected}
                        >
                            Join Call
                        </button>
                    </div>
                )}
                <div className="editorAndOutput">
                    <div className="editorHeader">
                        <div className="editorHeader__left">
                            {!isSidebarVisible && (
                                <button
                                    type="button"
                                    className="toggleBtn"
                                    onClick={() => setIsSidebarVisible(true)}
                                    title="Show Sidebar"
                                >
                                    <SidebarIcon />
                                </button>
                            )}

                            {activeFile && (
                                <div className="editorHeader__fileInfo">
                                    📄 <span>{activeFile.name}</span>
                                    {mainFileId === activeFileId && ' ⭐'}
                                </div>
                            )}
                        </div>

                        <div className="editorHeader__right">
                            <button
                                type="button"
                                className={`toggleBtn ${isTerminalVisible ? 'toggleBtn--active' : ''}`}
                                onClick={() => setIsTerminalVisible((v) => !v)}
                                title="Toggle Output"
                            >
                                <TerminalIcon /> Output
                            </button>
                        </div>
                    </div>

                    <div className="editor">
                        {activeFileId ? (
                            <Editor
                                socket={socketClient}
                                roomId={roomId}
                                activeFileId={activeFileId}
                                initialCode={initialCode}
                                onCodeChange={handleCodeChange}
                                language={language}
                                onAIExplain={handleAIExplain}
                                onAIBugfix={handleAIBugfix}
                                onAISuggest={handleAISuggest}
                            />
                        ) : (
                            <div className="editorPlaceholder">
                                <FilesIcon />
                                <span>Select a file to start coding</span>
                            </div>
                        )}
                    </div>

                    {isTerminalVisible && (
                        <>
                            <div className="terminal-resizer" onMouseDown={startTerminalResizing}>
                                <div className="grip-horizontal" />
                            </div>

                            <div className="outputPanel" style={{ height: terminalHeight, minHeight: terminalHeight }}>
                                <div className="outputHeader">
                                    <span>Output</span>
                                    <button
                                        type="button"
                                        className="clearBtn"
                                        onClick={() => setOutput('')}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <pre className="outputContent">{output || 'No output yet.'}</pre>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ─── Video Call Overlay ─── */}
            {isVideoCallActive && (
                <VideoCall
                    localStream={localStream}
                    peerStreams={peerStreams}
                    peerUsernames={peerUsernames}
                    isMuted={isMuted}
                    isCameraOff={isCameraOff}
                    callError={callError}
                    onToggleMic={toggleMic}
                    onToggleCamera={toggleCamera}
                    onEndCall={endCall}
                    currentUsername={username}
                />
            )}
        </div>
    );
};

export default EditorPage;
