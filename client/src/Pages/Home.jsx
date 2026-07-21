import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function createRoomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function Home() {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');

    const createNewRoom = (e) => {
        e.preventDefault();
        const id = createRoomId();
        setRoomId(id);
        toast.success('Created a new room');
    };

    const joinRoom = () => {
        if (!roomId || !username) {
            toast.error('Room ID and Username are required');
            return;
        }
        navigate(`/editor/${roomId}`, {
            state: { username },
        });
    };

    const handleInputEnter = (e) => {
        if (e.code === 'Enter') {
            joinRoom();
        }
    };

    return (
        <main className="homePage">
            <section className="homeCard" aria-label="Join room">
                <img
                    className="homeLogo"
                    src="/images/synccode_logo_highres.png"
                    alt="SyncCode Logo"
                />

                <div className="homeHeading">
                    <h1>SyncCode</h1>
                    <p>Real-time collaborative code editor</p>
                </div>

                <div className="homeForm">
                    <label htmlFor="roomId">Room ID</label>
                    <input
                        id="roomId"
                        type="text"
                        placeholder="Paste or create a room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        onKeyUp={handleInputEnter}
                    />

                    <label htmlFor="username">Username</label>
                    <input
                        id="username"
                        type="text"
                        placeholder="Your display name"
                        onChange={(e) => setUsername(e.target.value)}
                        value={username}
                        onKeyUp={handleInputEnter}
                    />
                </div>

                <button type="button" onClick={joinRoom} className="joinButton">
                    Join Room
                </button>

                <p className="newRoomText">
                    No room yet?
                    <button
                        type="button"
                        onClick={createNewRoom}
                        className="createRoomButton"
                    >
                        Create one
                    </button>
                </p>
            </section>
        </main>
    );
}

export default Home;
