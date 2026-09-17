import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) return socket;
  socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
    auth: { token },
  });

  socket.on('connect', () => {
    console.log('[socket] connected:', socket?.id);
  });
  socket.on('connect_error', (err) => {
    console.error('[socket] connect_error:', err.message);
  });
  socket.on('disconnect', (reason) => {
    console.warn('[socket] disconnected:', reason);
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}