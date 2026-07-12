# SyncCode Placement Interview Guide

Ye file tumhare project ka interview-ready explanation hai. Agar tumhe React aur JavaScript basics hi aata hai, to is file ko order me padho. Isme project ka idea, features, code flow, syntax, aur common interview answers diye gaye hain.

Project name: **SyncCode**

One-line explanation:

> SyncCode ek real-time collaborative code editor hai jisme multiple users same room me code edit kar sakte hain, files/folders manage kar sakte hain, code run kar sakte hain, AI se help le sakte hain, aur video call bhi kar sakte hain.

---

## 1. Interview Me 2-Minute Pitch

Agar interviewer bole "Tell me about your project", ye bolna:

> My project is SyncCode, a real-time collaborative code editor. Users can create or join a room using a room ID. Inside a room, multiple users can write code together in real time. I used React for frontend, Node.js and Express for backend, Socket.IO for real-time communication, MongoDB with Mongoose for storing rooms and files, Judge0 API for running code, an AI API for code explanation/review/bug fixing, and WebRTC for video calling.
>
> The backend is divided into routes, services, socket handlers, models, and utilities. Routes handle HTTP APIs, services contain business logic, socket handlers handle real-time events, and models define database structure. The main feature is real-time syncing: whenever a user types code, creates a file, changes language, or joins a call, events are sent through Socket.IO and all users in the room are updated.

Short Hindi/Hinglish version:

> Ye project ek collaborative online code editor hai. Isme room create/join hota hai, real-time code sync hota hai, files/folders bante hain, code run hota hai, AI assistant help karta hai, aur video call bhi hai. Frontend React me hai, backend Node/Express me hai, real-time ke liye Socket.IO use kiya hai, storage ke liye MongoDB hai, code execution ke liye Judge0 API hai, aur video call ke liye WebRTC hai.

---

## 2. Tech Stack

Frontend:

- React
- React Router
- CodeMirror editor
- Socket.IO client
- React Hot Toast
- CSS

Backend:

- Node.js
- Express.js
- Socket.IO
- MongoDB
- Mongoose
- Judge0 API
- AI API through Gemini OpenAI-compatible endpoint

Real-time/video:

- Socket.IO for real-time code/file/member events
- WebRTC for peer-to-peer video/audio call
- STUN servers for peer connection discovery

---

## 3. Folder Structure

Important files:

```text
real_time_code_editor/
  client/
    src/
      Pages/
        Home.jsx
        EditorPage.jsx
      components/
        Editor.jsx
        FileTree.jsx
        FileTreeItem.jsx
        AIAssistant.jsx
        VideoCall.jsx
        Client.jsx
      hooks/
        useWebRTC.js
      Actions.js
      socket.js
      config.js
      languages.js

  server/
    server.js
    db.js
    Actions.js
    languages.js
    models/
      Room.js
      File.js
    routes/
      runRoutes.js
      aiRoutes.js
    services/
      fileService.js
      judge0Service.js
      aiService.js
    socket/
      socketHandlers.js
    utils/
      loadEnv.js
```

How to explain:

> Client folder contains React UI. Server folder contains backend. Backend is separated into routes, services, socket handlers, models, and utils. This makes code easy to understand and maintain.

---

## 4. Main Features

### Feature 1: Create or Join Room

File: `client/src/Pages/Home.jsx`

What it does:

- User enters `roomId` and `username`.
- User can create a new room ID using `uuid`.
- On join, user navigates to `/editor/:roomId`.
- Username is passed using router state.

Important code idea:

```js
navigate(`/editor/${roomId}`, {
    state: { username },
});
```

Explanation:

> `navigate` React Router ka function hai. Isse user ko editor page par bhejte hain. Room ID URL me jaata hai aur username state me pass hota hai.

Interview Q:

Q: Why use UUID for room ID?

A: UUID unique room IDs generate karta hai, so two rooms accidentally same ID ke nahi bante.

---

### Feature 2: Real-Time Room Join and Member List

Files:

- `client/src/Pages/EditorPage.jsx`
- `server/socket/socketHandlers.js`
- `client/src/socket.js`

Flow:

```text
User opens editor page
  -> frontend creates socket connection
  -> frontend emits JOIN event
  -> backend adds socket to room
  -> backend sends JOINED event to all users
  -> frontend updates members list
```

Client socket connection:

```js
const socket = await initSocket();
socket.emit(ACTIONS.JOIN, { roomId, username });
```

Server handles join:

```js
socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
});
```

Explanation:

> Socket.IO gives every user a unique `socket.id`. Server stores username against socket ID. `socket.join(roomId)` puts the user into a room, so events can be sent only to users in that room.

Useful terms:

- `socket.emit`: send event from one socket
- `socket.on`: listen for event
- `io.in(roomId).emit`: send event to everyone in a room
- `socket.in(roomId).emit`: send event to everyone except current sender

---

### Feature 3: Real-Time Code Editor

Files:

- `client/src/components/Editor.jsx`
- `client/src/Pages/EditorPage.jsx`
- `server/socket/socketHandlers.js`

Library:

- CodeMirror

Flow:

```text
User types code
  -> CodeMirror change event runs
  -> frontend emits CODE_CHANGE with fileId and code
  -> server sends CODE_CHANGE to other users in same room
  -> other users update editor
  -> server also saves code in MongoDB
```

Client emits code:

```js
socketRef.current.emit(ACTIONS.CODE_CHANGE, {
    roomId,
    fileId: activeFileIdRef.current,
    code,
});
```

Server receives and broadcasts:

```js
socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, fileId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { fileId, code });
    await fileService.updateFileCode(fileId, code);
});
```

Why `socket.in(roomId)`?

> Sender ke editor me code already typed hai, so sender ko wapas same code bhejne ki zaroorat nahi. Sirf other users ko send karte hain.

Why `useRef` in Editor?

```js
const editorRef = useRef(null);
const socketRef = useRef(socket);
```

Explanation:

> `useRef` ek value ko store karta hai jo render ke beech me preserve hoti hai, but update hone par component re-render nahi karti. CodeMirror editor object, socket object, and current file ID ke liye useRef useful hai.

---

### Feature 4: File and Folder System

Files:

- `client/src/components/FileTree.jsx`
- `client/src/components/FileTreeItem.jsx`
- `server/services/fileService.js`
- `server/models/File.js`

Important point:

> Ye project actual Windows folders/files create nahi karta. Ye virtual files/folders MongoDB me store karta hai.

File model:

```js
{
    roomId,
    name,
    type: 'file' or 'folder',
    parentId,
    code,
    language
}
```

How folders work:

- Root file/folder has `parentId: null`
- Folder ke andar file ka `parentId` folder ki `_id` hoti hai

Example:

```text
src folder:
  _id = 123
  parentId = null

app.js file inside src:
  parentId = 123
```

Tree building in frontend:

```js
const buildTree = (parentId) => {
    return files
        .filter((f) => f.parentId === parentId)
        .map((f) => ({
            ...f,
            children: f.type === 'folder' ? buildTree(f._id) : [],
        }));
};
```

Explanation:

> This is recursion. Function root files find karta hai, then folder ke children find karta hai, then children ke children find karta hai.

File create flow:

```text
User clicks New File
  -> prompt asks file name
  -> frontend emits FILE_CREATE
  -> server creates file in DB
  -> server emits FILE_CREATE to all users
  -> all users update file tree
```

Why recursive delete?

> Agar folder delete hota hai, uske andar ke saare files/folders bhi delete hone chahiye. Isliye server descendants collect karta hai and recursively delete karta hai.

---

### Feature 5: Language Selection

Files:

- `client/src/languages.js`
- `server/languages.js`
- `client/src/Pages/EditorPage.jsx`

What it does:

- User can choose JavaScript, Python, C++, Java, etc.
- File ke language field me save hota hai.
- CodeMirror editor mode changes.
- Code run API Judge0 language ID use karta hai.

Flow:

```text
User selects language
  -> frontend updates state
  -> frontend emits LANGUAGE_CHANGE
  -> server saves language
  -> other users receive language change
```

Interview answer:

> Language is stored per file, so different files can have different languages.

---

### Feature 6: Code Execution

Files:

- `client/src/Pages/EditorPage.jsx`
- `server/routes/runRoutes.js`
- `server/services/judge0Service.js`
- `server/languages.js`

API:

```text
POST /api/run
```

Flow:

```text
User clicks Run
  -> frontend sends code, language, stdin to backend
  -> backend validates input
  -> backend sends code to Judge0 API
  -> Judge0 returns token
  -> backend polls result using token
  -> backend sends output/error to frontend
  -> frontend shows result in output panel
```

Frontend fetch:

```js
const response = await fetch(`${BACKEND_URL}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language, stdin }),
});
```

Why base64?

> Code can contain quotes, new lines, special characters. Base64 encoding makes it safer to send to Judge0 API.

Why polling?

> Judge0 first gives a token. Code execution takes time, so backend repeatedly checks the result until execution is complete.

Interview Q:

Q: What happens if code has error?

A: Judge0 returns compile output or stderr. Backend combines those errors and frontend displays them in output panel.

---

### Feature 7: AI Assistant

Files:

- `client/src/components/AIAssistant.jsx`
- `client/src/components/Editor.jsx`
- `server/routes/aiRoutes.js`
- `server/services/aiService.js`

Features:

- Explain code
- Review code
- Find bugs
- Suggest completion
- Chat about code

Flow:

```text
User chooses AI action
  -> frontend sends action, code, language, prompt to /api/ai
  -> backend builds messages
  -> backend calls AI API
  -> AI response comes back
  -> frontend renders markdown/code blocks
```

Backend idea:

```js
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
];
```

Explanation:

> AI APIs usually work with messages. System message tells AI its role, user message contains user code/question.

What to say:

> I added an AI assistant to improve developer productivity. It can explain selected code, review it, detect bugs, and suggest completions.

---

### Feature 8: Video Call

Files:

- `client/src/hooks/useWebRTC.js`
- `client/src/components/VideoCall.jsx`
- `server/socket/socketHandlers.js`

Technologies:

- WebRTC for direct video/audio connection
- Socket.IO for signaling

Important concept:

> WebRTC connects browsers directly, but before direct connection, browsers need to exchange offer, answer, and ICE candidates. Socket.IO is used only for this setup process. Actual video/audio flows peer-to-peer.

Video call flow:

```text
User clicks Start Call
  -> browser asks camera/mic permission
  -> getUserMedia returns local stream
  -> frontend emits user_joined_call
  -> server stores participant
  -> server sends existing participants
  -> WebRTC offer/answer/ICE exchange happens through Socket.IO
  -> peer video stream appears
```

Important events:

```text
user_joined_call
video_call_participants
video_call_offer
video_call_answer
ice_candidate
video_call_end
video_call_room_info
```

What is ICE candidate?

> ICE candidate is network information used by browsers to find a working path for peer-to-peer connection.

What is STUN?

> STUN server helps browser discover its public network address, useful for WebRTC connection.

New user call notification:

> Server tracks active call participants. When a new user joins room, server sends current call info, so new user can see "call is active" and join.

---

## 5. Backend Architecture

### `server.js`

Main job:

- Load `.env`
- Create Express app
- Create HTTP server
- Attach Socket.IO
- Attach routes
- Serve React build
- Connect DB
- Start server

Simple explanation:

> `server.js` is the entry point. It does not contain all business logic. It connects modules together.

### `routes/`

Routes handle HTTP APIs.

```text
runRoutes.js -> /api/languages, /api/run
aiRoutes.js  -> /api/ai
```

Route means:

> A route is an API endpoint. For example, `/api/run` receives code and returns output.

### `services/`

Services contain main logic.

```text
fileService.js   -> file/folder DB logic
judge0Service.js -> code execution logic
aiService.js     -> AI request logic
```

Why service layer?

> It keeps route files small and makes code easy to test and understand.

### `socket/socketHandlers.js`

Handles all real-time events:

- join room
- file create/rename/delete
- code change
- language change
- video-call signaling
- disconnect

### `models/`

MongoDB schema files:

```text
Room.js -> roomId and mainFileId
File.js -> files and folders
```

---

## 6. Database Design

### Room Model

File: `server/models/Room.js`

Fields:

```text
roomId     -> unique room string
mainFileId -> which file should run by default / main file
```

### File Model

File: `server/models/File.js`

Fields:

```text
roomId   -> room this file belongs to
name     -> file/folder name
type     -> file or folder
parentId -> parent folder id, null means root
code     -> file code
language -> programming language
order    -> future sorting support
```

Why MongoDB?

> Project data is document-like. Room and file objects can be stored naturally as documents. Mongoose schema gives validation and structure.

Why in-memory fallback?

> If MongoDB is not connected, the app still works temporarily using JavaScript Maps. This helps during development/demo.

Limitation:

> In-memory data disappears when server restarts.

---

## 7. Important React Syntax

### Component

```js
function Home() {
    return <div>Hello</div>;
}
```

Meaning:

> Component ek reusable UI function hota hai. It returns JSX.

### JSX

```jsx
<button onClick={joinRoom}>Join Room</button>
```

Meaning:

> JSX HTML jaisa dikhta hai, but JavaScript ke andar likha jata hai.

### useState

```js
const [roomId, setRoomId] = useState('');
```

Meaning:

> `roomId` current value hai. `setRoomId` us value ko update karta hai. Update hone par React UI re-render karta hai.

### useEffect

```js
useEffect(() => {
    // component load hone par run
    return () => {
        // cleanup
    };
}, []);
```

Meaning:

> `useEffect` side effects ke liye hota hai, jaise socket connect karna, event listener lagana, API call karna.

### useRef

```js
const socketRef = useRef(null);
```

Meaning:

> `useRef` value ko preserve karta hai without re-render. Socket object, editor object, and latest code ke liye useful hai.

### useCallback

```js
const handleCodeChange = useCallback((code) => {
    codeRef.current = code;
}, []);
```

Meaning:

> `useCallback` function ko memoize karta hai, so unnecessary re-creation kam hoti hai.

### Props

```jsx
<FileTree files={files} onFileSelect={handleFileSelect} />
```

Meaning:

> Parent component child component ko data/function pass karta hai. Isko props bolte hain.

### Conditional Rendering

```jsx
{activeFileId ? <Editor /> : <div>Select a file</div>}
```

Meaning:

> Agar file selected hai to editor dikhao, warna placeholder dikhao.

### List Rendering

```jsx
clients.map((client) => (
    <Client key={client.socketId} username={client.username} />
))
```

Meaning:

> Array ke items ko UI me convert karna. `key` React ko item identify karne me help karta hai.

### Optional Chaining

```js
socketClient?.emit(...)
```

Meaning:

> Agar `socketClient` null/undefined hai to error nahi aayega. Agar value hai tabhi emit chalega.

---

## 8. Important JavaScript Syntax

### Destructuring

```js
const { roomId, username } = data;
```

Meaning:

> Object ke properties ko direct variables me nikalna.

### Arrow Function

```js
const joinRoom = () => {
    // logic
};
```

Meaning:

> Short syntax for function.

### Async Await

```js
async function runCode() {
    const response = await fetch('/api/run');
}
```

Meaning:

> Async operations ko readable tarike se likhne ke liye. `await` promise complete hone ka wait karta hai.

### Try Catch

```js
try {
    const result = await runCode();
} catch (error) {
    console.error(error);
}
```

Meaning:

> Error handling ke liye.

### Spread Operator

```js
setFiles((prev) => [...prev, file]);
```

Meaning:

> Purane array ke saare items copy karo and new file add karo.

### Object Spread

```js
{ ...f, code }
```

Meaning:

> Old object copy karo and `code` value update karo.

### Array filter

```js
files.filter((f) => f.roomId === roomId)
```

Meaning:

> Sirf matching items rakho.

### Array map

```js
files.map((f) => f._id === fileId ? updatedFile : f)
```

Meaning:

> Array ke har item ko transform karna.

---

## 9. Socket.IO Syntax

### Client to Server

```js
socket.emit(ACTIONS.JOIN, { roomId, username });
```

Meaning:

> Client server ko event bhej raha hai.

### Server listens

```js
socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    socket.join(roomId);
});
```

Meaning:

> Server event receive kar raha hai.

### Server to one user

```js
io.to(socket.id).emit(ACTIONS.SYNC_FILES, { files });
```

Meaning:

> Sirf ek specific user ko event bhejna.

### Server to whole room

```js
io.in(roomId).emit(ACTIONS.FILE_CREATE, { file });
```

Meaning:

> Room ke sab users ko event bhejna.

### Server to others except sender

```js
socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { fileId, code });
```

Meaning:

> Sender ko chhodkar room ke baaki users ko event bhejna.

---

## 10. Express API Syntax

### Create router

```js
const express = require('express');
const router = express.Router();
```

### GET API

```js
router.get('/languages', (req, res) => {
    res.json(languages);
});
```

### POST API

```js
router.post('/run', async (req, res) => {
    const code = req.body.code;
});
```

Meaning:

> GET data fetch ke liye, POST data send/process ke liye.

### Middleware

```js
app.use(express.json({ limit: '1mb' }));
```

Meaning:

> JSON request body ko parse karta hai.

---

## 11. Mongoose Syntax

### Schema

```js
const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
    },
});
```

Meaning:

> Schema database document ka structure define karta hai.

### Model

```js
module.exports = mongoose.model('Room', roomSchema);
```

Meaning:

> Model se database me create/read/update/delete operations kar sakte hain.

### Find

```js
const room = await Room.findOne({ roomId });
```

### Create

```js
const file = new File(fileData);
await file.save();
```

### Update

```js
await File.findByIdAndUpdate(fileId, { code });
```

### Delete

```js
await File.findByIdAndDelete(fileId);
```

---

## 12. Complete User Flow

### Room Join Flow

```text
Home.jsx
  -> user enters roomId and username
  -> navigate to /editor/:roomId

EditorPage.jsx
  -> initSocket()
  -> socket.emit(JOIN)

socketHandlers.js
  -> socket.join(roomId)
  -> findOrCreateRoom(roomId)
  -> send files to user
  -> send member list to everyone
```

### Code Sync Flow

```text
Editor.jsx
  -> user types code
  -> CODE_CHANGE emitted

socketHandlers.js
  -> sends CODE_CHANGE to other users
  -> saves code in DB

Other user's Editor.jsx
  -> receives CODE_CHANGE
  -> updates CodeMirror
```

### File Create Flow

```text
FileTree.jsx
  -> user clicks New File
  -> prompt asks name
  -> FILE_CREATE emitted

socketHandlers.js
  -> fileService.createFile()
  -> broadcast FILE_CREATE

EditorPage.jsx
  -> setFiles([...prev, file])
```

### Code Run Flow

```text
EditorPage.jsx
  -> POST /api/run

runRoutes.js
  -> validates code/language
  -> calls judge0Service.runCode()

judge0Service.js
  -> sends code to Judge0
  -> polls result
  -> returns output/error

EditorPage.jsx
  -> shows output
```

### AI Flow

```text
AIAssistant.jsx
  -> POST /api/ai

aiRoutes.js
  -> calls aiService.askAI()

aiService.js
  -> builds messages
  -> calls AI API
  -> returns response

AIAssistant.jsx
  -> renders markdown response
```

### Video Call Flow

```text
useWebRTC.js
  -> getUserMedia()
  -> emit user_joined_call

socketHandlers.js
  -> stores participant
  -> sends existing participants
  -> relays offer/answer/ICE

useWebRTC.js
  -> creates RTCPeerConnection
  -> receives remote stream

VideoCall.jsx
  -> displays local and remote videos
```

---

## 13. Important Interview Q&A

### Q1. What problem does your project solve?

It helps multiple developers code together in real time. It combines collaborative editing, file management, code execution, AI assistance, and video call in one tool.

### Q2. Why did you use Socket.IO?

Because normal HTTP is request-response based. Real-time collaboration needs instant updates from server to clients. Socket.IO provides event-based bidirectional communication.

### Q3. Difference between HTTP and Socket.IO?

HTTP: client sends request, server responds.

Socket.IO: connection stays open, both client and server can send events anytime.

### Q4. How is real-time code syncing done?

When a user types, client emits `CODE_CHANGE`. Server broadcasts it to other users in the same room. Other clients update their editor.

### Q5. How do you avoid sending code back to the same user?

Server uses:

```js
socket.in(roomId).emit(...)
```

This sends event to everyone in room except sender.

### Q6. How are files and folders stored?

They are stored in MongoDB as documents. `type` tells file/folder, and `parentId` creates folder hierarchy.

### Q7. Are these real operating system files?

No. They are virtual project files stored in MongoDB. This is safer for a web app and works for collaborative rooms.

### Q8. How does recursive folder delete work?

When a folder is deleted, backend first finds all child files/folders using `parentId`, deletes children recursively, then deletes the folder itself.

### Q9. Why use MongoDB?

Room and file data are document-based. MongoDB stores JSON-like documents naturally, and Mongoose provides schema validation.

### Q10. What happens if MongoDB is down?

The app uses in-memory Maps as fallback. It works temporarily, but data is lost after server restart.

### Q11. How does code execution work?

Frontend sends code to `/api/run`. Backend sends it to Judge0 API, gets a token, polls the result, and returns output/error to frontend.

### Q12. Why not execute code directly on your server?

Running user code directly is dangerous. It can access files or harm the server. Judge0 runs code in a safer external environment.

### Q13. How does AI assistant work?

Frontend sends code and prompt to `/api/ai`. Backend builds messages with a system prompt and user prompt, calls AI API, and returns the answer.

### Q14. How does video call work?

WebRTC handles direct audio/video between browsers. Socket.IO is used only for signaling: exchanging offer, answer, and ICE candidates.

### Q15. Why do you need Socket.IO if WebRTC is peer-to-peer?

WebRTC cannot initially discover peers by itself. It needs signaling to exchange connection information. Socket.IO handles that setup.

### Q16. What is CORS?

CORS allows frontend running on one origin, like `localhost:3000`, to call backend running on another origin, like `localhost:5000`.

### Q17. What is `useEffect` used for in this project?

For socket connection setup, event listener registration, cleanup on unmount, call notifications, and updating external libraries like CodeMirror.

### Q18. What is `useRef` used for?

To store values that should persist without re-rendering, such as CodeMirror instance, socket instance, current code, and active file ID.

### Q19. What is the hardest part of this project?

The hardest part is real-time synchronization because multiple users can edit files, join/leave rooms, and start video calls at the same time. Managing socket events carefully was important.

### Q20. What improvement would you add next?

Possible answers:

- Authentication/login
- Real file export/download
- Permissions: owner/editor/viewer
- Better conflict resolution
- Chat panel
- Deployment with HTTPS
- TURN server for more reliable WebRTC

---

## 14. Common Errors and Fixes

### Socket connection failed

Possible reasons:

- Backend server not running on port `5000`
- Wrong `BACKEND_URL`
- Firewall blocking connection
- WebSocket issue

Fix:

```powershell
cd server
npm.cmd start
```

Client socket has fallback:

```js
transports: ['websocket', 'polling']
```

### App opens on laptop but not phone

Reasons:

- Phone and laptop not on same WiFi
- Windows Firewall blocking port 3000/5000
- Campus WiFi blocking device-to-device communication

Use:

```text
http://YOUR_PC_IP:3000
```

### Code run not working

Possible reasons:

- Judge0 API unavailable
- Wrong API key/config
- Unsupported language
- Network issue

### AI not working

Possible reasons:

- `API_KEY` missing in `.env`
- API endpoint issue
- Internet/network issue

### Video call not working

Possible reasons:

- Camera/mic permission denied
- Browser blocks media on insecure origin
- WebRTC network issue
- Need TURN server for strict networks

---

## 15. Demo Script for Interview

Use this flow during demo:

1. Open home page.
2. Create a room.
3. Enter username and join.
4. Open same room in another browser/incognito with another username.
5. Type code in one editor and show it appears in other editor.
6. Create a folder and file.
7. Rename file.
8. Change language.
9. Run code and show output.
10. Use AI Explain or Bug Fix.
11. Start video call from one user.
12. Show second user gets active call notification and can join.

What to say:

> This shows end-to-end collaboration: room management, real-time code sync, file system, code execution, AI help, and video call.

---

## 16. How to Explain Each File Quickly

### `Home.jsx`

> Landing page. Takes room ID and username. Creates new UUID room or joins existing room.

### `EditorPage.jsx`

> Main dashboard. Manages socket connection, files, active file, language, output panel, sidebar, AI panel, and video call state.

### `Editor.jsx`

> Code editor component using CodeMirror. Emits code changes and receives remote code changes.

### `FileTree.jsx`

> Converts flat files array into nested folder tree and handles context menu actions.

### `FileTreeItem.jsx`

> Renders one file or folder row in file tree.

### `AIAssistant.jsx`

> UI for AI actions and chat. Sends requests to backend and renders markdown response.

### `useWebRTC.js`

> Custom hook for video call logic: media stream, peer connection, offer/answer/ICE, mic/camera/screen share.

### `VideoCall.jsx`

> Displays local and remote video streams and call controls.

### `server.js`

> Backend entry point. Sets up Express, Socket.IO, routes, static frontend, DB connection.

### `socketHandlers.js`

> Handles all real-time socket events.

### `fileService.js`

> Handles file/folder database operations.

### `judge0Service.js`

> Handles code execution through Judge0.

### `aiService.js`

> Handles AI API request and response.

### `Room.js` and `File.js`

> Mongoose schemas for MongoDB.

---

## 17. Simple Definitions

React:

> Frontend library for building UI using components.

Node.js:

> JavaScript runtime that allows JavaScript to run outside browser.

Express:

> Node.js framework for creating APIs and web server.

Socket.IO:

> Real-time event communication library.

MongoDB:

> NoSQL database that stores data as documents.

Mongoose:

> Library that gives schema and easy methods for MongoDB.

CodeMirror:

> Code editor library used to show syntax-highlighted editor.

Judge0:

> External API used to compile and run code safely.

WebRTC:

> Browser technology for peer-to-peer audio/video communication.

CORS:

> Browser security rule that controls which frontend can call which backend.

API:

> A way for frontend and backend to communicate.

---

## 18. Lines You Can Say Confidently

Use these in interview:

> I divided the backend into routes, services, socket handlers, models, and utils to keep the code maintainable.

> Socket.IO is used because real-time collaboration needs bidirectional communication.

> Files and folders are virtual and stored in MongoDB using parent-child relation.

> Code execution is not done on my server for security reasons. I use Judge0 API.

> WebRTC handles actual video/audio streaming, while Socket.IO handles signaling.

> I used `useRef` for CodeMirror and socket objects because they should persist without causing re-renders.

> I used `useEffect` to connect sockets, register listeners, and clean them up.

> The project has MongoDB persistence, and also an in-memory fallback for development.

---

## 19. If You Do Not Know Deep Answer

Sometimes interviewer may ask very deep questions. Use honest but confident answers.

If asked very deep WebRTC internals:

> I understand the high-level flow: WebRTC needs offer, answer, and ICE candidates. Socket.IO transfers these messages, and after connection is established media flows peer-to-peer. I used the browser WebRTC APIs for implementation.

If asked deep AI API internals:

> I integrated the AI through an API. Backend prepares system and user messages, sends them to the AI endpoint, and returns the generated response to frontend.

If asked deep MongoDB indexing:

> I added indexes on room/file fields to make lookup faster. For example, files are queried by roomId and parentId.

If asked security:

> I avoid running user code directly on my server and use Judge0 for safer code execution. API keys are stored in `.env`. In production I would add authentication, validation, rate limiting, and HTTPS.

---

## 20. Final Revision Checklist

Before interview, you should know:

- What project does
- Tech stack
- Why Socket.IO
- Why WebRTC
- Why MongoDB
- How code sync works
- How file/folder tree works
- How code execution works
- How AI assistant works
- Difference between HTTP API and socket event
- Basic React hooks: `useState`, `useEffect`, `useRef`, `useCallback`
- Basic JS: `async/await`, `map`, `filter`, spread operator, destructuring

If you can explain these, you can handle most questions on this project.

---

## 21. One-Page Super Short Summary

SyncCode is a real-time collaborative code editor.

Frontend:

- React components render UI.
- CodeMirror provides code editor.
- Socket.IO client sends/receives real-time events.
- `EditorPage.jsx` is the main page.

Backend:

- Express handles APIs.
- Socket.IO handles real-time collaboration.
- MongoDB stores rooms and files.
- Judge0 runs code.
- AI API gives code help.

Core flow:

```text
User joins room -> socket JOIN -> server joins socket room -> sends files and users
User types code -> CODE_CHANGE -> server broadcasts to others -> DB saves code
User creates file -> FILE_CREATE -> server saves -> broadcasts to all
User runs code -> POST /api/run -> Judge0 -> output shown
User asks AI -> POST /api/ai -> AI API -> response shown
User starts call -> WebRTC + Socket.IO signaling -> video streams shown
```

Best closing line:

> This project helped me understand full-stack development, real-time communication, database modeling, third-party API integration, and browser media APIs in one practical application.
