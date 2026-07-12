import { useState, useEffect, useRef, useCallback } from 'react';
import ACTIONS from '../Actions';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

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
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [callError, setCallError] = useState('');
    const [callRoomInfo, setCallRoomInfo] = useState({ isActive: false, participants: [] });

    const peersRef = useRef({});
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const hasJoinedCallRef = useRef(false);
    const iceCandidateBufferRef = useRef({});

    const stopLocalStream = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        localStreamRef.current = null;
        setLocalStream(null);
    }, []);

    const stopScreenStream = useCallback(() => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        screenStreamRef.current = null;
        setIsScreenSharing(false);
    }, []);

    const cleanupPeer = useCallback((socketId) => {
        const pc = peersRef.current[socketId];
        if (pc) {
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
    const createPeerConnection = useCallback((remoteSocketId, remoteUsername) => {
        if (!remoteSocketId || remoteSocketId === socket?.id || !localStreamRef.current) {
            return null;
        }

        // If we already have a connection to this peer, return it
        if (peersRef.current[remoteSocketId]) {
            return peersRef.current[remoteSocketId];
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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
                setPeerStreams((prev) => ({
                    ...prev,
                    [remoteSocketId]: remoteStream,
                }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                console.warn(`ICE connection to ${remoteSocketId} ${pc.iceConnectionState}`);
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

    // Create offer and send to a specific remote peer (we are the initiator)
    const createOfferTo = useCallback(async (remoteSocketId, remoteUsername) => {
        const pc = createPeerConnection(remoteSocketId, remoteUsername);
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
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
        stopScreenStream();
        setIsVideoCallActive(false);
        setIsMuted(false);
        setIsCameraOff(false);
        setCallError('');
        hasJoinedCallRef.current = false;
        cleanupAllPeers();
    }, [socket, roomId, stopLocalStream, stopScreenStream, cleanupAllPeers]);

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

    const toggleScreenShare = useCallback(async () => {
        if (isScreenSharing) {
            // Stop screen sharing — revert to camera
            stopScreenStream();
            const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
            if (cameraTrack) {
                Object.values(peersRef.current).forEach((pc) => {
                    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(cameraTrack);
                });
            }
            return;
        }

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            screenStreamRef.current = screenStream;
            setIsScreenSharing(true);

            const screenTrack = screenStream.getVideoTracks()[0];

            // Replace camera track with screen track in all peer connections
            Object.values(peersRef.current).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });

            // When user stops sharing via browser UI
            screenTrack.onended = () => {
                stopScreenStream();
                const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
                if (cameraTrack) {
                    Object.values(peersRef.current).forEach((pc) => {
                        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(cameraTrack);
                    });
                }
            };
        } catch (err) {
            console.error('Screen share failed:', err);
            if (err.name !== 'NotAllowedError') {
                setCallError('Could not start screen sharing.');
            }
        }
    }, [isScreenSharing, stopScreenStream]);

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
            stopScreenStream();
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
        isScreenSharing,
        callError,
        callRoomInfo,
        startCall,
        endCall,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
    };
};
