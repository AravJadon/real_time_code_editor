import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState('javascript');
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [terminalHeight, setTerminalHeight] = useState(200);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [isTerminalVisible, setIsTerminalVisible] = useState(true);

    const startTerminalResizing = React.useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        const handleMouseMove = (mouseMoveEvent) => {
            const newHeight = window.innerHeight - mouseMoveEvent.clientY;
            if (newHeight >= 100 && newHeight <= window.innerHeight - 100) {
                setTerminalHeight(newHeight);
            }
        };
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'row-resize';
    }, []);

    const startResizing = React.useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        const handleMouseMove = (mouseMoveEvent) => {
            const newWidth = mouseMoveEvent.clientX;
            if (newWidth >= 160 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        };
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    }, []);

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();

            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    // Only existing users should send their code to the new user
                    if (username !== location.state?.username) {
                        socketRef.current.emit(ACTIONS.SYNC_CODE, {
                            code: codeRef.current,
                            socketId,
                            language,
                        });
                    }
                }
            );

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) =>
                        prev.filter((client) => client.socketId !== socketId)
                    );
                }
            );

            // Listening for language change from others
            socketRef.current.on(
                ACTIONS.LANGUAGE_CHANGE,
                ({ language }) => {
                    setLanguage(language);
                    toast.success(`Language changed to ${language}`);
                }
            );
        };

        init();

        return () => {
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
        };
    }, []);

    // Handle language change
    function handleLanguageChange(e) {
        const newLang = e.target.value;
        setLanguage(newLang);
        socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
            roomId,
            language: newLang,
        });
        toast.success(`Language changed to ${newLang}`);
    }

    // Run code
    async function runCode() {
        if (!codeRef.current || codeRef.current.trim() === '') {
            toast.error('Please write some code first!');
            return;
        }

        setIsRunning(true);
        setOutput('⏳ Running...');

        try {
            const response = await fetch(
                `http://localhost:5000/api/run`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: codeRef.current,
                        language,
                    }),
                }
            );

            const data = await response.json();

            if (data.error && data.error.trim() !== '') {
                setOutput(
                    (data.output ? data.output + '\n' : '') +
                    '❌ Error:\n' + data.error
                );
            } else {
                setOutput(data.output || '(No output)');
            }
        } catch (err) {
            setOutput('❌ Failed to connect to server.\n' + err.message);
        }

        setIsRunning(false);
    }

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID copied to clipboard!');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="editorPage">

            {/* Sidebar */}
            {isSidebarVisible && (
                <>
                    <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>

                        <div className="logoSection">
                    <img
                        src={'/images/synccode_logo_highres.png'}
                        alt="SyncCode Logo"
                    />
                    <h2>Sync Code</h2>
                </div>

                <hr />

                {/* Language Selector */}
                <div className="languageSection">
                    <label htmlFor="language-select">Language</label>
                    <select
                        id="language-select"
                        value={language}
                        onChange={handleLanguageChange}
                        className="languageSelect"
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                    </select>
                </div>

                {/* Run Button */}
                <div className="runSection">
                    <button
                        className="runBtn"
                        onClick={runCode}
                        disabled={isRunning}
                    >
                        {isRunning ? '⏳ Running...' : '▶ Run Code'}
                    </button>
                </div>

                <hr />

                {/* Members */}
                <div className="membersSection">
                    <h3>Members</h3>
                    {clients.map((client) => (
                        <Client
                            key={client.socketId}
                            username={client.username}
                        />
                    ))}
                </div>

                <div className="buttons">
                    <button className="copyBtn" onClick={copyRoomId}>
                        Copy Room ID
                    </button>
                        <button className="leaveBtn" onClick={leaveRoom}>
                            Leave Room
                        </button>
                    </div>
                </div>

                {/* Resizer */}
                <div 
                    className="sidebar-resizer" 
                    onMouseDown={startResizing}
                >
                    <div className="grip-vertical"></div>
                </div>
            </>
            )}

            {/* Main Area: Editor + Output */}
            <div className="main">
                <div className="editorAndOutput">
                    
                    {/* Toggle Bar */}
                    <div className="editorHeader">
                        <button 
                            className="toggleBtn" 
                            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                            title="Toggle Sidebar"
                        >
                            ☰
                        </button>
                        <button 
                            className="toggleBtn" 
                            onClick={() => setIsTerminalVisible(!isTerminalVisible)}
                            title="Toggle Terminal"
                        >
                            💻
                        </button>
                    </div>

                    <div className="editor">
                        <Editor
                            socketRef={socketRef}
                            roomId={roomId}
                            onCodeChange={(code) => {
                                codeRef.current = code;
                            }}
                            language={language}
                        />
                    </div>

                    {/* Terminal Section */}
                    {isTerminalVisible && (
                        <>
                            {/* Terminal Resizer */}
                            <div 
                                className="terminal-resizer" 
                                onMouseDown={startTerminalResizing}
                            >
                                <div className="grip-horizontal"></div>
                            </div>

                            {/* Output Console */}
                            <div className="outputPanel" style={{ height: terminalHeight, minHeight: terminalHeight }}>
                                <div className="outputHeader">
                                    <span>📟 Output</span>
                                    <button
                                        className="clearBtn"
                                        onClick={() => setOutput('')}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <pre className="outputContent">
                                    {output || 'Click "▶ Run Code" to see output here...'}
                                </pre>
                            </div>
                        </>
                    )}
                </div>
            </div>

        </div>
    );
};

export default EditorPage;