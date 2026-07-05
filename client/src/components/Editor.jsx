import React, { useEffect, useRef } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../Actions';

const Editor = ({ socketRef, roomId, onCodeChange, language }) => {
    const editorRef = useRef(null);

    // Initialize CodeMirror
    useEffect(() => {
        async function init() {
            editorRef.current = Codemirror.fromTextArea(
                document.getElementById('realtimeEditor'),
                {
                    mode: language === 'python'
                        ? { name: 'python' }
                        : { name: 'javascript', json: true },
                    theme: 'dracula',
                    autoCloseTags: true,
                    autoCloseBrackets: true,
                    lineNumbers: true,
                }
            );

            editorRef.current.on('change', (instance, changes) => {
                const { origin } = changes;
                const code = instance.getValue();
                onCodeChange(code);
                if (origin !== 'setValue') {
                    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code,
                    });
                }
            });
        }
        init();
    }, []);

    // Update CodeMirror mode when language changes
    useEffect(() => {
        if (editorRef.current) {
            if (language === 'python') {
                editorRef.current.setOption('mode', { name: 'python' });
            } else {
                editorRef.current.setOption('mode', { name: 'javascript', json: true });
            }
        }
    }, [language]);

    // Listen for remote code changes
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;

        const handleCodeChange = ({ code }) => {
            if (code !== null) {
                editorRef.current.setValue(code);
            }
        };

        socket.on(ACTIONS.CODE_CHANGE, handleCodeChange);

        return () => {
            socket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
        };
    }, [socketRef.current]);

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <textarea id="realtimeEditor"></textarea>
        </div>
    );
};

export default Editor;