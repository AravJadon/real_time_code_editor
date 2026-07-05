# Real Time Collaborative Code Editor - Viva Notes

## 1. One-Line Project Introduction

Ye project ek real-time collaborative code editor hai jisme multiple users same room join karke ek hi code editor me live coding kar sakte hain. Code changes Socket.IO ke through real time me sync hote hain, aur user JavaScript/Python code server par run karke output dekh sakta hai.

## 2. Technologies Used

- React: Frontend UI banane ke liye.
- React Router DOM: Pages aur dynamic room URL handle karne ke liye.
- Socket.IO Client: Browser se backend socket server connect karne ke liye.
- Socket.IO Server: Real-time communication ke liye.
- Node.js + Express: Backend server aur `/api/run` API banane ke liye.
- CodeMirror: Code editor UI ke liye syntax highlighting ke saath.
- UUID: Unique room id generate karne ke liye.
- react-hot-toast: Success/error popup messages ke liye.
- Bootstrap + custom CSS: Styling ke liye.

## 3. Project Folder Structure

```text
real_time_code_editor/
  client/
    src/
      App.js
      Actions.js
      socket.js
      Pages/
        Home.jsx
        EditorPage.jsx
      components/
        Editor.jsx
        Client.jsx
      App.css
  server/
    server.js
    Actions.js
    temp/
```

Important idea: `client` frontend hai, `server` backend hai. Dono me `Actions.js` same event names store karta hai taaki spelling mismatch na ho.

## 4. Complete App Flow

1. User home page par aata hai.
2. User room id enter karta hai ya "CREATE NOW" se new room id generate karta hai.
3. User apna username enter karta hai.
4. JOIN button click karne par route `/editor/:roomId` open hota hai.
5. Editor page socket server se connect hota hai.
6. Client server ko `join` event bhejta hai.
7. Server user ko room me add karta hai aur room ke sab clients ko updated member list bhejta hai.
8. Jab user code type karta hai, frontend `code_change` event server ko bhejta hai.
9. Server same room ke baaki users ko code bhej deta hai.
10. Dusre users ka editor `setValue` se update hota hai.
11. User language select karta hai to language change bhi room ke baaki users ko sync hota hai.
12. User Run Code click karta hai to code HTTP POST request ke through `/api/run` par jata hai.
13. Server code ko temporary file me save karke Node/Python se execute karta hai.
14. Server output/error frontend ko return karta hai.

## 5. App.js Explanation

File: `client/src/App.js`

Purpose: App level routing aur toast setup.

Important code:

```js
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/editor/:roomId" element={<EditorPage />} />
  </Routes>
</BrowserRouter>
```

Explanation:

- `/` route Home page dikhata hai.
- `/editor/:roomId` dynamic route hai. `:roomId` URL se room id read karta hai.
- `Toaster` toast popup messages ke liye global setup hai.

Viva answer:

"App.js me humne React Router use karke do routes define kiye hain: home page aur editor page. Editor route dynamic hai because har room ka alag roomId hota hai."

## 6. Home.jsx Explanation

File: `client/src/Pages/Home.jsx`

Purpose: User se room id aur username lena.

Important state:

```js
const [roomId, setRoomId] = useState("");
const [username, setUsername] = useState("");
```

Explanation:

- `roomId` input me entered/generated room id store karta hai.
- `username` user ka naam store karta hai.
- `useState` React hook hai jo component ke data ko manage karta hai.

Create new room:

```js
const id = uuidV4();
setRoomId(id);
toast.success('Created a new room ');
```

Explanation:

- `uuidV4()` unique id generate karta hai.
- Ye id room id ban jati hai.
- Toast user ko success message dikhata hai.

Join room:

```js
if (!roomId || !username) {
  toast.error("Room Id and Username is required");
  return;
}

navigate(`/editor/${roomId}`, {
  state: { username }
});
```

Explanation:

- Agar room id ya username empty hai to user ko error dikhega.
- Agar dono present hain to user editor page par redirect hota hai.
- `state` me username bheja gaya hai taaki EditorPage me available ho.

Enter key:

```js
if (e.code === 'Enter') {
  joinRoom();
}
```

Explanation:

- User Enter press kare to JOIN button click ki tarah room join ho jata hai.

Viva answer:

"Home page ka kaam room create/join karna hai. Room id UUID se generate hoti hai aur username ke saath React Router state me editor page par bheji jati hai."

## 7. socket.js Explanation

File: `client/src/socket.js`

Purpose: Socket.IO client connection create karna.

Important code:

```js
return io('http://localhost:5000', options);
```

Explanation:

- Frontend backend ke Socket.IO server se connect hota hai.
- Backend port 5000 par run ho raha hai.
- `transports: ['websocket']` direct WebSocket transport use karta hai.

Viva answer:

"socket.js reusable socket connection banata hai. Isse EditorPage me backend ke real-time server se connection establish hota hai."

## 8. Actions.js Explanation

Files:

- `client/src/Actions.js`
- `server/Actions.js`

Purpose: Socket event names ek jagah define karna.

Important events:

```js
JOIN: 'join'
JOINED: 'joined'
SYNC_CODE: 'sync_code'
CODE_CHANGE: 'code_change'
DISCONNECTED: 'disconnected'
LANGUAGE_CHANGE: 'language_change'
```

Explanation:

- `JOIN`: client room join karne ke liye bhejta hai.
- `JOINED`: server updated clients list bhejta hai.
- `SYNC_CODE`: existing code new user ko bhejne ke liye.
- `CODE_CHANGE`: live code changes sync karne ke liye.
- `DISCONNECTED`: user leave/disconnect hone par.
- `LANGUAGE_CHANGE`: language dropdown sync karne ke liye.

Viva answer:

"Actions.js constants file hai. Isse client aur server dono same event names use karte hain, spelling mistakes aur bugs kam hote hain."

## 9. EditorPage.jsx Explanation

File: `client/src/Pages/EditorPage.jsx`

Purpose: Main collaborative editor page.

Important refs:

```js
const socketRef = useRef(null);
const codeRef = useRef(null);
```

Explanation:

- `socketRef` socket connection ko store karta hai.
- `codeRef` latest code ko store karta hai.
- `useRef` value change hone par component re-render nahi karta, isliye socket/code jaise mutable values ke liye useful hai.

Important states:

```js
const [clients, setClients] = useState([]);
const [language, setLanguage] = useState('javascript');
const [output, setOutput] = useState('');
const [isRunning, setIsRunning] = useState(false);
```

Explanation:

- `clients`: room me connected users list.
- `language`: selected language, default JavaScript.
- `output`: code execution output.
- `isRunning`: Run button disabled/loading state.

Socket initialization:

```js
socketRef.current = await initSocket();
```

Explanation:

- Socket connection create hota hai.
- Ye backend `localhost:5000` se connect hota hai.

Join room:

```js
socketRef.current.emit(ACTIONS.JOIN, {
  roomId,
  username: location.state?.username,
});
```

Explanation:

- Client server ko batata hai ki mujhe is room me join karna hai.
- `roomId` URL se aata hai.
- `username` Home page se route state me aata hai.

Joined event:

```js
socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
  setClients(clients);
  socketRef.current.emit(ACTIONS.SYNC_CODE, {
    code: codeRef.current,
    socketId,
  });
});
```

Explanation:

- Server se updated clients list aati hai.
- UI me members list update hoti hai.
- Existing code new joined user ko sync kiya jata hai.

Disconnected event:

```js
setClients((prev) =>
  prev.filter((client) => client.socketId !== socketId)
);
```

Explanation:

- Jo user room chhodta hai usko members list se remove kar diya jata hai.

Language change:

```js
setLanguage(newLang);
socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
  roomId,
  language: newLang,
});
```

Explanation:

- Apne editor me language update hoti hai.
- Baaki room users ko bhi language update bheja jata hai.

Run code:

```js
const response = await fetch('http://localhost:5000/api/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: codeRef.current,
    language,
  }),
});
```

Explanation:

- Code execution Socket.IO se nahi, normal HTTP API se hota hai.
- Code aur selected language backend ko POST request me bhejte hain.
- Backend output/error JSON me return karta hai.

Copy room id:

```js
await navigator.clipboard.writeText(roomId);
```

Explanation:

- Browser Clipboard API se room id copy hoti hai.

Leave room:

```js
reactNavigator('/');
```

Explanation:

- User home page par chala jata hai.
- Component unmount hone par socket disconnect ho jata hai.

Redirect protection:

```js
if (!location.state) {
  return <Navigate to="/" />;
}
```

Explanation:

- Agar user direct `/editor/roomId` open kare bina username ke, to home page par redirect kar diya jata hai.

Viva answer:

"EditorPage main page hai. Ye socket connection initialize karta hai, room join karta hai, clients list maintain karta hai, language sync karta hai, code run API call karta hai, aur UI me sidebar/editor/output render karta hai."

## 10. Editor.jsx Explanation

File: `client/src/components/Editor.jsx`

Purpose: CodeMirror editor setup aur live code sync.

Initialize CodeMirror:

```js
editorRef.current = Codemirror.fromTextArea(
  document.getElementById('realtimeEditor'),
  {
    mode: language === 'python'
      ? { name: 'python' }
      : { name: 'javascript', json: true },
    theme: 'dracula',
    autoCloseTags: true,
    autoCloseBrackets: true,
    lineNumbers: true,
  }
);
```

Explanation:

- Normal `<textarea>` ko CodeMirror editor me convert karta hai.
- `mode` selected language ke hisaab se syntax highlighting deta hai.
- `theme: 'dracula'` dark editor theme use karta hai.
- `autoCloseBrackets` brackets auto close karta hai.
- `lineNumbers` line numbers show karta hai.

Local code change:

```js
editorRef.current.on('change', (instance, changes) => {
  const { origin } = changes;
  const code = instance.getValue();
  onCodeChange(code);

  if (origin !== 'setValue') {
    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
      roomId,
      code,
    });
  }
});
```

Explanation:

- Jab user type karta hai, CodeMirror change event fire karta hai.
- `getValue()` se complete code milta hai.
- `onCodeChange` latest code parent component `EditorPage` ko bhejta hai.
- Agar change local typing se hai, server ko `code_change` bhejta hai.
- `origin !== 'setValue'` important hai. Jab remote code receive hota hai aur `setValue` call hota hai, usko dobara server par emit nahi karte. Isse infinite loop prevent hota hai.

Language mode update:

```js
editorRef.current.setOption('mode', { name: 'python' });
```

Explanation:

- Dropdown language change hone par editor ka syntax highlighting mode update hota hai.

Remote code receive:

```js
socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
  if (code !== null) {
    editorRef.current.setValue(code);
  }
});
```

Explanation:

- Dusre user ka code receive hota hai.
- Current editor me same code set ho jata hai.

Viva answer:

"Editor component CodeMirror use karta hai. Jab local user type karta hai to code server ko emit hota hai. Jab remote user ka code aata hai to `setValue` se editor update hota hai. `origin !== setValue` infinite loop se bachata hai."

## 11. Client.jsx Explanation

File: `client/src/components/Client.jsx`

Purpose: Sidebar me connected user ka naam aur avatar initial dikhana.

Important code:

```js
{username.charAt(0).toUpperCase()}
```

Explanation:

- Username ka first letter avatar circle me show hota hai.
- Example: "Jadon" ka avatar "J" hoga.

Viva answer:

"Client component ek reusable small UI component hai jo connected member ka avatar initial aur username show karta hai."

## 12. server.js Explanation

File: `server/server.js`

Purpose: Express API, Socket.IO server, real-time room handling, aur code execution.

Server setup:

```js
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
```

Explanation:

- Express app HTTP API ke liye hai.
- `http.createServer(app)` Express ko HTTP server me wrap karta hai.
- Socket.IO ko same HTTP server ke upar attach kiya gaya hai.
- CORS frontend origin `localhost:3000` ko allow karta hai.

Middleware:

```js
app.use(cors());
app.use(express.json());
app.use(express.static('build'));
```

Explanation:

- `cors()` cross-origin requests allow karta hai.
- `express.json()` JSON request body parse karta hai.
- `express.static('build')` production React build serve karne ke liye hai.

Code execution API:

```js
app.post('/api/run', (req, res) => {
  const { code, language } = req.body;
});
```

Explanation:

- Frontend code aur language backend ko bhejta hai.
- Backend validate karta hai ki dono present hain.

Temporary file:

```js
const tempDir = path.join(__dirname, 'temp');
const timestamp = Date.now();
```

Explanation:

- Code execute karne ke liye temporary file banayi jati hai.
- Timestamp se unique filename banta hai.

Language decision:

```js
if (language === 'javascript') {
  filename = path.join(tempDir, `code_${timestamp}.js`);
  command = 'node';
  args = [filename];
} else if (language === 'python') {
  filename = path.join(tempDir, `code_${timestamp}.py`);
  command = 'python';
  args = [filename];
}
```

Explanation:

- JavaScript code `.js` file me save hota hai aur `node file.js` se run hota hai.
- Python code `.py` file me save hota hai aur `python file.py` se run hota hai.

Execute code:

```js
execFile(command, args, { timeout: 10000, maxBuffer: 1024 * 1024 }, callback);
```

Explanation:

- `execFile` external command run karta hai.
- Timeout 10 seconds hai, infinite loop se server bachane ke liye.
- `maxBuffer` output ka limit rakhta hai.

Cleanup:

```js
try { fs.unlinkSync(filename); } catch (e) { /* ignore */ }
```

Explanation:

- Code run hone ke baad temp file delete kar di jati hai.

Socket user map:

```js
const userSocketMap = {};
```

Explanation:

- Har socket id ke against username store hota hai.
- Example: `{ "abc123": "Jadon" }`

Get all room clients:

```js
Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(...)
```

Explanation:

- Socket.IO adapter room ke socket ids deta hai.
- Un ids ko username ke saath clients list me convert karte hain.

Join event:

```js
socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
  userSocketMap[socket.id] = username;
  socket.join(roomId);
  const clients = getAllConnectedClients(roomId);
});
```

Explanation:

- User ka username map me save hota hai.
- Socket ko specific room me join karaya jata hai.
- Room ke all clients get kiye jate hain.

Notify joined:

```js
clients.forEach(({ socketId }) => {
  io.to(socketId).emit(ACTIONS.JOINED, {
    clients,
    username,
    socketId: socket.id,
  });
});
```

Explanation:

- Room ke har user ko updated clients list bheji jati hai.
- Isse sidebar me members update hote hain.

Code change event:

```js
socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
```

Explanation:

- Sender ko chhodkar room ke baaki users ko code bheja jata hai.
- `socket.in(roomId)` means "same room ke other clients".

Sync code event:

```js
io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
```

Explanation:

- Jab new user join karta hai, existing user's current code specifically new user ko bheja jata hai.

Language change:

```js
socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
```

Explanation:

- Selected language baaki room users ko sync hoti hai.

Disconnecting:

```js
socket.on('disconnecting', () => {
  const rooms = [...socket.rooms];
  rooms.forEach((roomId) => {
    socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
      socketId: socket.id,
      username: userSocketMap[socket.id],
    });
  });
  delete userSocketMap[socket.id];
});
```

Explanation:

- Disconnect hone se pehle socket ke rooms milte hain.
- Room ke baaki users ko notify kiya jata hai.
- User map se socket id delete hoti hai.

Viva answer:

"server.js backend ka core hai. Ye Express API provide karta hai, code execute karta hai, aur Socket.IO rooms manage karta hai. Har user ka socket id username ke saath map hota hai, aur code changes room ke other clients ko broadcast hote hain."

## 13. App.css Explanation

File: `client/src/App.css`

Purpose: Complete styling.

Important sections:

- Global reset: margin/padding remove, box-sizing border-box.
- Home page: centered white card, inputs, join button, logo.
- Editor page: full screen layout.
- Sidebar: logo, language selector, run button, members list, copy/leave buttons.
- Editor area: CodeMirror full height dark editor.
- Output panel: bottom console style output area.
- Responsive CSS: small screens par sidebar/output height adjust.

Viva answer:

"App.css me home page aur editor page ki styling hai. Editor layout flexbox se banaya gaya hai: left sidebar fixed width hai aur right main editor area flexible hai."

## 14. Real-Time Collaboration Concept

Core idea:

```text
User A types code
  -> Editor.jsx detects change
  -> emits code_change to server
  -> server broadcasts to room except sender
  -> User B receives code_change
  -> User B editor setValue(code)
```

Why sender ko wapas nahi bhejte?

Because sender ke editor me code already typed hai. Agar sender ko bhi same event wapas bhejenge to unnecessary update hoga.

## 15. Why use Socket.IO?

Socket.IO real-time bi-directional communication deta hai. Normal HTTP me client request bhejta hai tabhi response aata hai. Lekin collaborative editor me server ko instant dusre clients ko update bhejna hota hai. Isliye WebSocket/Socket.IO use hota hai.

Viva answer:

"Socket.IO is used because code changes need to be sent instantly to all users in the same room without refreshing the page."

## 16. Why use CodeMirror?

CodeMirror ek browser-based code editor library hai. Ye syntax highlighting, themes, line numbers, auto brackets jaisi features provide karta hai. Normal textarea me ye features nahi hote.

## 17. Why use useRef?

`useRef` ka use socket connection aur latest code store karne ke liye hai.

- `socketRef`: same socket instance preserve karna.
- `codeRef`: latest code store karna without re-render.

Viva answer:

"useRef stores mutable values across renders without causing re-render. Socket connection aur latest code ke liye ye suitable hai."

## 18. Why use useEffect?

`useEffect` side effects ke liye use hota hai:

- Socket connection initialize karna.
- Socket events listen karna.
- Component unmount par cleanup karna.
- CodeMirror initialize karna.
- Language change par editor mode update karna.

## 19. Code Execution Flow

```text
Run Code button click
  -> runCode() call
  -> fetch POST /api/run
  -> server receives code and language
  -> server creates temp file
  -> execFile runs node/python
  -> stdout/stderr captured
  -> temp file deleted
  -> response sent to frontend
  -> output panel updates
```

## 20. Security Point for Viva

Important: This project runs user-submitted code on the server. Ye real production me risky hai because malicious code server ko harm kar sakta hai. Production me sandboxing, Docker containers, resource limits, authentication, and file system restrictions use karna chahiye.

Good viva answer:

"Currently this is a learning/demo project. Production-level code execution ke liye sandboxed environment like Docker, strict timeout, memory limits, and security checks required honge."

## 21. Limitations

- Only JavaScript and Python supported.
- Server local machine par code run karta hai.
- No database, so room data persistent nahi hai.
- Refresh/direct editor URL without username redirect karta hai.
- Authentication nahi hai.
- Code execution sandboxed nahi hai.
- Temp files cleanup hoti hain, but production me stronger isolation chahiye.

## 22. Possible Future Enhancements

- Database add karke code save karna.
- User authentication.
- Multiple files support.
- More languages support like C++, Java.
- Docker-based secure code execution.
- Chat feature.
- Cursor position sync.
- Voice/video collaboration.
- Better mobile responsive layout.

## 23. Common Viva Questions and Answers

Q1. What is your project?

Answer: My project is a real-time collaborative code editor where multiple users can join the same room, edit code together live, choose JavaScript or Python, run the code on the server, and see the output.

Q2. What is real-time collaboration?

Answer: Real-time collaboration means when one user makes a change, other users see that change immediately without page refresh.

Q3. Why did you use Socket.IO?

Answer: Socket.IO provides real-time two-way communication between client and server. It is useful for instantly syncing code changes and user join/leave events.

Q4. What is a room?

Answer: A room is a group/channel in Socket.IO. Users with the same roomId join the same room, and events are shared only inside that room.

Q5. How do you generate room id?

Answer: I use the `uuid` package. `uuidV4()` generates a unique room id.

Q6. How does one user receive another user's code?

Answer: When user A types, Editor emits `code_change` to server. Server broadcasts it to all other users in the same room. User B receives it and updates CodeMirror with `setValue`.

Q7. What is the purpose of Actions.js?

Answer: It stores socket event names as constants so client and server use the same names and avoid spelling mistakes.

Q8. How does the new user get existing code?

Answer: When a new user joins, server sends `joined` event. Existing client emits `sync_code` with current code to the new user's socket id.

Q9. Why do you check `origin !== 'setValue'`?

Answer: To avoid infinite loop. Remote code update uses `setValue`, and we do not want that programmatic update to again emit `code_change`.

Q10. How is code executed?

Answer: Frontend sends code and language to `/api/run`. Server saves code in a temp `.js` or `.py` file and runs it using `execFile` with Node or Python, then returns output/error.

Q11. What is stdout and stderr?

Answer: `stdout` is normal program output. `stderr` is error output from the executed program.

Q12. Why use timeout in code execution?

Answer: Timeout prevents infinite loops or long-running code from blocking the server. This project uses 10 seconds.

Q13. Why use React Router?

Answer: React Router manages frontend routes. `/` is home and `/editor/:roomId` opens editor for a specific room.

Q14. What is `useNavigate`?

Answer: `useNavigate` is a React Router hook used for programmatic navigation, like moving from home to editor page.

Q15. What is `useParams`?

Answer: `useParams` reads dynamic URL values. In this project it reads `roomId` from `/editor/:roomId`.

Q16. What is `useLocation`?

Answer: `useLocation` gives route state. Here it receives username sent from Home page.

Q17. What is `useState`?

Answer: `useState` stores component state like roomId, username, clients, language, output.

Q18. What is `useEffect`?

Answer: `useEffect` runs side-effect logic such as socket initialization, event listeners, and cleanup.

Q19. What is `useRef`?

Answer: `useRef` stores mutable values like socket instance and latest code without re-rendering component.

Q20. What happens when user leaves?

Answer: User navigates to home. EditorPage unmounts and socket disconnects. Server sends `disconnected` event to other users and removes user from map.

## 24. Best 1-Minute Viva Explanation

"This is a real-time collaborative code editor built using React, Node.js, Express, Socket.IO, and CodeMirror. On the home page, a user enters username and room id or creates a new room using UUID. Then React Router opens `/editor/:roomId`. On the editor page, the client connects to the Socket.IO server and emits a join event. The server adds the socket to a room and sends the updated clients list to everyone. When a user types code, CodeMirror detects the change and emits a `code_change` event. The server broadcasts that change to other users in the same room, so all editors stay synchronized. The selected language is also synced. For code execution, the frontend sends code and language to the Express `/api/run` endpoint. The server writes the code to a temporary file, executes it using Node or Python with a timeout, deletes the temp file, and returns output or error to the frontend."

## 25. File-by-File Short Revision

- `App.js`: Routes and toast setup.
- `Home.jsx`: Room id, username, create room, join room.
- `EditorPage.jsx`: Main editor page, socket connection, members list, language, run code, copy/leave.
- `Editor.jsx`: CodeMirror setup and real-time code sync.
- `Client.jsx`: Shows connected user in sidebar.
- `socket.js`: Creates socket connection to backend.
- `Actions.js`: Common socket event names.
- `server.js`: Express API, Socket.IO rooms, code execution.
- `App.css`: Styling for home, sidebar, editor, output panel.

