import React, { useEffect, useRef, useState, useCallback } from 'react';

const VideoElement = ({ stream, isLocal }) => {
    const videoRef = useRef();

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`videoStream ${isLocal ? 'videoStream--local' : ''}`}
        />
    );
};

// SVG Icons
const MicIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const MicOffIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const CamIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
);

const CamOffIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
    </svg>
);

const ScreenShareIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <polyline points="9 10 12 7 15 10" />
        <line x1="12" y1="7" x2="12" y2="14" />
    </svg>
);

const EndCallIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
        <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
);

const VideoCall = ({
    localStream,
    peerStreams,
    peerUsernames,
    isMuted,
    isCameraOff,
    isScreenSharing,
    callError,
    onToggleMic,
    onToggleCamera,
    onToggleScreenShare,
    onEndCall,
    currentUsername,
}) => {
    const panelRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: null, y: null });
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    const peerCount = Object.keys(peerStreams).length;
    const totalParticipants = 1 + peerCount; // +1 for local

    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('.videoControls') || e.target.closest('.videoGrid')) return;
        e.preventDefault();
        const rect = panelRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            const x = e.clientX - dragOffsetRef.current.x;
            const y = e.clientY - dragOffsetRef.current.y;
            setPosition({ x, y });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const panelStyle = position.x !== null
        ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
        : {};

    return (
        <div
            ref={panelRef}
            className={`videoCallPanel ${isDragging ? 'videoCallPanel--dragging' : ''} ${totalParticipants > 2 ? 'videoCallPanel--large' : ''}`}
            style={panelStyle}
            onMouseDown={handleMouseDown}
        >
            <div className="videoCallHeader">
                <div className="videoCallHeaderLeft">
                    <span className="videoCallDot" />
                    <span>Video Call</span>
                </div>
                <span className="videoCallParticipantCount">
                    {totalParticipants} {totalParticipants === 1 ? 'participant' : 'participants'}
                </span>
            </div>

            <div className="videoGrid">
                {localStream && (
                    <div className={`videoWrapper ${isScreenSharing ? '' : ''}`}>
                        <VideoElement stream={localStream} isLocal={true} />
                        <span className="videoLabel">
                            {currentUsername || 'You'} {isScreenSharing ? '(Sharing)' : ''}
                        </span>
                    </div>
                )}
                {Object.entries(peerStreams).map(([socketId, stream]) => (
                    <div className="videoWrapper" key={socketId}>
                        <VideoElement stream={stream} isLocal={false} />
                        <span className="videoLabel">
                            {peerUsernames[socketId] || 'Peer'}
                        </span>
                    </div>
                ))}
            </div>

            {peerCount === 0 && (
                <div className="videoCallWaiting">
                    Waiting for others to join the call…
                </div>
            )}

            {callError && <div className="videoCallError">{callError}</div>}

            <div className="videoControls">
                <button
                    type="button"
                    className={`videoControlBtn ${isMuted ? 'muted' : ''}`}
                    onClick={onToggleMic}
                    title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                    {isMuted ? <MicOffIcon /> : <MicIcon />}
                </button>
                <button
                    type="button"
                    className={`videoControlBtn ${isCameraOff ? 'off' : ''}`}
                    onClick={onToggleCamera}
                    title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                    {isCameraOff ? <CamOffIcon /> : <CamIcon />}
                </button>
                <button
                    type="button"
                    className={`videoControlBtn ${isScreenSharing ? 'active' : ''}`}
                    onClick={onToggleScreenShare}
                    title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                >
                    <ScreenShareIcon />
                </button>
                <button
                    type="button"
                    className="videoControlBtn videoControlBtn--danger"
                    onClick={onEndCall}
                    title="End Call"
                >
                    <EndCallIcon />
                </button>
            </div>
        </div>
    );
};

export default VideoCall;
