import { io } from 'socket.io-client';
import { BACKEND_URL } from './config';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnectionAttempts: Infinity,
        timeout: 10000,
        transports: ['websocket', 'polling'],
    };
    return io(BACKEND_URL, options);
};
