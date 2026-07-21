import { useState, useEffect, useRef, useCallback } from 'react';
import ACTIONS from '../Actions';
import { BACKEND_URL } from '../config';

// Fallback STUN-only config (used if server doesn't return TURN credentials)
const FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds to establish connection
const MAX_RECONNECT_ATTEMPTS = 3;

// Fetch TURN credentials from our server (with retry)
async function fetchIceServers() {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(`${BACKEND_URL}/api/turn-credentials`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                if (data.iceServers && data.iceServers.length > 2) {
                    // More than just STUN = we have TURN servers
                    console.log(`Fetched ${data.iceServers.length} ICE servers (including TURN)`);
                    return data.iceServers;
                }
            }
        } catch (err) {
            console.warn(`TURN fetch attempt ${attempt + 1} failed:`, err.message);
        }
        // Small delay before retry
        if (attempt < 1) await new Promise((r) => setTimeout(r, 1000));
    }
    console.warn('Using STUN-only fallback (no TURN servers available)');
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
    const iceServersRef = useRef(FALLBACK_ICE_SERVERS);
    const reconnectAttemptsRef = useRef({});
    const connectionTimersRef = useRef({});

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        localStreamRef.current = null;
        setLocalStream(null);
    }, []);

    const clearConnectionTimer = useCallback((socketId) => {
        if (connectionTimersRef.current[socketId]) {
            clearTimeout(connectionTimersRef.current[socketId]);
            delete connectionTimersRef.current[socketId];
        }
    }, []);

    const cleanupPeer = useCallback((socketId) => {
        clearConnectionTimer(socketId);
        const pc = peersRef.current[socketId];
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.oniceconnectionstatechange = null;
            pc.close();
            delete peersRef.current[socketId];
        }
        delete iceCandidateBufferRef.current[socketId];
        delete reconnectAttemptsRef.current[socketId];

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
    }, [clearConnectionTimer]);

    const cleanupAllPeers = useCallback(() => {
        Object.keys(peersRef.current).forEach((socketId) => cleanupPeer(socketId));
        Object.keys(connectionTimersRef.current).forEach((id) => clearTimeout(connectionTimersRef.current[id]));
        peersRef.current = {};
        iceCandidateBufferRef.current = {};
        reconnectAttemptsRef.current = {};
        connectionTimersRef.current = {};
        setPeerStreams({});
        setPeerUsernames({});
    }, [cleanupPeer]);

    // Full reconnect: tear down old connection and create fresh offer
    const reconnectToPeer = useCallback((remoteSocketId) => {
        const attempts = reconnectAttemptsRef.current[remoteSocketId] || 0;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${remoteSocketId}`);
            return;
        }
        if (!localStreamRef.current || !socket?.connected) return;

        reconnectAttemptsRef.current[remoteSocketId] = attempts + 1;
        console.log(`Reconnecting to ${remoteSocketId} (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

        // Clean up old connection (but keep username)
        clearConnectionTimer(remoteSocketId);
        const pc = peersRef.current[remoteSocketId];
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.oniceconnectionstatechange = null;
            pc.close();
            delete peersRef.current[remoteSocketId];
        }
        delete iceCandidateBufferRef.current[remoteSocketId];

        // Small delay before reconnecting
        setTimeout(() => {
            if (!localStreamRef.current || !socket?.connected) return;
            // eslint-disable-next-line no-use-before-define
            createOfferTo(remoteSocketId);
        }, 1000 + attempts * 500);
    }, [socket, clearConnectionTimer]);

    // Create an RTCPeerConnection to a remote peer
    const createPeerConnection = useCallback((remoteSocketId, remoteUsername) => {
        if (!remoteSocketId || remoteSocketId === socket?.id || !localStreamRef.current) {
            return null;
        }

        // If we already have a HEALTHY connection to this peer, return it
        if (peersRef.current[remoteSocketId]) {
            const existing = peersRef.current[remoteSocketId];
            if (existing.connectionState !== 'failed' && existing.connectionState !== 'closed') {
                return existing;
            }
            // Connection is dead, clean it up
            existing.onicecandidate = null;
            existing.ontrack = null;
            existing.oniceconnectionstatechange = null;
            existing.close();
            delete peersRef.current[remoteSocketId];
        }

        const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

        // Add our local tracks to the connection
        localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current);
        });

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
                // Connection succeeded — reset reconnect counter
                reconnectAttemptsRef.current[remoteSocketId] = 0;
                clearConnectionTimer(remoteSocketId);

                setPeerStreams((prev) => ({
                    ...prev,
                    [remoteSocketId]: remoteStream,
                }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`ICE connection to ${remoteSocketId}: ${state}`);

            if (state === 'connected' || state === 'completed') {
                // Connection is healthy — clear any pending timers
                clearConnectionTimer(remoteSocketId);
                reconnectAttemptsRef.current[remoteSocketId] = 0;
            } else if (state === 'failed') {
                // ICE failed — do a full reconnection (not just restartIce)
                console.warn(`ICE failed for ${remoteSocketId}, attempting full reconnect…`);
                reconnectToPeer(remoteSocketId);
            } else if (state === 'disconnected') {
                // Disconnected is temporary — wait 5s, then reconnect if still disconnected
                setTimeout(() => {
                    if (peersRef.current[remoteSocketId]?.iceConnectionState === 'disconnected') {
                        console.warn(`ICE still disconnected for ${remoteSocketId}, reconnecting…`);
                        reconnectToPeer(remoteSocketId);
                    }
                }, 5000);
            }
        };

        peersRef.current[remoteSocketId] = pc;

        if (remoteUsername) {
            setPeerUsernames((prev) => ({
                ...prev,
                [remoteSocketId]: remoteUsername,
            }));
        }

        // Set a connection timeout — if no track received in 15s, reconnect
        clearConnectionTimer(remoteSocketId);
        connectionTimersRef.current[remoteSocketId] = setTimeout(() => {
            const currentPc = peersRef.current[remoteSocketId];
            if (currentPc && currentPc.iceConnectionState !== 'connected' && currentPc.iceConnectionState !== 'completed') {
                console.warn(`Connection timeout for ${remoteSocketId}, attempting reconnect…`);
                reconnectToPeer(remoteSocketId);
            }
        }, CONNECTION_TIMEOUT_MS);

        return pc;
    }, [socket, clearConnectionTimer, reconnectToPeer]);

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

    // Create offer and send to a specific remote peer (we are the initiator)
    const createOfferTo = useCallback(async (remoteSocketId, remoteUsername) => {
        const pc = createPeerConnection(remoteSocketId, remoteUsername);
        if (!pc) return;

        try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);

            socket.emit(ACTIONS.VIDEO_CALL_OFFER, {
                signal: pc.localDescription,
                targetSocketId: remoteSocketId,
            });
        } catch (err) {
            console.error('Error creating offer:', err);
            cleanupPeer(remoteSocketId);
        }
    }, [socket, createPeerConnection, cleanupPeer]);

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
            iceServersRef.current = await fetchIceServers();

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

        // When the server tells us about existing call participants (we just joined)
        // We are the OFFERER to all existing participants
        const handleCallParticipants = ({ participants = [] }) => {
            if (!localStreamRef.current) return;

            participants.forEach(({ socketId, username: peerUsername }) => {
                createOfferTo(socketId, peerUsername);
            });
        };

        // When a new user joins the call (we are already in) — we just wait, THEY will offer to US
        const handleUserJoinedCall = ({ socketId, username: peerUsername }) => {
            if (!localStreamRef.current) return;
            // Store username for when the offer arrives
            if (peerUsername) {
                setPeerUsernames((prev) => ({
                    ...prev,
                    [socketId]: peerUsername,
                }));
            }
        };

        // Incoming WebRTC offer — create answer
        const handleCallOffer = async ({ signal, callerSocketId }) => {
            if (!localStreamRef.current) return;

            // If we already have a connection from a previous failed attempt, clean it up
            if (peersRef.current[callerSocketId]) {
                const oldPc = peersRef.current[callerSocketId];
                oldPc.onicecandidate = null;
                oldPc.ontrack = null;
                oldPc.oniceconnectionstatechange = null;
                oldPc.close();
                delete peersRef.current[callerSocketId];
                delete iceCandidateBufferRef.current[callerSocketId];
            }

            const pc = createPeerConnection(callerSocketId);
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

        // Incoming WebRTC answer — set remote description
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

        // Incoming ICE candidate
        const handleIceCandidate = async ({ candidate, senderSocketId }) => {
            const pc = peersRef.current[senderSocketId];

            if (!pc || !pc.remoteDescription) {
                // Buffer the candidate until we have a remote description
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

        // A peer left the call
        const handleCallEnd = ({ socketId }) => {
            cleanupPeer(socketId);
        };

        // A peer disconnected from the room entirely
        const handleDisconnect = ({ socketId }) => {
            cleanupPeer(socketId);
        };

        // Call room info update (for all room members, even those not in the call)
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
    }, [socket, roomId, createPeerConnection, createOfferTo, cleanupPeer, flushIceCandidateBuffer]);

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
