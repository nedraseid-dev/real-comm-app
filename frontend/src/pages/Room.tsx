import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import { connectSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import VideoTile from '../components/VideoTile';
import Whiteboard from '../components/Whiteboard';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

interface Peer {
  socketId: string;
  name: string;
  stream: MediaStream | null;
}

interface ChatMsg {
  from: string;
  message: string;
  at: number;
}

interface RoomFile {
  original_name: string;
  stored_name: string;
}

export default function Room() {
  const { roomCode = 'default' } = useParams();
  const { user, token } = useAuth();

  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'whiteboard' | 'files'>('chat');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [files, setFiles] = useState<RoomFile[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    socketRef.current = socket;

    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      socket.emit('join-room', { roomCode });
    })();

    socket.on('room-users', (socketIds: string[]) => {
      socketIds.forEach((id) => createPeerConnection(id, true));
    });

    socket.on('user-joined', ({ socketId, name }: { socketId: string; name: string }) => {
      setPeers((prev) => ({ ...prev, [socketId]: { socketId, name, stream: null } }));
    });

    socket.on('user-left', ({ socketId }: { socketId: string }) => {
      peerConnections.current[socketId]?.close();
      delete peerConnections.current[socketId];
      setPeers((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });

    socket.on('signal', async ({ from, data }: { from: string; data: any }) => {
      let pc = peerConnections.current[from];
      if (!pc) pc = createPeerConnection(from, false);

      if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: pc.localDescription });
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data));
        } catch (err) {
          console.error('ICE candidate error', err);
        }
      }
    });

    socket.on('chat-message', (msg: ChatMsg) => setMessages((prev) => [...prev, msg]));
    socket.on('file-shared', (file: RoomFile) => setFiles((prev) => [file, ...prev]));

    loadFiles();

    return () => {
      socket.disconnect();
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, token]);

  function createPeerConnection(remoteSocketId: string, isInitiator: boolean) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[remoteSocketId] = pc;

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('signal', { to: remoteSocketId, data: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      setPeers((prev) => ({
        ...prev,
        [remoteSocketId]: {
          socketId: remoteSocketId,
          name: prev[remoteSocketId]?.name || 'Participant',
          stream: e.streams[0],
        },
      }));
    };

    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('signal', { to: remoteSocketId, data: pc.localDescription });
      };
    }

    return pc;
  }

  function toggleMic() {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  }

  function toggleCam() {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  }

  async function toggleScreenShare() {
    if (!sharingScreen) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        sender?.replaceTrack(screenTrack);
      });

      screenTrack.onended = () => stopScreenShare();
      setSharingScreen(true);
      socketRef.current?.emit('screen-share-status', { roomCode, sharing: true });
    } else {
      stopScreenShare();
    }
  }

  function stopScreenShare() {
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (camTrack) sender?.replaceTrack(camTrack);
    });
    setSharingScreen(false);
    socketRef.current?.emit('screen-share-status', { roomCode, sharing: false });
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socketRef.current?.emit('chat-message', { roomCode, message: chatInput });
    setChatInput('');
  }

  async function loadFiles() {
    try {
      const res = await api.get(`/api/files/${roomCode}`);
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post(`/api/files/${roomCode}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      socketRef.current?.emit('file-shared', { roomCode, file: res.data });
      setFiles((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="room-layout">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="video-grid">
          <VideoTile stream={localStream} label={`${user?.name} (You)`} muted />
          {Object.values(peers).map((p) => (
            <VideoTile key={p.socketId} stream={p.stream} label={p.name} />
          ))}
        </div>
        <div className="controls">
          <button className={`btn ${micOn ? 'secondary' : 'danger'}`} onClick={toggleMic}>
            {micOn ? 'Mute' : 'Unmute'}
          </button>
          <button className={`btn ${camOn ? 'secondary' : 'danger'}`} onClick={toggleCam}>
            {camOn ? 'Stop Video' : 'Start Video'}
          </button>
          <button className={`btn ${sharingScreen ? 'danger' : 'secondary'}`} onClick={toggleScreenShare}>
            {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
          </button>
        </div>
      </div>

      <div className="sidebar">
        <div className="tabs">
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button className={tab === 'whiteboard' ? 'active' : ''} onClick={() => setTab('whiteboard')}>Whiteboard</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>Files</button>
        </div>

        {tab === 'chat' && (
          <>
            <div className="panel-body">
              {messages.map((m, i) => (
                <div className="chat-message" key={i}>
                  <span className="who">{m.from}:</span>{m.message}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', padding: 8, gap: 6 }}>
              <input
                style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: '#0f1115', color: 'white' }}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message..."
              />
              <button className="btn" onClick={sendChat}>Send</button>
            </div>
          </>
        )}

        {tab === 'whiteboard' && socketRef.current && (
          <div className="panel-body">
            <Whiteboard socket={socketRef.current} roomCode={roomCode} />
          </div>
        )}

        {tab === 'files' && (
          <div className="panel-body">
            <input type="file" onChange={handleFileUpload} style={{ marginBottom: 12 }} />
            {files.map((f, i) => (
              <div className="file-item" key={i}>
                <span>{f.original_name}</span>
                <a href={`/uploads/${f.stored_name}`} target="_blank" rel="noreferrer">Download</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
