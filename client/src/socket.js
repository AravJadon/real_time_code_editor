import { io } from 'socket.io-client';
import { BACKEND_URL } from './config';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnectionAttempts: Infinity,
        timeout: 10000,
        transports: ['websocket', 'polling'],
        // Priority order:
// 1️⃣ Pehle direct pure websocket try karo (jo fastest aur low-latency hota hai).
// 2️⃣ Agar user ke college/office Wi-Fi me WebSocket blocked ho, toh backup ke liye HTTP polling par switch ho jao.
    };
    return io(BACKEND_URL, options);
};
