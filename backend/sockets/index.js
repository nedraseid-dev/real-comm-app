const jwt = require('jsonwebtoken');

// roomCode -> Set of socket ids
const rooms = new Map();

function registerSocketHandlers(io) {
  // Auth guard: every socket connection must present a valid JWT
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.user?.name})`);

    socket.on('join-room', ({ roomCode }) => {
      socket.join(roomCode);
      if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
      rooms.get(roomCode).add(socket.id);

      // Tell existing participants a new peer joined (they will initiate the WebRTC offer)
      socket.to(roomCode).emit('user-joined', {
        socketId: socket.id,
        name: socket.user?.name,
      });

      // Send the new participant the list of who's already in the room
      const others = [...rooms.get(roomCode)].filter((id) => id !== socket.id);
      socket.emit('room-users', others);
    });

    // --- WebRTC signaling relay (offer/answer/ICE candidates) ---
    socket.on('signal', ({ to, data }) => {
      io.to(to).emit('signal', { from: socket.id, data });
    });

    // --- Screen sharing is just a renegotiated WebRTC track, signaled the same way,
    //     but we broadcast an explicit event so UI can show "X is sharing their screen" ---
    socket.on('screen-share-status', ({ roomCode, sharing }) => {
      socket.to(roomCode).emit('screen-share-status', { socketId: socket.id, sharing });
    });

    // --- Whiteboard sync: broadcast drawing events to everyone else in the room ---
    socket.on('whiteboard-draw', ({ roomCode, stroke }) => {
      socket.to(roomCode).emit('whiteboard-draw', stroke);
    });

    socket.on('whiteboard-clear', ({ roomCode }) => {
      socket.to(roomCode).emit('whiteboard-clear');
    });

    // --- File sharing notification (actual bytes go over HTTP upload route) ---
    socket.on('file-shared', ({ roomCode, file }) => {
      socket.to(roomCode).emit('file-shared', file);
    });

    // --- Simple chat alongside the call ---
    socket.on('chat-message', ({ roomCode, message }) => {
      io.to(roomCode).emit('chat-message', {
        from: socket.user?.name,
        message,
        at: Date.now(),
      });
    });

    socket.on('disconnecting', () => {
      for (const roomCode of socket.rooms) {
        if (rooms.has(roomCode)) {
          rooms.get(roomCode).delete(socket.id);
          socket.to(roomCode).emit('user-left', { socketId: socket.id });
        }
      }
    });
  });
}

module.exports = registerSocketHandlers;
