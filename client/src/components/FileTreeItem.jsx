import React from 'react';

const FileTreeItem = ({
    file,
    depth = 0,
    activeFileId,
    mainFileId,
    onSelect,
    onContextMenu,
    isExpanded,
    onToggleExpand,
    onCreateFile,
    onCreateFolder,
}) => {
    const isFolder = file.type === 'folder';
    const isActive = activeFileId === file._id;
    const isMain = mainFileId === file._id;

    const handleContextMenu = (e) => {
        e.preventDefault();
        onContextMenu(e, file);
    };

    return (
        <div
            className={`fileTreeItem ${isActive ? 'fileTreeItem--active' : ''} ${
                isFolder ? 'fileTreeItem--folder' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 10}px` }}
            onClick={() => {
                if (isFolder) {
                    onToggleExpand(file._id);
                } else {
                    onSelect(file._id);
                }
            }}
            onContextMenu={handleContextMenu}
        >
            <span className="fileTreeItemIcon">
                {isFolder ? (isExpanded ? '📂' : '📁') : '📄'}
            </span>
            <span className="fileTreeItemName">{file.name}</span>
            {isMain && !isFolder && (
                <span className="fileTreeMainStar" title="Main File">
                    ⭐
                </span>
            )}
            {isFolder && (
                <span className="fileTreeItemActions">
                    <button
                        className="fileTreeItemActionBtn"
                        title="New File"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCreateFile(file._id);
                        }}
                    >
                        +📄
                    </button>
                    <button
                        className="fileTreeItemActionBtn"
                        title="New Folder"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCreateFolder(file._id);
                        }}
                    >
                        +📁
                    </button>
                </span>
            )}
        </div>
    );
};

export default FileTreeItem;
