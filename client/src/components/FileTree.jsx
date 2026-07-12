import React, { useState, useMemo, useEffect } from 'react';
import FileTreeItem from './FileTreeItem';

const FileTree = ({
    files = [],
    activeFileId,
    mainFileId,
    onFileSelect,
    onCreateFile,
    onCreateFolder,
    onRename,
    onDelete,
    onSetMain,
}) => {
    const [expandedFolders, setExpandedFolders] = useState({});
    const [contextMenu, setContextMenu] = useState(null);
    const [inlineEdit, setInlineEdit] = useState(null); // { id, name }

    useEffect(() => {
        const handleClickOutside = () => closeContextMenu();
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const toggleFolder = (folderId) => {
        setExpandedFolders((prev) => ({
            ...prev,
            [folderId]: !prev[folderId],
        }));
    };

    const handleContextMenu = (e, file) => {
        setContextMenu({
            mouseX: e.clientX,
            mouseY: e.clientY,
            file,
        });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const handleRenameSubmit = (id, newName) => {
        if (newName.trim() !== '') {
            onRename(id, newName.trim());
        }
        setInlineEdit(null);
    };

    // Organize files into a tree
    const fileTree = useMemo(() => {
        const buildTree = (parentId) => {
            // Normalize parentId for comparison: null/undefined/'' all mean "root"
            const normalizedParent = parentId ? String(parentId) : null;
            return files
                .filter((f) => {
                    const fileParent = f.parentId ? String(f.parentId) : null;
                    return fileParent === normalizedParent;
                })
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                })
                .map((f) => ({
                    ...f,
                    children: f.type === 'folder' ? buildTree(f._id) : [],
                }));
        };
        return buildTree(null);
    }, [files]);

    const renderTree = (nodes, depth = 0) => {
        return nodes.map((node) => (
            <React.Fragment key={node._id}>
                {inlineEdit?.id === node._id ? (
                    <div
                        className="fileTreeItem"
                        style={{ paddingLeft: `${depth * 16 + 10}px` }}
                    >
                        <span className="fileTreeItemIcon">
                            {node.type === 'folder' ? '📁' : '📄'}
                        </span>
                        <input
                            autoFocus
                            className="fileTreeInlineInput"
                            value={inlineEdit.name}
                            onChange={(e) =>
                                setInlineEdit({ ...inlineEdit, name: e.target.value })
                            }
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleRenameSubmit(node._id, inlineEdit.name);
                                }
                                if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            onBlur={() => handleRenameSubmit(node._id, inlineEdit.name)}
                        />
                    </div>
                ) : (
                    <FileTreeItem
                        file={node}
                        depth={depth}
                        activeFileId={activeFileId}
                        mainFileId={mainFileId}
                        onSelect={onFileSelect}
                        onContextMenu={handleContextMenu}
                        isExpanded={expandedFolders[node._id]}
                        onToggleExpand={toggleFolder}
                        onCreateFile={(parentId) => {
                            onCreateFile(parentId);
                            setExpandedFolders((prev) => ({ ...prev, [parentId]: true }));
                        }}
                        onCreateFolder={(parentId) => {
                            onCreateFolder(parentId);
                            setExpandedFolders((prev) => ({ ...prev, [parentId]: true }));
                        }}
                    />
                )}
                {node.type === 'folder' &&
                    expandedFolders[node._id] &&
                    renderTree(node.children, depth + 1)}
            </React.Fragment>
        ));
    };

    return (
        <div
            className="fileTreeSection"
            onContextMenu={(e) => {
                e.preventDefault();
            }}
        >
            <div className="fileTreeHeader">
                <h3>Files</h3>
                <div className="fileTreeActions">
                    <button
                        onClick={() => onCreateFile(null)}
                        title="New File"
                    >
                        +📄
                    </button>
                    <button
                        onClick={() => onCreateFolder(null)}
                        title="New Folder"
                    >
                        +📁
                    </button>
                </div>
            </div>

            <div className="fileTreeList">{renderTree(fileTree)}</div>

            {contextMenu && (
                <div
                    className="fileTreeContextMenu"
                    style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            setInlineEdit({
                                id: contextMenu.file._id,
                                name: contextMenu.file.name,
                            });
                            closeContextMenu();
                        }}
                    >
                        ✏️ Rename
                    </button>
                    <button
                        onClick={() => {
                            onDelete(contextMenu.file._id);
                            closeContextMenu();
                        }}
                    >
                        🗑️ Delete
                    </button>
                    {contextMenu.file.type === 'file' && (
                        <button
                            onClick={() => {
                                onSetMain(contextMenu.file._id);
                                closeContextMenu();
                            }}
                        >
                            ⭐ Set as Main
                        </button>
                    )}
                    {contextMenu.file.type === 'folder' && (
                        <>
                            <button
                                onClick={() => {
                                    onCreateFile(contextMenu.file._id);
                                    setExpandedFolders((prev) => ({
                                        ...prev,
                                        [contextMenu.file._id]: true,
                                    }));
                                    closeContextMenu();
                                }}
                            >
                                📄 New File Here
                            </button>
                            <button
                                onClick={() => {
                                    onCreateFolder(contextMenu.file._id);
                                    setExpandedFolders((prev) => ({
                                        ...prev,
                                        [contextMenu.file._id]: true,
                                    }));
                                    closeContextMenu();
                                }}
                            >
                                📁 New Folder Here
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default FileTree;
