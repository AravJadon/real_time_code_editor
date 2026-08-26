# useWebRTC.js — Complete Beginner Explanation

## 📞 First, What Problem Does This File Solve?

Imagine you and your friend are in different cities. You want to **video call** each other. But there's a problem:
- You don't know your friend's exact "address" on the internet.
- Your friend doesn't know yours either.
- Both of you are behind "walls" (firewalls/routers) that hide your real address.

**WebRTC** is the technology that lets two browsers talk directly to each other (video + audio), **without sending data through any server**.

But to START that direct connection, they need a **middleman** to introduce them first. That middleman is your **Socket.io server**.

> **Real-life analogy**: Think of it like an arranged marriage. The families (browsers) don't know each other. A matchmaker (Socket.io server) introduces them. Once they meet and exchange phone numbers (ICE candidates), they talk directly — the matchmaker is no longer needed.

---

## 🧱 The Building Blocks You Need to Know First

### What is a "Stream"?
A stream is **live video + audio data flowing from your camera and microphone**. Think of it like water flowing from a tap — it's continuous, real-time data.

```
Your Webcam 🎥 ──► MediaStream (video track + audio track)
```

A `MediaStream` has **tracks** inside it:
- **Video Track** = your camera feed
- **Audio Track** = your microphone feed

### What is a "Track"?
A track is **one channel** of media. A stream has multiple tracks:
```
MediaStream
  ├── Video Track (camera)
  └── Audio Track (microphone)
```

You can **enable/disable** individual tracks. That's how mute and camera off work — you don't disconnect the call, you just disable that one track.

### What is `RTCPeerConnection`?
This is the **magic pipe** that connects two browsers directly. Once set up, video and audio flow through it without going through any server.

```
Browser A ◄════ RTCPeerConnection (direct pipe) ════► Browser B
```

### What is SDP (Session Description Protocol)?
Before connecting, browsers need to tell each other:
- "I can send video in H.264 format"
- "I can send audio in Opus format"
- "My screen resolution is 1280x720"

This information is packed into an **SDP object**. There are two types:
- **Offer**: "Here's what I can do. Can you connect with me?"
- **Answer**: "Yes, I can! Here's what I can do too."

### What is ICE Candidate?
ICE = **Interactive Connectivity Establishment**

Your computer might have multiple ways to be reached:
- Local IP: `192.168.1.5:3000`
- Public IP (via router): `203.0.113.45:54321`
- TURN relay: `turn-server.example.com:443`

Each possible path is called an **ICE Candidate**. The browser discovers these one by one and sends them to the other peer. WebRTC tries all paths and picks the fastest one that works.

### What is STUN Server?
Your computer doesn't know its own **public IP address** (the address other people on the internet see). 

A STUN server is like looking in a mirror — you ask it "What's my public IP?" and it tells you.

```
Your Browser ──► "What's my public IP?" ──► STUN Server
Your Browser ◄── "Your public IP is 203.0.113.45:54321" ◄── STUN Server
```

### What is TURN Server?
Sometimes, even after knowing each other's public IPs, two browsers **still can't connect directly** (strict firewalls, symmetric NATs in offices/colleges).

A TURN server is a **relay** — it sits in the middle and forwards all video/audio between the two peers. It's slower (because data goes through a server) but it **always works**.

```
Without TURN (direct):  Browser A ◄════════► Browser B
With TURN (relay):       Browser A ◄──► TURN Server ◄──► Browser B
```

### What is NAT?
Your home has one public IP address shared by all your devices (phone, laptop, tablet). NAT is the router's trick that lets all devices share one IP.

Problem: Because of NAT, other people on the internet can't directly reach your laptop. They only see your router's public IP, not your laptop's private IP.

---

## 📂 Now Let's Go Through The Code — Section by Section

---

### Section 1: STUN/TURN Server Configuration (Lines 1–50)

```javascript
const FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];
```

**Simple English**: "If we can't get TURN servers from our backend, at least use Google's free STUN servers so the browser can discover its public IP."

```javascript
async function fetchIceServers() {
    const response = await fetch(`${BACKEND_URL}/api/turn-credentials`);
    // ... if successful, return TURN servers
    // ... if failed, return FALLBACK_ICE_SERVERS (STUN only)
}
```

**Simple English**: "Ask our backend server: Do you have any TURN server credentials? If yes, use them. If the backend is down or doesn't have TURN, fall back to Google STUN."

---

### Section 2: Getting Camera & Microphone Permission (Lines 52–70)

```javascript
function getPreferredMediaStream() {
    return navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })    // Try: Camera + Mic
        .catch(async () => {
            return navigator.mediaDevices
                .getUserMedia({ video: true, audio: false })  // Fallback: Camera only
                .catch(async () => {
                    return navigator.mediaDevices
                        .getUserMedia({ video: false, audio: true }); // Fallback: Mic only
                });
        });
}
```

**Simple English**: 
1. First try: "Browser, give me camera AND microphone"
2. If that fails (maybe user denied mic): "OK, just give me camera"
3. If that also fails (maybe no camera): "OK, just give me microphone"
4. If everything fails: throw error

> **Real-life analogy**: Like ordering food — "I want pizza AND coke." "No coke? OK, just pizza." "No pizza? OK, just coke." "Nothing available? Error!"

---

### Section 3: The Hook's State Variables (Lines 72–86)

```javascript
export const useWebRTC = (socket, roomId, username) => {
    // These cause UI re-renders when changed:
    const [localStream, setLocalStream] = useState(null);      // Your camera/mic stream
    const [peerStreams, setPeerStreams] = useState({});          // Other people's streams
    const [peerUsernames, setPeerUsernames] = useState({});     // Other people's names
    const [isMuted, setIsMuted] = useState(false);             // Is YOUR mic muted?
    const [isCameraOff, setIsCameraOff] = useState(false);     // Is YOUR camera off?
    const [isVideoCallActive, setIsVideoCallActive] = useState(false); // Are you in a call?
    const [callError, setCallError] = useState('');            // Any error message
    const [callRoomInfo, setCallRoomInfo] = useState(...);     // Info about ongoing call in room
```

**Simple English**: These are all the pieces of information the video call UI needs:
- Your own video stream
- Everyone else's video streams
- Everyone's display names
- Whether your mic/camera is on or off
- Whether there's an error

```javascript
    // These do NOT cause re-renders (used internally):
    const peersRef = useRef({});              // Map of RTCPeerConnection objects
    const localStreamRef = useRef(null);       // Same as localStream but doesn't trigger re-render
    const hasJoinedCallRef = useRef(false);    // Have we already joined the call?
    const iceCandidateBufferRef = useRef({});  // Temporary storage for early ICE candidates
    const iceConfigRef = useRef({...});        // STUN/TURN server config
```

**Why `useRef` instead of `useState`?**
- `RTCPeerConnection` is a heavy native browser object. We don't want React to re-render the entire UI every time its internal state changes.
- `useRef` stores things **silently** — no re-render when `.current` changes.

---

### Section 4: Cleanup Functions (Lines 88–128)

#### `stopLocalStream` — Turn off your own camera/mic
```javascript
const stopLocalStream = useCallback(() => {
    localStreamRef.current.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
}, []);
```

**Simple English**: "Go through every track (camera, mic) and call `.stop()` on it. This physically turns off the camera LED light and releases the microphone."

#### `cleanupPeer` — Disconnect from ONE specific person
```javascript
const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current[socketId];
    if (pc) {
        pc.onicecandidate = null;    // Stop listening for new ICE candidates
        pc.ontrack = null;           // Stop listening for incoming video/audio
        pc.oniceconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();                  // Close the direct connection pipe
        delete peersRef.current[socketId];  // Remove from our map
    }
    // Also remove their stream and username from React state
    setPeerStreams((prev) => { /* remove socketId from object */ });
    setPeerUsernames((prev) => { /* remove socketId from object */ });
}, []);
```

**Simple English**: "Cut the pipe to one specific person. Remove all their event listeners, close the connection, and delete their video from the UI."

> **Why set event handlers to `null` before closing?** To prevent any last-second events from firing during shutdown (which could cause errors on unmounted components).

#### `cleanupAllPeers` — Disconnect from EVERYONE
```javascript
const cleanupAllPeers = useCallback(() => {
    Object.keys(peersRef.current).forEach((socketId) => cleanupPeer(socketId));
    // Reset everything to empty
}, [cleanupPeer]);
```

---

### Section 5: Creating a Peer Connection (Lines 130–230)

This is the **most important function** in the entire file. It creates the direct video/audio pipe between you and ONE other person.

```javascript
const createPeerConnection = useCallback((remoteSocketId, remoteUsername, isInitiator) => {
```

**Parameters**:
- `remoteSocketId`: The socket ID of the person you want to connect to
- `remoteUsername`: Their display name (e.g., "Rahul")
- `isInitiator`: Are YOU the one starting this connection? (`true` = you send the Offer, `false` = you wait for their Offer)

#### Step 1: Safety checks
```javascript
if (!remoteSocketId || remoteSocketId === socket?.id || !localStreamRef.current) {
    return null;
}
```
- Don't connect to yourself
- Don't connect if your own camera isn't ready yet

#### Step 2: Clean up any old connection to this person
```javascript
if (peersRef.current[remoteSocketId]) {
    // Close old connection first
}
```
- If you already had a connection to this person (maybe from a previous attempt), clean it up first to avoid conflicts.

#### Step 3: Create the pipe
```javascript
const pc = new RTCPeerConnection(iceConfigRef.current);
```
- This creates a new empty pipe. The `iceConfigRef.current` tells it which STUN/TURN servers to use for discovering network paths.

#### Step 4: Put your video/audio into the pipe
```javascript
localStreamRef.current.getTracks().forEach((track) => {
    pc.addTrack(track, localStreamRef.current);
});
```
- Take each track (camera, microphone) from your local stream and push it into the pipe so the other person can receive it.

> **Analogy**: You're putting your voice and face into a telephone line.

#### Step 5: `onnegotiationneeded` — Create & Send the Offer
```javascript
pc.onnegotiationneeded = async () => {
    if (!isInitiator) return;  // Only caller creates the offer!
    
    const offer = await pc.createOffer();       // "Here's what I can send"
    await pc.setLocalDescription(offer);         // Save it locally
    
    socket.emit(ACTIONS.VIDEO_CALL_OFFER, {      // Send it via Socket.io
        signal: pc.localDescription,
        targetSocketId: remoteSocketId,
    });
};
```

**Simple English**: 
- The browser automatically fires `onnegotiationneeded` when tracks are added.
- Only the **initiator** creates an Offer (to prevent both sides offering simultaneously — that's called "glare").
- The Offer is sent to the other person through Socket.io (because we can't send it directly yet — the pipe isn't connected!).

#### Step 6: `onicecandidate` — Share network paths
```javascript
pc.onicecandidate = (event) => {
    if (event.candidate && socket?.connected) {
        socket.emit(ACTIONS.ICE_CANDIDATE, {
            candidate: event.candidate,
            targetSocketId: remoteSocketId,
        });
    }
};
```

**Simple English**: 
- The browser discovers possible network paths to reach you (local IP, public IP, TURN relay).
- Each time it finds one, it fires `onicecandidate`.
- We forward each candidate to the other person via Socket.io.

> **Analogy**: "Here are all the ways you can reach my house — my home address, my office address, and through a post office relay."

#### Step 7: `ontrack` — Receive the other person's video/audio
```javascript
pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (remoteStream) {
        setPeerStreams((prev) => ({
            ...prev,
            [remoteSocketId]: remoteStream,
        }));
    }
};
```

**Simple English**: 
- When the pipe successfully connects, the other person's video/audio arrives here.
- We save it in React state (`peerStreams`) so the `<VideoCall>` component can display it.

#### Step 8: `oniceconnectionstatechange` — Monitor connection health
```javascript
pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    // States: "new" → "checking" → "connected" → "completed"
    //                                          or → "failed" / "disconnected"
    
    if (state === 'failed') {
        pc.restartIce();  // Try to reconnect!
        
        // To prevent both sides sending offers simultaneously,
        // only the peer with the smaller socket ID sends the restart offer
        if (socket.id < remoteSocketId) {
            pc.onnegotiationneeded();
        }
    }
};
```

**Simple English**: 
- WebRTC connections can break (Wi-Fi switch, network change).
- If it fails, we try to restart.
- To prevent "glare" (both sides trying to restart at once), we use a simple rule: the peer with the alphabetically smaller socket ID gets to restart.

---

### Section 6: ICE Candidate Buffering (Lines 232–248)

```javascript
const flushIceCandidateBuffer = useCallback(async (socketId) => {
    const buffer = iceCandidateBufferRef.current[socketId];
    if (!buffer || buffer.length === 0) return;
    
    for (const candidate of buffer) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    iceCandidateBufferRef.current[socketId] = [];  // Clear buffer
}, []);
```

**The Problem This Solves (Race Condition)**:

Imagine this timeline:
```
Time 1: Socket delivers ICE Candidate from Peer B
Time 2: We haven't finished setRemoteDescription() yet!
Time 3: Calling addIceCandidate() NOW would CRASH! ❌
```

**The Solution**:
```
Time 1: ICE Candidate arrives → remoteDescription not set yet → SAVE in buffer
Time 2: setRemoteDescription() completes ✅
Time 3: Call flushIceCandidateBuffer() → apply all saved candidates safely ✅
```

> **Analogy**: Imagine you're receiving mail (ICE candidates) but your mailbox (remoteDescription) isn't built yet. You temporarily store the letters in a bag (buffer). Once the mailbox is ready, you put all the letters in.

---

### Section 7: `startCall` — Starting a Video Call (Lines 250–295)

```javascript
const startCall = useCallback(async () => {
    // 1. Check socket is connected
    if (!socket?.connected) throw new Error('Socket not connected');
    
    // 2. If camera already running, just notify server
    if (localStreamRef.current) {
        socket.emit('user_joined_call', { roomId, username });
        return;
    }
    
    // 3. Fetch TURN server credentials from backend
    const iceServers = await fetchIceServers();
    iceConfigRef.current = { iceServers, iceTransportPolicy: 'all' };
    
    // 4. Turn on camera + microphone
    const stream = await getPreferredMediaStream();
    setLocalStream(stream);
    localStreamRef.current = stream;
    
    // 5. Check initial mute/camera state
    setIsMuted(stream.getAudioTracks().every((track) => !track.enabled));
    setIsCameraOff(stream.getVideoTracks().every((track) => !track.enabled));
    
    // 6. Mark call as active
    setIsVideoCallActive(true);
    
    // 7. Tell the server "I joined the call!"
    socket.emit('user_joined_call', { roomId, username });
    hasJoinedCallRef.current = true;
}, [...]);
```

**What happens after `socket.emit('user_joined_call')`?**
The server receives this, and sends back `VIDEO_CALL_PARTICIPANTS` — a list of everyone already in the call. Then the socket event handlers (Section 9) take over and create peer connections to each person.

---

### Section 8: `endCall` & Toggle Functions (Lines 297–330)

#### `endCall`
```javascript
const endCall = useCallback(() => {
    socket.emit(ACTIONS.VIDEO_CALL_END, { roomId }); // Tell server
    stopLocalStream();         // Turn off camera/mic
    cleanupAllPeers();         // Close ALL connections
    setIsVideoCallActive(false);
    // Reset all states...
}, [...]);
```

#### `toggleMic` — Mute/Unmute without disconnecting
```javascript
const toggleMic = useCallback(() => {
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;  // Just flip the switch!
    setIsMuted(!audioTrack.enabled);
}, []);
```

**Key insight**: Muting does NOT close the connection or stop the track. It just sets `track.enabled = false`. The track still exists in the pipe, but it sends silence.

> **Analogy**: Like pressing the mute button on a phone call — the call is still connected, you just stop sending your voice.

#### `toggleCamera` — Same concept for video
```javascript
const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;  // Black screen but still connected
    setIsCameraOff(!videoTrack.enabled);
}, []);
```

---

### Section 9: Socket Event Listeners (Lines 332–443)

This is where **all the WebRTC signaling magic happens**. 

#### The Complete Call Flow (Read this carefully!):

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE COMPLETE VIDEO CALL FLOW                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  YOU click "Start Call"                                          │
│    │                                                             │
│    ▼                                                             │
│  startCall() runs → camera ON → emit 'user_joined_call'         │
│    │                                                             │
│    ▼                                                             │
│  Server sends back VIDEO_CALL_PARTICIPANTS                       │
│  (list of people already in call)                                │
│    │                                                             │
│    ▼                                                             │
│  handleCallParticipants() runs                                   │
│  → For each person: createPeerConnection(socketId, name, TRUE)   │
│    │                                                             │
│    ▼                                                             │
│  createPeerConnection creates pipe + adds your tracks            │
│  → Browser auto-fires onnegotiationneeded                        │
│  → Since isInitiator=true, creates Offer SDP                    │
│  → Emits VIDEO_CALL_OFFER via socket                            │
│    │                                                             │
│    ▼                                                             │
│  OTHER PERSON's handleCallOffer() runs                           │
│  → createPeerConnection(yourId, null, FALSE)                     │
│  → setRemoteDescription(your offer)                              │
│  → flushIceCandidateBuffer() (apply any early candidates)        │
│  → createAnswer()                                                │
│  → setLocalDescription(answer)                                   │
│  → Emits VIDEO_CALL_ANSWER via socket                           │
│    │                                                             │
│    ▼                                                             │
│  YOUR handleCallAnswer() runs                                    │
│  → setRemoteDescription(their answer)                            │
│  → flushIceCandidateBuffer()                                     │
│    │                                                             │
│    ▼                                                             │
│  MEANWHILE: Both browsers discover ICE candidates                │
│  → Each candidate sent via handleIceCandidate                    │
│  → If remoteDescription not ready yet → BUFFER IT               │
│  → If ready → addIceCandidate() immediately                     │
│    │                                                             │
│    ▼                                                             │
│  WebRTC finds the best network path                              │
│  → ICE state: "checking" → "connected" ✅                       │
│    │                                                             │
│    ▼                                                             │
│  ontrack fires on both sides                                     │
│  → Each person receives the other's video/audio stream           │
│  → setPeerStreams() updates React state                           │
│  → VideoCall.jsx renders the <video> elements                    │
│    │                                                             │
│    ▼                                                             │
│  🎉 VIDEO CALL IS LIVE! Both can see and hear each other!       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Each handler explained:

| Handler | Trigger | What It Does |
|:--------|:--------|:-------------|
| `handleCallParticipants` | You join a call that has people | Creates peer connections to ALL existing participants (you are initiator) |
| `handleUserJoinedCall` | Someone new joins YOUR call | Saves their username so their video label shows their name |
| `handleCallOffer` | Someone sends YOU an offer | Creates peer connection (not initiator), sets their offer, creates answer, sends answer back |
| `handleCallAnswer` | Someone responds to YOUR offer | Sets their answer as remote description, completing the SDP handshake |
| `handleIceCandidate` | A network path candidate arrives | Either buffers it (if not ready) or applies it immediately |
| `handleCallEnd` | Someone hangs up | Cleans up their peer connection |
| `handleDisconnect` | Someone closes browser/loses internet | Cleans up their peer connection |
| `handleCallRoomInfo` | Server sends room call status | Updates UI to show "Someone is in a call" notification |

---

### Section 10: Cleanup on Unmount (Lines 445–455)

```javascript
useEffect(() => {
    return () => {
        if (socket?.connected && hasJoinedCallRef.current) {
            socket.emit(ACTIONS.VIDEO_CALL_END, { roomId }); // Tell others you left
        }
        stopLocalStream();    // Turn off camera
        cleanupAllPeers();    // Close all connections
    };
}, [socket, roomId]);
```

**Simple English**: "When the user navigates away from the editor page (component unmounts), automatically end the call, turn off the camera, and close all connections. Don't leave zombie connections running!"

---

### Section 11: What the Hook Returns (Lines 457–472)

```javascript
return {
    localStream,        // Your video stream → for <VideoElement>
    peerStreams,         // Others' streams → for <VideoElement>
    peerUsernames,      // Others' names → for video labels
    isMuted,            // Mic state → for UI toggle button
    isCameraOff,        // Camera state → for UI toggle button
    isVideoCallActive,  // In call or not → show/hide VideoCall panel
    callError,          // Error message → show error banner
    callRoomInfo,       // Room call info → "Someone started a call" notification
    startCall,          // Function → called when user clicks "Start Call" button
    endCall,            // Function → called when user clicks "End Call" button
    toggleMic,          // Function → called when user clicks mic button
    toggleCamera,       // Function → called when user clicks camera button
};
```

**Simple English**: This hook packages everything the `EditorPage` needs — all the data for the UI and all the functions for the buttons.

---

## 🎯 One-Line Summary of Every Major Concept

| Concept | One-Line Explanation |
|:--------|:--------------------|
| **WebRTC** | Browser-to-browser direct video/audio — no server in between |
| **Signaling** | Using Socket.io to exchange connection info BEFORE direct connection |
| **SDP Offer** | "Here's what video/audio I can send, can you connect?" |
| **SDP Answer** | "Yes I can, here's what I can do too" |
| **ICE Candidate** | One possible network path (IP + port) to reach you |
| **STUN** | "Mirror, mirror, what's my public IP?" |
| **TURN** | Backup relay server when direct connection is blocked |
| **NAT** | Router trick that hides your private IP behind one public IP |
| **Glare** | Both peers sending offers at the same time (causes crash) |
| **ICE Buffering** | Saving early network candidates until the connection is ready to accept them |
| **track.enabled** | How mute/camera-off works without disconnecting |
| **Peer Mesh** | Each person connects directly to every other person (not through a central server) |
