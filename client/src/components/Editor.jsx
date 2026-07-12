import React, { useEffect, useRef, useState, useCallback } from 'react';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/mode/clike/clike';
import 'codemirror/mode/go/go';
import 'codemirror/mode/rust/rust';
import 'codemirror/mode/php/php';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/shell/shell';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../Actions';
import { DEFAULT_LANGUAGE } from '../languages';

const Editor = ({ socket, roomId, activeFileId, initialCode, onCodeChange, language, onAIExplain, onAIBugfix, onAISuggest }) => {
    const editorRef = useRef(null);
    const socketRef = useRef(socket);
    const onCodeChangeRef = useRef(onCodeChange);
    const isRemoteChange = useRef(false);
    const activeFileIdRef = useRef(activeFileId);
    const editorWrapperRef = useRef(null);

    // Context menu state
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    useEffect(() => {
        onCodeChangeRef.current = onCodeChange;
    }, [onCodeChange]);

    useEffect(() => {
        activeFileIdRef.current = activeFileId;
    }, [activeFileId]);

    useEffect(() => {
        editorRef.current = Codemirror.fromTextArea(
            document.getElementById('realtimeEditor'),
            {
                mode: getModeFromLanguage(DEFAULT_LANGUAGE),
                theme: 'dracula',
                autoCloseTags: true,
                autoCloseBrackets: true,
                lineNumbers: true,
            }
        );

        editorRef.current.setValue(initialCode || '');

        editorRef.current.on('change', (instance, changes) => {
            const { origin } = changes;
            const code = instance.getValue();

            onCodeChangeRef.current(code);

            if (origin !== 'setValue' && !isRemoteChange.current && socketRef.current && activeFileIdRef.current) {
                socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                    roomId,
                    fileId: activeFileIdRef.current,
                    code,
                });
            }
        });

        return () => {
            editorRef.current?.toTextArea();
            editorRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once

    useEffect(() => {
        if (editorRef.current && initialCode !== editorRef.current.getValue()) {
            isRemoteChange.current = true;
            editorRef.current.setValue(initialCode || '');
            isRemoteChange.current = false;
        }
    }, [activeFileId, initialCode]);

    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.setOption('mode', getModeFromLanguage(language));
        }
    }, [language]);

    useEffect(() => {
        if (!socket) return undefined;

        const handleCodeChange = ({ fileId, code }) => {
            if (code === null || code === undefined || !editorRef.current) return;
            if (fileId !== activeFileIdRef.current) return;

            isRemoteChange.current = true;
            const cursor = editorRef.current.getCursor();
            editorRef.current.setValue(code);
            editorRef.current.setCursor(cursor);
            isRemoteChange.current = false;
        };

        socket.on(ACTIONS.CODE_CHANGE, handleCodeChange);

        return () => {
            socket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
        };
    }, [socket]);

    // Context menu handlers
    const handleContextMenu = useCallback((e) => {
        // Only intercept right-click on the CodeMirror editor area
        const cmEl = editorWrapperRef.current?.querySelector('.CodeMirror');
        if (!cmEl || !cmEl.contains(e.target)) return;

        e.preventDefault();
        const selection = editorRef.current?.getSelection() || '';
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            hasSelection: selection.length > 0,
            selection,
        });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    // Close context menu on click outside or Escape
    useEffect(() => {
        if (!contextMenu) return undefined;

        const handleClick = () => closeContextMenu();
        const handleKeyDown = (e) => { if (e.key === 'Escape') closeContextMenu(); };

        document.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('click', handleClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu, closeContextMenu]);

    const handleAIAction = useCallback((action) => {
        const selection = editorRef.current?.getSelection() || '';
        const fullCode = editorRef.current?.getValue() || '';
        const codeToSend = selection || fullCode;

        if (action === 'explain' && onAIExplain) {
            onAIExplain(codeToSend);
        } else if (action === 'bugfix' && onAIBugfix) {
            onAIBugfix(codeToSend);
        } else if (action === 'suggest' && onAISuggest) {
            // For suggest, send code up to cursor position
            const cursor = editorRef.current?.getCursor();
            const codeUpToCursor = cursor
                ? editorRef.current?.getRange({ line: 0, ch: 0 }, cursor)
                : fullCode;
            onAISuggest(codeUpToCursor);
        }
        closeContextMenu();
    }, [onAIExplain, onAIBugfix, onAISuggest, closeContextMenu]);

    return (
        <div style={{ height: '100%', width: '100%' }} ref={editorWrapperRef} onContextMenu={handleContextMenu}>
            <textarea id="realtimeEditor" />

            {/* AI Context Menu */}
            {contextMenu && (
                <div
                    className="editorContextMenu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 1001,
                    }}
                >
                    <div className="editorContextMenu__header">
                        <span>✨ AI Actions</span>
                    </div>
                    <button onClick={() => handleAIAction('explain')}>
                        <span className="editorContextMenu__icon">📖</span>
                        {contextMenu.hasSelection ? 'Explain Selection' : 'Explain Code'}
                    </button>
                    <button onClick={() => handleAIAction('bugfix')}>
                        <span className="editorContextMenu__icon">🐛</span>
                        {contextMenu.hasSelection ? 'Find Bugs in Selection' : 'Find Bugs'}
                    </button>
                    <button onClick={() => handleAIAction('suggest')}>
                        <span className="editorContextMenu__icon">🔮</span>
                        Suggest Completion
                    </button>
                    <div className="editorContextMenu__divider" />
                    <button onClick={() => { closeContextMenu(); }}>
                        <span className="editorContextMenu__icon">✕</span>
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

function getModeFromLanguage(lang) {
    switch (lang) {
        case 'bash':
            return { name: 'shell' };
        case 'c':
            return 'text/x-csrc';
        case 'cpp':
            return 'text/x-c++src';
        case 'csharp':
            return 'text/x-csharp';
        case 'go':
            return 'text/x-go';
        case 'java':
            return 'text/x-java';
        case 'php':
            return 'application/x-httpd-php';
        case 'python':
            return { name: 'python' };
        case 'ruby':
            return { name: 'ruby' };
        case 'rust':
            return { name: 'rust' };
        case 'typescript':
            return { name: 'javascript', typescript: true };
        case 'javascript':
        default:
            return { name: 'javascript' };
    }
}

export default Editor;


