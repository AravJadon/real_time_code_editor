import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

function createRoomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
        // not every broswer support randomUUID() so we first check it 
    }
    // window browser ka global object hai.

    // Browser ki bahut saari cheezein iske andar hoti hain.

    // window
    // │
    // ├── document
    // ├── location
    // ├── history
    // ├── localStorage
    // ├── sessionStorage
    // └── crypto
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function Home() {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');

    const createNewRoom = (e) => {
        e.preventDefault();
        // preventDefault() stops the browser's default behavior for an event. 
        // For example, it prevents a form from submitting or a link from navigating, 
        // allowing us to handle the event completely in JavaScript
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
            //             e
            // Keyboard Event.
            // Contains : 
            // key
            // code
            // target
            // shiftKey
            // ctrlKey
            // e.code =Batata hai kaunsi physical key press hui.
            joinRoom();
        }
    };

    return (
        // Page ka main content.
        // React me className use hota hai, class nahi.
        <main className="homePage"> 
            <section className="homeCard" aria-label="Join room">
                <img
                    className="homeLogo"
                    src="/images/synccode_logo_highres.png"
                    alt="SyncCode Logo"
                    // image load na ho ya screen reader ke liye description.
                />

                <div className="homeHeading">
                    <h1>SyncCode</h1>
                    <p>Real-time collaborative code editor</p>
                </div>

                <div className="homeForm">
                    <label htmlFor="roomId">Room ID</label> {/*Displays the field name*/} 
                    <input
                        id="roomId"
                        type="text"
                        placeholder="Paste or create a room ID"
                        value={roomId}
                        // Input ki value React state se aa rahi hai.
                        // Isko Controlled Component kehte hain.
                        // User type karta hai, lekin React decide karta hai ki input box me kya dikhna chahiye.
                        // Whenever input value changes → onChange runs → setRoomId updates state → component re-renders.
                        // normal htl input me value broswer store karta he 
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


//A Hook lets a functional component use React features.
// use state- allows the component to store data across re renders
// use effect- allows the component to perform side effects.
// use context- allows the component to access the context provided by the closest parent component.
// use reducer- allows the component to manage complex state.
// use callback- allows the component to memoize callback functions.
// use memo- allows the component to memoize values.
// use ref- allows the component to store mutable values that persist across renders without causing re-renders.

// React me reload aur re-render alag cheezein hain.

// reload -Pura HTML dubara load hota hai.
// JavaScript dobara execute hota hai.
// React app fir se start hoti hai.

// re-render - React component dubara render hota hai.
// sirf UI update hota hai.
// Component state badalta hai tab hota hai.
// Props badalte hain tab hota hai.
// Parent render hota hai tab hota hai.

// Button ke 3 types hote hain:

// button -- onClick wal function chalega 
// submit
// reset