import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Room from './pages/Room';

function Lobby() {
  const [code, setCode] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim()) navigate(`/room/${code.trim()}`);
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={joinRoom}>
        <h1>Welcome, {user?.name}</h1>
        <div className="field">
          <label>Room code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. team-standup" required />
        </div>
        <button className="btn" type="submit" style={{ width: '100%', marginBottom: 10 }}>Join Room</button>
        <button className="btn secondary" type="button" style={{ width: '100%' }} onClick={logout}>Log out</button>
      </form>
    </div>
  );
}

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<PrivateRoute><Lobby /></PrivateRoute>} />
          <Route path="/room/:roomCode" element={<PrivateRoute><Room /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
