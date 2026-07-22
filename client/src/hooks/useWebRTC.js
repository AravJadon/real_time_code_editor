import { useState, useEffect, useRef, useCallback } from 'react';
import ACTIONS from '../Actions';
import { BACKEND_URL } from '../config';

// Fallback STUN-only config
const FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

// Fetch TURN credentials from our server
async function fetchIceServers() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/turn-credentials`);
        if (response.ok) {
            const data = await response.json();
            if (data.iceServers && data.iceServers.length > 0) {
                console.log(`Fetched ${data.iceServers.length} ICE servers from server`);
                return data.iceServers;
            }
        }
    } catch (err) {
        console.warn('Failed to fetch TURN credentials, using STUN fallback:', err.message);
    }
    return FALLBACK_ICE_SERVERS;
}

function getPreferredMediaStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera and microphone access is not supported in this browser.');
    }

    return navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .catch(async (firstError) => {
            try {
                return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch {
                try {
                    return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                } catch {
                    throw firstError;
                }
            }
        });
}

export const useWebRTC = (socket, roomId, username) => {
    const [localStream, setLocalStream] = useState(null);
    const [peerStreams, setPeerStreams] = useState({});
    const [peerUsernames, setPeerUsernames] = useState({});
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isVideoCallActive, setIsVideoCallActive] = useState(false);
    const [callError, setCallError] = useState('');
    const [callRoomInfo, setCallRoomInfo] = useState({ isActive: false, participants: [] });

    const peersRef = useRef({});
    const localStreamRef = useRef(null);
    const hasJoinedCallRef = useRef(false);
    const iceCandidateBufferRef = useRef({});
    const iceConfigRef = useRef({ iceServers: FALLBACK_ICE_SERVERS });

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        localStreamRef.current = null;
        setLocalStream(null);
    }, []);

    const cleanupPeer = useCallback((socketId) => {
        const pc = peersRef.current[socketId];
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.oniceconnectionstatechange = null;
            pc.onnegotiationneeded = null;
            pc.close();
            delete peersRef.current[socketId];
        }
        delete iceCandidateBufferRef.current[socketId];

        setPeerStreams((prev) => {
            if (!prev[socketId]) return prev;
            const next = { ...prev };
            delete next[socketId];
            return next;
        });
        setPeerUsernames((prev) => {
            if (!prev[socketId]) return prev;
            const next = { ...prev };
            delete next[socketId];
            return next;
        });
    }, []);

    const cleanupAllPeers = useCallback(() => {
        Object.keys(peersRef.current).forEach((socketId) => cleanupPeer(socketId));
        peersRef.current = {};
        iceCandidateBufferRef.current = {};
        setPeerStreams({});
        setPeerUsernames({});
    }, [cleanupPeer]);

    // Create an RTCPeerConnection to a remote peer
    const createPeerConnection = useCallback((remoteSocketId, remoteUsername, isInitiator = false) => {
        if (!remoteSocketId || remoteSocketId === socket?.id || !localStreamRef.current) {
            return null;
        }

        // Clean up any existing connection first to prevent conflicts
        if (peersRef.current[remoteSocketId]) {
            const existing = peersRef.current[remoteSocketId];
            existing.onicecandidate = null;
            existing.ontrack = null;
            existing.oniceconnectionstatechange = null;
            existing.onnegotiationneeded = null;
            existing.close();
            delete peersRef.current[remoteSocketId];
            delete iceCandidateBufferRef.current[remoteSocketId];
        }

        const pc = new RTCPeerConnection(iceConfigRef.current);

        // Add local tracks to the connection
        localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current);
        });

        // Negotiation needed handler - browser handles generating/sending offers automatically
        pc.onnegotiationneeded = async () => {
            // Only the initiator starts the negotiation to prevent glare
            if (!isInitiator) return;
            try {
                console.log(`Negotiating connection with ${remoteSocketId}...`);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                socket.emit(ACTIONS.VIDEO_CALL_OFFER, {
                    signal: pc.localDescription,
                    targetSocketId: remoteSocketId,
                });
            } catch (err) {
                console.error('Error creating offer during negotiation:', err);
            }
        };

        // Handle ICE candidates — send them to the remote peer via the server
        pc.onicecandidate = (event) => {
            if (event.candidate && socket?.connected) {
                socket.emit(ACTIONS.ICE_CANDIDATE, {
                    candidate: event.candidate,
                    targetSocketId: remoteSocketId,
                });
            }
        };

        // Handle incoming remote tracks
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (remoteStream) {
                setPeerStreams((prev) => ({
                    ...prev,
                    [remoteSocketId]: remoteStream,
                }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`ICE [${remoteSocketId.slice(0, 8)}]: ${state}`);

            if (state === 'failed') {
                console.warn(`ICE failed for ${remoteSocketId}, attempting ICE restart…`);
                pc.restartIce();
                // To avoid glare (both sides offering at the same time),
                // the peer with the lexicographically smaller socket ID sends the restart offer
                if (socket.id < remoteSocketId) {
                    console.log(`Initiating glare-safe ICE restart offer to ${remoteSocketId}`);
                    // Trigger renegotiation offer
                    pc.onnegotiationneeded();
                }
            }
        };

        peersRef.current[remoteSocketId] = pc;

        if (remoteUsername) {
            setPeerUsernames((prev) => ({
                ...prev,
                [remoteSocketId]: remoteUsername,
            }));
        }

        return pc;
    }, [socket]);

    // Flush buffered ICE candidates once remote description is set
    const flushIceCandidateBuffer = useCallback(async (socketId) => {
        const pc = peersRef.current[socketId];
        const buffer = iceCandidateBufferRef.current[socketId];
        if (!pc || !buffer || buffer.length === 0) return;

        for (const candidate of buffer) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('Failed to add buffered ICE candidate:', err);
            }
        }
        iceCandidateBufferRef.current[socketId] = [];
    }, []);

    const startCall = useCallback(async () => {
        try {
            if (!socket?.connected) {
                throw new Error('Socket is not connected yet. Try again in a moment.');
            }

            if (localStreamRef.current) {
                if (!hasJoinedCallRef.current) {
                    socket.emit('user_joined_call', { roomId, username });
                    hasJoinedCallRef.current = true;
                }
                return;
            }

            // Fetch fresh TURN credentials before starting the call
            const iceServers = await fetchIceServers();

            iceConfigRef.current = {
                iceServers,
                iceTransportPolicy: 'all', // Use default 'all' policy for maximum compatibility
            };

            const stream = await getPreferredMediaStream();
            setLocalStream(stream);
            localStreamRef.current = stream;
            setIsMuted(stream.getAudioTracks().every((track) => !track.enabled));
            setIsCameraOff(stream.getVideoTracks().every((track) => !track.enabled));
            setIsVideoCallActive(true);
            setCallError('');

            socket.emit('user_joined_call', { roomId, username });
            hasJoinedCallRef.current = true;
        } catch (err) {
            console.error('Error accessing media devices.', err);
            setCallError(err.message || 'Could not access camera or microphone.');
            stopLocalStream();
            cleanupAllPeers();
            hasJoinedCallRef.current = false;
            setIsVideoCallActive(false);
        }
    }, [socket, roomId, username, stopLocalStream, cleanupAllPeers]);

    const endCall = useCallback(() => {
        if (socket?.connected && hasJoinedCallRef.current) {
            socket.emit(ACTIONS.VIDEO_CALL_END, { roomId });
        }

        stopLocalStream();
        setIsVideoCallActive(false);
        setIsMuted(false);
        setIsCameraOff(false);
        setCallError('');
        hasJoinedCallRef.current = false;
        cleanupAllPeers();
    }, [socket, roomId, stopLocalStream, cleanupAllPeers]);

    const toggleMic = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    }, []);

    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOff(!videoTrack.enabled);
            }
        }
    }, []);

    // Socket event handlers
    useEffect(() => {
        if (!socket) return;

        const handleCallParticipants = ({ participants = [] }) => {
            if (!localStreamRef.current) return;
            // Initiate peer connections to all existing participants (we are the initiator)
            participants.forEach(({ socketId, username: peerUsername }) => {
                createPeerConnection(socketId, peerUsername, true);
            });
        };

        const handleUserJoinedCall = ({ socketId, username: peerUsername }) => {
            if (!localStreamRef.current) return;
            if (peerUsername) {
                setPeerUsernames((prev) => ({
                    ...prev,
                    [socketId]: peerUsername,
                }));
            }
        };

        const handleCallOffer = async ({ signal, callerSocketId }) => {
            if (!localStreamRef.current) return;

            // We are NOT the initiator of this connection
            const pc = createPeerConnection(callerSocketId, null, false);
            if (!pc) return;

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                await flushIceCandidateBuffer(callerSocketId);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit(ACTIONS.VIDEO_CALL_ANSWER, {
                    signal: pc.localDescription,
                    targetSocketId: callerSocketId,
                });
            } catch (err) {
                console.error('Error handling offer:', err);
                cleanupPeer(callerSocketId);
            }
        };

        const handleCallAnswer = async ({ signal, answererSocketId }) => {
            const pc = peersRef.current[answererSocketId];
            if (!pc) return;

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                await flushIceCandidateBuffer(answererSocketId);
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        };

        const handleIceCandidate = async ({ candidate, senderSocketId }) => {
            const pc = peersRef.current[senderSocketId];

            if (!pc || !pc.remoteDescription) {
                if (!iceCandidateBufferRef.current[senderSocketId]) {
                    iceCandidateBufferRef.current[senderSocketId] = [];
                }
                iceCandidateBufferRef.current[senderSocketId].push(candidate);
                return;
            }

            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('Failed to add ICE candidate:', err);
            }
        };

        const handleCallEnd = ({ socketId }) => {
            cleanupPeer(socketId);
        };

        const handleDisconnect = ({ socketId }) => {
            cleanupPeer(socketId);
        };

        const handleCallRoomInfo = (info) => {
            setCallRoomInfo(info);
        };

        socket.on(ACTIONS.VIDEO_CALL_PARTICIPANTS, handleCallParticipants);
        socket.on('user_joined_call', handleUserJoinedCall);
        socket.on(ACTIONS.VIDEO_CALL_OFFER, handleCallOffer);
        socket.on(ACTIONS.VIDEO_CALL_ANSWER, handleCallAnswer);
        socket.on(ACTIONS.ICE_CANDIDATE, handleIceCandidate);
        socket.on(ACTIONS.VIDEO_CALL_END, handleCallEnd);
        socket.on(ACTIONS.DISCONNECTED, handleDisconnect);
        socket.on(ACTIONS.VIDEO_CALL_ROOM_INFO, handleCallRoomInfo);

        if (socket.connected && roomId) {
            socket.emit(ACTIONS.GET_VIDEO_CALL_ROOM_INFO, { roomId });
        }

        return () => {
            socket.off(ACTIONS.VIDEO_CALL_PARTICIPANTS, handleCallParticipants);
            socket.off('user_joined_call', handleUserJoinedCall);
            socket.off(ACTIONS.VIDEO_CALL_OFFER, handleCallOffer);
            socket.off(ACTIONS.VIDEO_CALL_ANSWER, handleCallAnswer);
            socket.off(ACTIONS.ICE_CANDIDATE, handleIceCandidate);
            socket.off(ACTIONS.VIDEO_CALL_END, handleCallEnd);
            socket.off(ACTIONS.DISCONNECTED, handleDisconnect);
            socket.off(ACTIONS.VIDEO_CALL_ROOM_INFO, handleCallRoomInfo);
        };
    }, [socket, roomId, createPeerConnection, cleanupPeer, flushIceCandidateBuffer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (socket?.connected && hasJoinedCallRef.current) {
                socket.emit(ACTIONS.VIDEO_CALL_END, { roomId });
            }
            stopLocalStream();
            cleanupAllPeers();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, roomId]);

    return {
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
    };
};
