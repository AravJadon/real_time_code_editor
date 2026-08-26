import React from 'react';
// Display one row of the file tree and handle user interaction for that row.
// Show 📁
// Show "src"
// If clicked → expand/collapse
// Show +📄
// Show +📁
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
            // as the depth grows we increase left padding 
            style={{ paddingLeft: `${depth * 16 + 10}px` }}
            onClick={() => {
                if (isFolder) {
                    onToggleExpand(file._id);
                } else {
                    onSelect(file._id);
                }
            }}
            // onContextMenu is React event for right click 
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
  //Without stopPropagation(): 
 // The child tells the parent, the parent tells the grandparent, and the message keeps traveling.
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
