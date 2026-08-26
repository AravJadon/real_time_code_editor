# ⚡ SyncCode — Real-Time Collaborative Code Editor & Workspace

A full-stack, real-time collaborative coding platform designed for seamless remote pair programming, technical interviews, and collaborative learning.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Peer2Peer-FF5722?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)

---

## ✨ Features

- 📝 **Real-Time Code Collaboration**: Multi-user synchronised code editor powered by **CodeMirror** and **Socket.IO**.
- 📁 **Shared File Explorer**: Create, rename, delete, and organize files and folders across all connected room participants in real time.
- ▶️ **In-Browser Code Execution**: Compile and execute code in 10+ programming languages powered by the **Judge0 API**.
- 🤖 **Integrated AI Assistant**: Ask questions, debug errors, review code, or generate snippets using **Google Gemini AI**.
- 📹 **Peer-to-Peer Video Calling**: Built-in video & audio calling directly in the workspace using a **WebRTC Mesh Network** (no external meeting tools required).
- 👥 **Room & Member Management**: Instant room generation, sharable room links, and dynamic active user lists with presence indicators.
- 💾 **Persistent Room Storage**: Automatic syncing and storage with **MongoDB Atlas**.

---

## 🛠️ Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | React 19, React Router v7, React Hot Toast |
| **Code Editor** | CodeMirror 5 (Syntax highlighting, keymaps, custom themes) |
| **Real-time Sync** | Socket.IO (WebSocket events) |
| **Video Calling** | WebRTC (Mesh topology, STUN signaling) |
| **Backend** | Node.js, Express 5 |
| **Database** | MongoDB Atlas, Mongoose |
| **Code Execution** | Judge0 API |
| **AI Integration** | Google Gemini API |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas URI)
- [Google Gemini API Key](https://aistudio.google.com/)

---

### Installation & Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/real-time-code-editor.git
   cd real-time-code-editor
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the `real_time_code_editor/` root folder matching `.env.example`:
   ```env
   # MongoDB connection string (Required)
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/synccode?retryWrites=true&w=majority

   # Google Gemini API key (Required)
   API_KEY=your_google_gemini_api_key_here

   # Port configuration (Optional, default: 5000)
   PORT=5000

   # Judge0 API (Optional - uses public server by default)
   # JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
   # JUDGE0_API_KEY=your_rapidapi_key_here
   ```

3. **Install Dependencies**:
   ```bash
   # Install server dependencies
   cd server
   npm install

   # Install client dependencies
   cd ../client
   npm install
   ```

4. **Run the Application**:

   - **Start Backend Server**:
     ```bash
     cd server
     npm run dev
     ```
   - **Start React Frontend** (in a separate terminal):
     ```bash
     cd client
     npm start
     ```

5. **Open in Browser**:
   Navigate to `http://localhost:3000` to create or join a room.

---

## 📂 Project Structure

```text
real_time_code_editor/
├── client/                     # React Frontend
│   ├── public/
│   └── src/
│       ├── components/         # Editor, FileTree, VideoCall, AIAssistant
│       ├── context/            # Socket & Room contexts
│       ├── hooks/              # Custom hooks (e.g., useWebRTC)
│       └── pages/              # Home & Editor pages
├── server/                     # Node/Express Backend
│   ├── models/                 # Mongoose schemas (Room, File, Code)
│   ├── socket/                 # Socket.IO connection & event handlers
│   └── server.js               # Express & HTTP server entry point
├── render.yaml                 # Deployment configuration for Render
└── package.json
```

---

## 🌐 Deployment (Render)

This repository includes a `render.yaml` blueprint:
1. Link your GitHub repository to [Render](https://render.com/).
2. Add your environment variables (`MONGODB_URI`, `API_KEY`) under Environment Settings.
3. Render automatically executes the root build script:
   ```bash
   npm run build
   npm start
   ```
