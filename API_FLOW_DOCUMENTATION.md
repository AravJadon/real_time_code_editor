# SyncCode API And Real-Time Flow Documentation

This document explains every backend HTTP API and every Socket.IO real-time event in this project. It also shows the exact file path and function path from client request/event to backend processing to final response/UI update.

## 1. Main Server Entry Point

File:

```txt
server/server.js
```

Important setup:

```js
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', runRoutes);
app.use('/api', aiRoutes);

registerSocketHandlers(io);
```

Flow:

1. Server loads env files using `loadEnvFile(...)`.
2. Express app is created.
3. HTTP server is created from Express.
4. Socket.IO server is attached to the same HTTP server.
5. Express middleware enables CORS and JSON request body parsing.
6. `/api` routes are mounted:
   - `server/routes/runRoutes.js`
   - `server/routes/aiRoutes.js`
7. Static React build is served from `client/build`.
8. Socket handlers are registered from `server/socket/socketHandlers.js`.
9. MongoDB connection is attempted through `connectDB()` in `server/db.js`.
10. If MongoDB fails, app continues using in-memory room/file storage.

## 2. Backend URL Used By Client

File:

```txt
client/src/config.js
```

Function/constant:

```js
export const BACKEND_URL = ...
```

How client chooses backend:

1. If `REACT_APP_BACKEND_URL` exists and is valid for the current host, client uses it.
2. Otherwise client uses:

```txt
{current_protocol}//{current_hostname}:5000
```

Example:

```txt
http://localhost:5000
```

All HTTP API calls and Socket.IO connections use this backend URL.

## 3. HTTP API List

HTTP APIs are mounted in:

```txt
server/server.js
```

Mount lines:

```js
app.use('/api', runRoutes);
app.use('/api', aiRoutes);
```

Actual APIs:

| Method | API | Route File | Main Function |
|---|---|---|---|
| GET | `/api/languages` | `server/routes/runRoutes.js` | route callback inside `router.get('/languages', ...)` |
| POST | `/api/run` | `server/routes/runRoutes.js` | route callback inside `router.post('/run', ...)`, then `runCode(...)` |
| POST | `/api/ai` | `server/routes/aiRoutes.js` | route callback inside `router.post('/ai', ...)`, then `askAI(...)` |

## 4. API: GET /api/languages

Purpose:

Returns the supported coding languages for the editor/run feature.

Route file:

```txt
server/routes/runRoutes.js
```

Supporting file:

```txt
server/languages.js
```

Route code:

```js
router.get('/languages', (req, res) => {
    const languages = Object.entries(SUPPORTED_LANGUAGES).map(([value, language]) => ({
        value,
        label: language.label,
    }));

    res.json(languages);
});
```

Request:

```http
GET /api/languages
```

Body:

```txt
No body
```

Success response:

```json
[
  { "value": "javascript", "label": "JavaScript (Node.js 22)" },
  { "value": "python", "label": "Python 3.14" }
]
```

Detailed path:

```txt
Client/browser
  -> GET {BACKEND_URL}/api/languages
  -> server/server.js
  -> app.use('/api', runRoutes)
  -> server/routes/runRoutes.js
  -> router.get('/languages', ...)
  -> server/languages.js SUPPORTED_LANGUAGES
  -> Object.entries(...).map(...)
  -> res.json(languages)
  -> client receives JSON array
```

Note:

The current React UI mostly uses its own client language list from:

```txt
client/src/languages.js
```

So this endpoint exists on the backend, but the current searched client code does not appear to fetch it directly.

## 5. API: POST /api/run

Purpose:

Runs code using Judge0 and returns output, error, status, time, memory, and language label.

Client caller:

```txt
client/src/Pages/EditorPage.jsx
```

Client function:

```js
async function runCode()
```

Backend route:

```txt
server/routes/runRoutes.js
```

Backend service:

```txt
server/services/judge0Service.js
```

Main backend function:

```js
async function runCode(code, languageKey, stdin)
```

Request:

```http
POST /api/run
Content-Type: application/json
```

Request body:

```json
{
  "code": "console.log('Hello')",
  "language": "javascript",
  "stdin": ""
}
```

Success response:

```json
{
  "output": "Hello\n",
  "error": "",
  "status": "Accepted",
  "time": "0.123",
  "memory": 12345,
  "language": "JavaScript (Node.js 22)"
}
```

Frontend full path:

```txt
User clicks Run button
  -> client/src/Pages/EditorPage.jsx
  -> runCode()
  -> checks activeFile exists
  -> reads current code from codeRef.current
  -> checks code is not empty
  -> setIsRunning(true)
  -> setOutput("Running file...")
  -> fetch(`${BACKEND_URL}/api/run`, ...)
```

Backend full path:

```txt
POST /api/run
  -> server/server.js
  -> app.use('/api', runRoutes)
  -> server/routes/runRoutes.js
  -> router.post('/run', async (req, res) => ...)
  -> reads req.body.code
  -> reads req.body.language
  -> reads req.body.stdin || ''
  -> validates code and language
  -> calls runCode(code, language, stdin)
  -> server/services/judge0Service.js
```

Judge0 service internal path:

```txt
runCode(code, languageKey, stdin)
  -> SUPPORTED_LANGUAGES[languageKey]
  -> if language does not exist: throw 400 Unsupported language
  -> ensureJudge0IsConfigured()
  -> createSubmission(code, language, input)
      -> encodeBase64(code)
      -> encodeBase64(stdin)
      -> requestJudge0('POST', '/submissions/?base64_encoded=true&wait=false', body)
      -> Judge0 returns token
  -> waitForSubmission(token)
      -> loop up to JUDGE0_MAX_POLL_ATTEMPTS
      -> getSubmission(token)
          -> requestJudge0('GET', `/submissions/${token}?base64_encoded=true&fields=...`)
      -> if status.id > 2, return final submission
      -> otherwise wait JUDGE0_POLL_INTERVAL_MS and poll again
  -> decodeBase64(stdout)
  -> decodeBase64(compile_output)
  -> decodeBase64(stderr)
  -> decodeBase64(message)
  -> build result object
  -> return result
```

Response path back to UI:

```txt
judge0Service.runCode(...)
  -> returns result object
  -> server/routes/runRoutes.js
  -> res.json(result)
  -> client/src/Pages/EditorPage.jsx runCode()
  -> const data = await response.json()
  -> formatRunResult(data)
  -> setOutput(formatted output)
  -> terminal/output panel shows result
```

Frontend formatter:

```txt
client/src/Pages/EditorPage.jsx
function formatRunResult(data)
```

It displays:

1. `data.output`
2. `data.error`, if present
3. `Status`
4. `Time`
5. `Memory`

Important backend helper functions:

```txt
server/services/judge0Service.js
```

| Function | Work |
|---|---|
| `readNumberEnv(name, fallback)` | Reads numeric env values like poll interval and limits |
| `getJudge0Config()` | Reads Judge0 URL, host, API key, auth token/user |
| `createJudge0Headers(payload)` | Builds headers for Judge0 request |
| `ensureJudge0IsConfigured()` | Throws error if RapidAPI Judge0 is used without key |
| `encodeBase64(value)` | Encodes source code/stdin |
| `decodeBase64(value)` | Decodes Judge0 output fields |
| `requestJudge0(method, endpoint, body)` | Performs actual HTTP/HTTPS request to Judge0 |
| `formatJudge0Error(response)` | Converts Judge0 error response to readable message |
| `createSubmission(code, language, stdin)` | Sends code to Judge0 and receives token |
| `getSubmission(token)` | Fetches submission status/result from Judge0 |
| `wait(ms)` | Wait helper between polls |
| `waitForSubmission(token)` | Polls Judge0 until final result |
| `runCode(code, languageKey, stdin)` | Main exported function used by route |

Every situation/error:

| Situation | Where handled | Response/result |
|---|---|---|
| No active file | `EditorPage.jsx runCode()` | Toast: open a file |
| Code empty | `EditorPage.jsx runCode()` | Toast: code is empty |
| Missing code/language in backend request | `runRoutes.js` | HTTP 400 `{ "error": "Code and language are required." }` |
| Unsupported language key | `judge0Service.js runCode()` | HTTP 400 `{ output: "", error: "Unsupported language: ..." }` |
| RapidAPI Judge0 missing key | `ensureJudge0IsConfigured()` | HTTP 500 with config error |
| Judge0 POST submission fails | `createSubmission()` | HTTP 502 or error status with message |
| Judge0 does not return token | `createSubmission()` | HTTP 502 with token error |
| Judge0 polling does not finish | `waitForSubmission()` | HTTP 502 with "still processing" message |
| Compile/runtime error | `runCode()` | HTTP 200 but `error` field contains compile/stderr/message/status |
| Frontend fetch fails | `EditorPage.jsx runCode()` catch block | Output panel shows failure message |

## 6. API: POST /api/ai

Purpose:

Sends code/prompt to AI service and returns AI response.

Client caller:

```txt
client/src/components/AIAssistant.jsx
```

Client function:

```js
sendAIRequest(action, customPrompt)
```

Backend route:

```txt
server/routes/aiRoutes.js
```

Backend service:

```txt
server/services/aiService.js
```

Main backend function:

```js
async function askAI(options)
```

Request:

```http
POST /api/ai
Content-Type: application/json
```

Request body:

```json
{
  "action": "explain",
  "code": "console.log('Hello')",
  "language": "javascript",
  "prompt": "Explain this code",
  "conversationHistory": []
}
```

Valid actions:

```txt
suggest
explain
review
bugfix
chat
```

Success response:

```json
{
  "response": "This code prints Hello to the console.",
  "action": "explain",
  "model": "gemini-3.5-flash",
  "usage": null
}
```

Frontend full path:

```txt
User opens AI Assistant
  -> client/src/components/AIAssistant.jsx
  -> user clicks quick action OR sends chat OR editor context menu triggers action
  -> sendAIRequest(action, customPrompt)
  -> creates user message in state
  -> builds conversationHistory only for chat mode
  -> fetch(`${backendUrl}/api/ai`, ...)
```

Editor context menu AI path:

```txt
User right-clicks editor
  -> client/src/components/Editor.jsx
  -> handleContextMenu(...)
  -> user chooses Explain/Bugfix/Suggest
  -> handleAIAction(action)
  -> calls one of:
      onAIExplain(codeToSend)
      onAIBugfix(codeToSend)
      onAISuggest(codeUpToCursor)
  -> client/src/Pages/EditorPage.jsx
  -> handleAIExplain / handleAIBugfix / handleAISuggest
  -> opens AI panel
  -> sets aiTriggerAction
  -> AIAssistant.jsx useEffect sees triggerAction
  -> sendAIRequest(...)
  -> POST /api/ai
```

Backend full path:

```txt
POST /api/ai
  -> server/server.js
  -> app.use('/api', aiRoutes)
  -> server/routes/aiRoutes.js
  -> router.post('/ai', async (req, res) => ...)
  -> calls askAI({
       action,
       code,
       language,
       prompt,
       conversationHistory
     })
  -> server/services/aiService.js
```

AI service internal path:

```txt
askAI(options)
  -> action = options.action || 'chat'
  -> checks process.env.API_KEY
  -> checks code or prompt exists
  -> checks action is valid
  -> buildAIMessages(action, code, language, prompt, conversationHistory)
      -> chooses system prompt from AI_SYSTEM_PROMPTS
      -> for chat, adds previous user/assistant messages
      -> creates final user content with language, code block, prompt
  -> requestAI(body)
      -> HTTPS POST to:
         https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
      -> Authorization: Bearer API_KEY
      -> model: gemini-3.5-flash
      -> temperature: 0.3 for suggest, 0.7 otherwise
      -> max_tokens: 512 for suggest, 2048 otherwise
  -> if response not OK, readAIError(response), throw
  -> read choices[0].message.content
  -> return { response, action, model, usage }
```

Response path back to UI:

```txt
aiService.askAI(...)
  -> returns result
  -> server/routes/aiRoutes.js
  -> res.json(result)
  -> client/src/components/AIAssistant.jsx
  -> const data = await response.json()
  -> creates assistant message
  -> setMessages(...)
  -> renderMarkdown(data.response)
  -> AI panel shows answer
```

Important backend helper functions:

```txt
server/services/aiService.js
```

| Function | Work |
|---|---|
| `buildAIMessages(action, code, language, prompt, conversationHistory)` | Builds system/user/chat messages |
| `requestAI(body)` | Sends HTTPS request to Gemini OpenAI-compatible endpoint |
| `readAIError(response)` | Extracts readable AI error |
| `askAI(options)` | Main exported function used by route |

Every situation/error:

| Situation | Where handled | Response/result |
|---|---|---|
| AI request already loading | `AIAssistant.jsx sendAIRequest()` | Function returns; no duplicate request |
| Empty chat input | `AIAssistant.jsx handleSendMessage()` | Does not send |
| Missing API key | `aiService.js askAI()` | HTTP 500 `{ "error": "AI API key is not configured..." }` |
| No code and no prompt | `aiService.js askAI()` | HTTP 400 `{ "error": "Either code or prompt is required." }` |
| Invalid action | `aiService.js askAI()` | HTTP 400 invalid action message |
| AI API timeout | `requestAI()` | HTTP 502 route response with timeout message |
| AI API non-JSON response | `requestAI()` | Error response from backend |
| AI API returns no content | `askAI()` | HTTP 502 `"AI returned an empty response."` |
| Frontend fetch fails | `AIAssistant.jsx catch` | Error message added to chat |

## 7. Socket.IO Setup

Client socket file:

```txt
client/src/socket.js
```

Function:

```js
export const initSocket = async () => {
    return io(BACKEND_URL, options);
};
```

Client options:

```js
{
  'force new connection': true,
  reconnectionAttempts: Infinity,
  timeout: 10000,
  transports: ['websocket', 'polling']
}
```

Server socket file:

```txt
server/socket/socketHandlers.js
```

Main function:

```js
function registerSocketHandlers(io)
```

Server connection path:

```txt
Client initSocket()
  -> connects to BACKEND_URL
  -> server/server.js Socket.IO instance receives connection
  -> registerSocketHandlers(io)
  -> io.on('connection', (socket) => ...)
  -> socket.id is generated
```

Shared action names:

```txt
client/src/Actions.js
server/Actions.js
```

Both files contain the same event names so client and server can communicate.

## 8. Socket Event List

| Event | Direction | Purpose |
|---|---|---|
| `join` | client -> server | User joins a room |
| `joined` | server -> clients | Notify room clients that someone joined and send client list |
| `sync_files` | server -> joining client | Send room files and main file |
| `file_create` | client -> server -> room | Create file/folder and broadcast |
| `file_rename` | client -> server -> room | Rename file/folder and broadcast |
| `file_delete` | client -> server -> room | Delete file/folder recursively and broadcast |
| `set_main_file` | client -> server -> room | Set main runnable file and broadcast |
| `code_change` | client -> server -> other clients | Broadcast live code changes and save code |
| `language_change` | client -> server -> other clients | Broadcast language change and save language |
| `get_video_call_room_info` | client -> server | Request current call status |
| `video_call_room_info` | server -> client/room | Send call active status and participants |
| `user_joined_call` | client -> server -> participants | Join video call and notify call participants |
| `video_call_participants` | server -> joining caller | Send existing call participants |
| `video_call_offer` | client -> server -> target client | Forward WebRTC offer |
| `video_call_answer` | client -> server -> target client | Forward WebRTC answer |
| `ice_candidate` | client -> server -> target client | Forward ICE candidate |
| `video_call_end` | client -> server -> room | End/leave call and notify peers |
| `disconnected` | server -> room | User disconnected from room |
| `error_message` | server -> client | Join failure message |

## 9. Socket: User Joins Room

Event:

```txt
join
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
```

Client code path:

```txt
EditorPage useEffect
  -> initSocket()
  -> socket.on(...) handlers registered
  -> socket.emit(ACTIONS.JOIN, { roomId, username })
```

Server handler:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.JOIN, async ({ roomId, username }) => ...)
```

Server full path:

```txt
socket receives 'join'
  -> userSocketMap[socket.id] = username
  -> socket.join(roomId)
  -> fileService.findOrCreateRoom(roomId)
  -> getAllConnectedClients(io, roomId)
  -> for each client:
       io.to(client.socketId).emit('joined', { clients, username, socketId })
  -> fileService.findFilesByRoom(roomId)
  -> io.to(socket.id).emit('sync_files', { files, mainFileId })
  -> sendCallRoomInfoToSocket(io, socket, roomId)
```

File service path:

```txt
server/services/fileService.js
findOrCreateRoom(roomId)
```

If MongoDB is connected:

```txt
Room.findOne({ roomId })
  -> if room not found:
       new Room({ roomId }).save()
       create default File index.js
       save File
       set room.mainFileId
       save Room
  -> return room.toJSON()
```

If MongoDB is not connected:

```txt
memoryRooms Map
memoryFiles Map
  -> if room not found:
       create memory file id
       create default index.js
       save in memoryFiles
       save room in memoryRooms
  -> return memory room
```

Receiver side:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.JOINED, ...)
  -> if another user joined, show toast
  -> setClients(joinedClients)

socket.on(ACTIONS.SYNC_FILES, ...)
  -> setFiles(dbFiles)
  -> setMainFileId(dbMainFileId)
  -> choose first file as active file
  -> codeRef.current = firstFile.code
  -> setLanguage(firstFile.language || DEFAULT_LANGUAGE)

client/src/hooks/useWebRTC.js
socket.on(ACTIONS.VIDEO_CALL_ROOM_INFO, ...)
  -> setCallRoomInfo(info)
```

Situation example: Client A joins, then Client B joins

```txt
Client A emits join
  -> server joins A to room
  -> server emits joined to A
  -> server emits sync_files to A

Client B emits join
  -> server joins B to same room
  -> getAllConnectedClients returns A and B
  -> server emits joined to A and B
  -> A updates members list and sees B joined toast
  -> B updates members list
  -> server emits sync_files only to B
```

Join error:

```txt
If server JOIN handler throws:
  -> socket.emit('error_message', { message: 'Failed to join room. Please try again.' })
```

Note:

The current client listens for `connect_error` and `connect_failed`, but does not appear to listen for `error_message`.

## 10. Socket: Create File Or Folder

Event:

```txt
file_create
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
handleCreateFile(parentId)
handleCreateFolder(parentId)
```

Client flow:

```txt
User clicks new file/folder
  -> prompt asks name
  -> socketClient.emit('file_create', {
       roomId,
       name,
       type: 'file' or 'folder',
       parentId
     })
```

Server handler:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.FILE_CREATE, async ({ roomId, name, type, parentId }) => ...)
```

Server path:

```txt
file_create received
  -> fileService.createFile({ roomId, name, type, parentId: parentId || null })
  -> io.in(roomId).emit('file_create', { file })
```

File service:

```txt
server/services/fileService.js
createFile(data)
```

If MongoDB connected:

```txt
new File(fileData).save()
  -> return file.toJSON()
```

If memory mode:

```txt
generateMemoryId()
  -> create file object
  -> memoryFiles.set(fileId, file)
  -> return file
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.FILE_CREATE, ({ file }) => {
  setFiles((prev) => [...prev, file]);
});
```

Important detail:

`io.in(roomId).emit(...)` sends to every socket in the room, including the sender. So the sender and all other clients add the file from the same broadcast.

Error situation:

If create fails, server logs:

```txt
Error creating file
```

No error event is currently sent to client.

## 11. Socket: Rename File Or Folder

Event:

```txt
file_rename
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
handleRename(fileId, name)
```

Also UI source:

```txt
client/src/components/FileTree.jsx
handleRenameSubmit(id, newName)
```

Client flow:

```txt
User opens context menu on file/folder
  -> clicks Rename
  -> inline input appears
  -> user submits new name
  -> onRename(id, newName)
  -> socketClient.emit('file_rename', { roomId, fileId, name })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.FILE_RENAME, async ({ roomId, fileId, name }) => ...)
  -> fileService.renameFile(fileId, name)
  -> io.in(roomId).emit('file_rename', { file })
```

File service:

```txt
server/services/fileService.js
renameFile(fileId, name)
```

MongoDB:

```txt
File.findByIdAndUpdate(fileId, { name }, { new: true })
  -> return file.toJSON()
```

Memory:

```txt
memoryFiles.get(fileId)
  -> file.name = name
  -> return file
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.FILE_RENAME, ({ file }) => {
  setFiles((prev) => prev.map((f) => (f._id === file._id ? file : f)));
});
```

Error situation:

If rename fails, server logs error. No client error event is currently sent.

## 12. Socket: Delete File Or Folder

Event:

```txt
file_delete
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
handleDelete(fileId)
```

UI source:

```txt
client/src/components/FileTree.jsx
context menu Delete button
```

Client flow:

```txt
User chooses Delete
  -> window.confirm(...)
  -> socketClient.emit('file_delete', { roomId, fileId })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.FILE_DELETE, async ({ roomId, fileId }) => ...)
  -> fileService.collectDescendantIds(fileId)
  -> allDeletedIds.push(fileId)
  -> fileService.deleteFileRecursive(fileId)
  -> io.in(roomId).emit('file_delete', { fileId, allDeletedIds })
```

Why `collectDescendantIds` first:

If a folder is deleted, all child files/folders must also be removed from each client's UI. The server collects all child IDs before deletion and sends the list to clients.

File service functions:

```txt
server/services/fileService.js
collectDescendantIds(fileId)
deleteFileRecursive(fileId)
```

MongoDB:

```txt
collectDescendantIds:
  -> File.find({ parentId: fileId })
  -> recursively collect children

deleteFileRecursive:
  -> File.find({ parentId: fileId })
  -> recursively delete children
  -> File.findByIdAndDelete(fileId)
```

Memory:

```txt
collectDescendantIds:
  -> loop memoryFiles
  -> collect children recursively

deleteFileRecursive:
  -> build toDelete array
  -> delete all IDs from memoryFiles
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.FILE_DELETE, ({ fileId, allDeletedIds }) => {
  const deletedSet = new Set(allDeletedIds || [fileId]);
  setFiles((prev) => prev.filter((f) => !deletedSet.has(f._id)));
  setActiveFileId((prev) => (deletedSet.has(prev) ? null : prev));
  setMainFileId((prev) => (deletedSet.has(prev) ? null : prev));
});
```

Situations:

| Situation | Result |
|---|---|
| Delete normal file | File removed from all clients |
| Delete folder | Folder and all descendants removed from all clients |
| Deleted file was active | Active file becomes `null` |
| Deleted file was main file | Main file becomes `null` |
| Delete fails | Server logs error; no client error event |

## 13. Socket: Set Main File

Event:

```txt
set_main_file
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
handleSetMain(fileId)
```

UI source:

```txt
client/src/components/FileTree.jsx
context menu Set as Main
```

Client flow:

```txt
User right-clicks file
  -> clicks Set as Main
  -> socketClient.emit('set_main_file', { roomId, fileId })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.SET_MAIN_FILE, async ({ roomId, fileId }) => ...)
  -> fileService.setMainFile(roomId, fileId)
  -> io.in(roomId).emit('set_main_file', { fileId })
```

File service:

```txt
server/services/fileService.js
setMainFile(roomId, fileId)
```

MongoDB:

```txt
Room.findOneAndUpdate({ roomId }, { mainFileId: fileId })
```

Memory:

```txt
memoryRooms.get(roomId).mainFileId = fileId
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.SET_MAIN_FILE, ({ fileId }) => {
  setMainFileId(fileId);
});
```

Result:

All clients see the selected file as main file.

## 14. Socket: Code Change

Event:

```txt
code_change
```

Client sender:

```txt
client/src/components/Editor.jsx
```

Client function:

```txt
CodeMirror change handler
```

Client flow:

```txt
User types in CodeMirror editor
  -> editorRef.current.on('change', ...)
  -> code = instance.getValue()
  -> onCodeChangeRef.current(code)
  -> if change is not setValue and not remote change:
       socket.emit('code_change', { roomId, fileId: activeFileId, code })
```

Why this condition exists:

```txt
origin !== 'setValue'
!isRemoteChange.current
socket exists
activeFileId exists
```

This prevents an infinite loop where remote code updates trigger another emit.

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, fileId, code }) => ...)
  -> socket.in(roomId).emit('code_change', { fileId, code })
  -> if fileId exists:
       fileService.updateFileCode(fileId, code)
```

Important detail:

```txt
socket.in(roomId).emit(...)
```

This sends the event to everyone in the room except the sender. The sender already has the code locally because they typed it.

File service:

```txt
server/services/fileService.js
updateFileCode(fileId, code)
```

MongoDB:

```txt
File.findByIdAndUpdate(fileId, { code })
```

Memory:

```txt
memoryFiles.get(fileId).code = code
```

Receiver path 1: Page-level state update

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.CODE_CHANGE, ({ fileId, code }) => {
  setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, code } : f)));
});
```

Receiver path 2: Active editor update

```txt
client/src/components/Editor.jsx
socket.on(ACTIONS.CODE_CHANGE, handleCodeChange)
  -> if fileId !== activeFileIdRef.current, ignore
  -> isRemoteChange.current = true
  -> save cursor
  -> editorRef.current.setValue(code)
  -> restore cursor
  -> isRemoteChange.current = false
```

Situation: Client A types, Client B receives

```txt
Client A types "hello"
  -> Client A Editor.jsx emits code_change
  -> Server receives code_change
  -> Server broadcasts code_change to room except Client A
  -> Server saves code in MongoDB or memory
  -> Client B EditorPage updates files array
  -> Client B Editor.jsx checks if same active file
  -> Client B CodeMirror updates visible code
```

Situation: Client B is on another file

```txt
Client B receives code_change for file X
  -> EditorPage updates files array for file X
  -> Editor.jsx ignores because activeFileId is different
  -> Later when B opens file X, latest code is already in files state
```

Error situation:

If saving code fails, server logs error. The broadcast already happened before save, so other clients may still see the live change even if persistence failed.

## 15. Socket: Language Change

Event:

```txt
language_change
```

Client sender:

```txt
client/src/Pages/EditorPage.jsx
handleLanguageChange(event)
```

Client flow:

```txt
User changes language dropdown
  -> setLanguage(nextLanguage)
  -> update active file language in local files state
  -> socketClient.emit('language_change', {
       roomId,
       fileId: activeFileId,
       language: nextLanguage
     })
  -> toast success
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.LANGUAGE_CHANGE, async ({ roomId, fileId, language }) => ...)
  -> socket.in(roomId).emit('language_change', { fileId, language })
  -> if fileId exists:
       fileService.updateFileLanguage(fileId, language)
```

Important detail:

Like code changes, this uses:

```txt
socket.in(roomId).emit(...)
```

So every other client receives it, but the sender already changed local state.

File service:

```txt
server/services/fileService.js
updateFileLanguage(fileId, language)
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.LANGUAGE_CHANGE, ({ fileId, language: newLang }) => {
  setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, language: newLang } : f)));
});
```

Active file language sync:

```txt
client/src/Pages/EditorPage.jsx
useEffect watches activeFile.language
  -> if external language changed:
       setLanguage(activeFile.language || DEFAULT_LANGUAGE)
```

Editor mode update:

```txt
client/src/components/Editor.jsx
useEffect watches language
  -> editorRef.current.setOption('mode', getModeFromLanguage(language))
```

Situation: Client A changes JS to Python

```txt
Client A changes dropdown
  -> Client A updates local UI immediately
  -> emits language_change
  -> Server broadcasts to Client B/C
  -> Server saves language
  -> Client B/C update file language
  -> if same file active, CodeMirror mode changes
```

Error situation:

If saving language fails, server logs error. Broadcast already happened.

## 16. Socket: User Disconnects

Event from Socket.IO:

```txt
disconnecting
```

Server handler:

```txt
server/socket/socketHandlers.js
socket.on('disconnecting', () => ...)
```

Server path:

```txt
socket disconnecting
  -> rooms = Array.from(socket.rooms)
  -> for each roomId:
       removeCallParticipant(roomId, socket.id)
       if user was in call:
           socket.in(roomId).emit('video_call_end', { socketId })
           broadcastCallRoomInfo(io, roomId)
       socket.in(roomId).emit('disconnected', {
           socketId,
           username: userSocketMap[socket.id]
       })
  -> delete userSocketMap[socket.id]
```

Receiver:

```txt
client/src/Pages/EditorPage.jsx
socket.on(ACTIONS.DISCONNECTED, ({ socketId, username: leftUser }) => {
  if (leftUser) toast.success(`${leftUser} left the room.`);
  setClients((currentClients) =>
    currentClients.filter((client) => client.socketId !== socketId)
  );
});
```

Video receiver:

```txt
client/src/hooks/useWebRTC.js
socket.on(ACTIONS.DISCONNECTED, handleDisconnect)
  -> cleanupPeer(socketId)
```

Situation:

```txt
Client A closes browser
  -> server disconnecting handler runs
  -> Client B/C receive disconnected
  -> members list removes Client A
  -> if A was in video call, peers clean up A's video connection
```

## 17. Socket: Video Call Room Info

Events:

```txt
get_video_call_room_info
video_call_room_info
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
```

Client flow:

```txt
When socket exists and roomId exists:
  -> socket.emit('get_video_call_room_info', { roomId })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.GET_VIDEO_CALL_ROOM_INFO, ({ roomId }) => {
  sendCallRoomInfoToSocket(io, socket, roomId);
});
```

Helper path:

```txt
sendCallRoomInfoToSocket(io, socket, roomId)
  -> getCallRoomInfo(io, roomId)
      -> getCallParticipants(io, roomId)
      -> map socket IDs to usernames
      -> return { isActive, participants }
  -> socket.emit('video_call_room_info', info)
```

Receiver:

```txt
client/src/hooks/useWebRTC.js
socket.on(ACTIONS.VIDEO_CALL_ROOM_INFO, handleCallRoomInfo)
  -> setCallRoomInfo(info)
```

UI usage:

```txt
client/src/Pages/EditorPage.jsx
callRoomInfo.isActive
callRoomInfo.participants
```

The UI shows:

1. No active call
2. Call active with participant count
3. Join call button/banner

## 18. Socket: User Joins Video Call

Event:

```txt
user_joined_call
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
startCall()
```

Client path:

```txt
User clicks video call button
  -> EditorPage receives startCall from useWebRTC
  -> startCall()
  -> checks socket connected
  -> getPreferredMediaStream()
      -> tries camera + mic
      -> if fails, tries video only
      -> if fails, tries audio only
  -> setLocalStream(stream)
  -> setIsVideoCallActive(true)
  -> socket.emit('user_joined_call', { roomId, username })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on('user_joined_call', ({ roomId }) => ...)
  -> existingParticipants = addCallParticipant(roomId, socket.id)
  -> socket.emit('video_call_participants', {
       participants: existingParticipants mapped with usernames
     })
  -> for each existing participant:
       io.to(socketId).emit('user_joined_call', {
         socketId: new user's socket.id,
         username: new user's username
       })
  -> broadcastCallRoomInfo(io, roomId)
```

Helper:

```txt
addCallParticipant(roomId, socketId)
  -> gets Set for room from callParticipantsByRoom
  -> existingParticipants = participants except current socket
  -> adds current socket to Set
  -> returns existingParticipants
```

Receiver path for joining user:

```txt
client/src/hooks/useWebRTC.js
socket.on('video_call_participants', handleCallParticipants)
  -> for each existing participant:
       createOfferTo(socketId, peerUsername)
```

Receiver path for existing participants:

```txt
client/src/hooks/useWebRTC.js
socket.on('user_joined_call', handleUserJoinedCall)
  -> stores peer username
  -> waits for new user to send WebRTC offer
```

Room info broadcast:

```txt
broadcastCallRoomInfo(io, roomId)
  -> io.in(roomId).emit('video_call_room_info', info)
```

Situation: First user starts call

```txt
Client A startCall()
  -> media stream created
  -> emits user_joined_call
  -> server adds A to callParticipantsByRoom
  -> existingParticipants is empty
  -> A receives video_call_participants with []
  -> room receives video_call_room_info { isActive: true, participants: [A] }
  -> other room members see active call banner
```

Situation: Second user joins call

```txt
Client B startCall()
  -> emits user_joined_call
  -> server existingParticipants = [A]
  -> B receives video_call_participants [A]
  -> A receives user_joined_call for B
  -> B creates WebRTC offer to A
  -> offer/answer/ICE flow starts
  -> room info updates to [A, B]
```

## 19. Socket: WebRTC Offer

Event:

```txt
video_call_offer
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
createOfferTo(remoteSocketId, remoteUsername)
```

Client path:

```txt
createOfferTo(remoteSocketId)
  -> createPeerConnection(remoteSocketId, remoteUsername)
      -> new RTCPeerConnection({ iceServers })
      -> add local tracks
      -> set onicecandidate
      -> set ontrack
      -> save peer in peersRef
  -> pc.createOffer()
  -> pc.setLocalDescription(offer)
  -> socket.emit('video_call_offer', {
       signal: pc.localDescription,
       targetSocketId: remoteSocketId
     })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.VIDEO_CALL_OFFER, ({ signal, targetSocketId }) => ...)
  -> if signal or targetSocketId missing, return
  -> io.to(targetSocketId).emit('video_call_offer', {
       signal,
       callerSocketId: socket.id
     })
```

Receiver path:

```txt
client/src/hooks/useWebRTC.js
socket.on('video_call_offer', handleCallOffer)
  -> if no local stream, return
  -> createPeerConnection(callerSocketId)
  -> pc.setRemoteDescription(signal)
  -> flushIceCandidateBuffer(callerSocketId)
  -> pc.createAnswer()
  -> pc.setLocalDescription(answer)
  -> socket.emit('video_call_answer', {
       signal: pc.localDescription,
       targetSocketId: callerSocketId
     })
```

Important:

Server does not process WebRTC signal. It only forwards the offer to target socket.

## 20. Socket: WebRTC Answer

Event:

```txt
video_call_answer
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
handleCallOffer(...)
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.VIDEO_CALL_ANSWER, ({ signal, targetSocketId }) => ...)
  -> if signal or targetSocketId missing, return
  -> io.to(targetSocketId).emit('video_call_answer', {
       signal,
       answererSocketId: socket.id
     })
```

Receiver path:

```txt
client/src/hooks/useWebRTC.js
socket.on('video_call_answer', handleCallAnswer)
  -> pc = peersRef.current[answererSocketId]
  -> if no pc, return
  -> pc.setRemoteDescription(signal)
  -> flushIceCandidateBuffer(answererSocketId)
```

After this:

The two browsers have exchanged offer and answer. ICE candidates continue so the peer-to-peer media connection can establish.

## 21. Socket: ICE Candidate

Event:

```txt
ice_candidate
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
createPeerConnection(...)
pc.onicecandidate
```

Client path:

```txt
RTCPeerConnection generates ICE candidate
  -> pc.onicecandidate(event)
  -> socket.emit('ice_candidate', {
       candidate: event.candidate,
       targetSocketId: remoteSocketId
     })
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.ICE_CANDIDATE, ({ candidate, targetSocketId }) => ...)
  -> if candidate or targetSocketId missing, return
  -> io.to(targetSocketId).emit('ice_candidate', {
       candidate,
       senderSocketId: socket.id
     })
```

Receiver path:

```txt
client/src/hooks/useWebRTC.js
socket.on('ice_candidate', handleIceCandidate)
  -> pc = peersRef.current[senderSocketId]
  -> if pc missing or remoteDescription missing:
       buffer candidate in iceCandidateBufferRef
       return
  -> pc.addIceCandidate(new RTCIceCandidate(candidate))
```

Buffered candidate situation:

Sometimes ICE candidates arrive before offer/answer remote description is set. The client stores them in:

```txt
iceCandidateBufferRef.current[senderSocketId]
```

Then later:

```txt
flushIceCandidateBuffer(socketId)
```

adds them after remote description exists.

## 22. Socket: End Video Call

Event:

```txt
video_call_end
```

Client sender:

```txt
client/src/hooks/useWebRTC.js
endCall()
```

Client path:

```txt
User clicks end call
  -> endCall()
  -> if socket connected and user joined call:
       socket.emit('video_call_end', { roomId })
  -> stopLocalStream()
  -> stopScreenStream()
  -> setIsVideoCallActive(false)
  -> cleanupAllPeers()
```

Server path:

```txt
server/socket/socketHandlers.js
socket.on(ACTIONS.VIDEO_CALL_END, ({ roomId }) => ...)
  -> removeCallParticipant(roomId, socket.id)
  -> if user was in call:
       socket.in(roomId).emit('video_call_end', { socketId: socket.id })
       broadcastCallRoomInfo(io, roomId)
```

Receiver path:

```txt
client/src/hooks/useWebRTC.js
socket.on('video_call_end', handleCallEnd)
  -> cleanupPeer(socketId)
```

Situation:

```txt
Client A ends call
  -> A cleans own media and peers
  -> server removes A from participants
  -> Client B/C receive video_call_end for A
  -> B/C remove A peer connection/video stream
  -> all room clients receive updated video_call_room_info
```

## 23. Database And In-Memory Storage

Database connection:

```txt
server/db.js
connectDB()
isDBConnected()
```

Mongo URI:

```txt
process.env.MONGODB_URI
or process.env.MONGO_URI
or mongodb://localhost:27017/synccode
```

If MongoDB connects:

```txt
fileService uses Room and File Mongoose models
```

If MongoDB fails:

```txt
fileService uses:
  memoryRooms = new Map()
  memoryFiles = new Map()
```

Important:

In-memory data is only for the current server session. If server restarts, in-memory rooms/files disappear.

Models:

```txt
server/models/Room.js
server/models/File.js
```

Room fields:

```txt
roomId
mainFileId
timestamps
```

File fields:

```txt
roomId
name
type: file/folder
parentId
code
language
order
timestamps
```

The `toJSON` transforms convert MongoDB ObjectIds to plain strings before sending to client.

## 24. Complete Example: One Client Sends Code, Other Receives

```txt
Client A opens room
  -> emits join
  -> receives sync_files
  -> selects index.js

Client B opens same room
  -> emits join
  -> receives sync_files
  -> both A and B receive joined event with clients list

Client A types code
  -> client/src/components/Editor.jsx CodeMirror change handler
  -> socket.emit('code_change', { roomId, fileId, code })

Server receives
  -> server/socket/socketHandlers.js CODE_CHANGE handler
  -> socket.in(roomId).emit('code_change', { fileId, code })
  -> fileService.updateFileCode(fileId, code)

Client B receives
  -> EditorPage updates files array
  -> Editor.jsx updates active CodeMirror editor if same file is open

Client A does not receive server event
  -> because server used socket.in(roomId)
  -> A already has the typed code locally
```

## 25. Complete Example: Run Code

```txt
User clicks Run
  -> client/src/Pages/EditorPage.jsx runCode()
  -> POST /api/run with code, language, stdin
  -> server/routes/runRoutes.js
  -> judge0Service.runCode()
  -> create Judge0 submission
  -> poll Judge0 result
  -> decode output/error
  -> return JSON to frontend
  -> frontend formatRunResult()
  -> output panel displays result
```

This is not broadcast to other clients. Running code is a private HTTP request/response for the client who clicked Run.

## 26. Complete Example: Ask AI

```txt
User opens AI panel or right-clicks editor
  -> AIAssistant.jsx sendAIRequest()
  -> POST /api/ai with action, code, language, prompt, history
  -> server/routes/aiRoutes.js
  -> aiService.askAI()
  -> buildAIMessages()
  -> requestAI()
  -> Gemini API response
  -> backend returns { response, action, model, usage }
  -> AIAssistant adds assistant message
  -> renderMarkdown displays it
```

This is not broadcast to other clients. AI chat is local to the user's UI state.

## 27. Complete Example: Video Call Between Two Clients

```txt
Client A starts call
  -> useWebRTC.startCall()
  -> browser asks camera/mic permission
  -> A emits user_joined_call
  -> server stores A as call participant
  -> room receives video_call_room_info

Client B joins call
  -> useWebRTC.startCall()
  -> B emits user_joined_call
  -> server sends existing participant A to B
  -> server tells A that B joined

B creates offer
  -> B emits video_call_offer target A
  -> server forwards offer to A

A creates answer
  -> A emits video_call_answer target B
  -> server forwards answer to B

A and B exchange ICE candidates
  -> each emits ice_candidate
  -> server forwards to target

Peer connection established
  -> video/audio streams flow browser-to-browser through WebRTC
  -> server is only signaling, not media transport
```

## 28. Files To Study For Placement Interview

Start here:

```txt
server/server.js
```

Then:

```txt
server/routes/runRoutes.js
server/routes/aiRoutes.js
server/socket/socketHandlers.js
```

Services:

```txt
server/services/judge0Service.js
server/services/aiService.js
server/services/fileService.js
```

Models/database:

```txt
server/db.js
server/models/File.js
server/models/Room.js
```

Client API/socket callers:

```txt
client/src/config.js
client/src/socket.js
client/src/Pages/EditorPage.jsx
client/src/components/Editor.jsx
client/src/components/AIAssistant.jsx
client/src/hooks/useWebRTC.js
client/src/components/FileTree.jsx
client/src/components/FileTreeItem.jsx
```

Shared socket event constants:

```txt
client/src/Actions.js
server/Actions.js
```
