import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import BotsPage from './pages/BotsPage';
import EditorPage from './pages/EditorPage';
import LoginPage from './pages/LoginPage';
import { getCurrentUser, logout } from './api';
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    logout();
    setUser(null);
  }

  if (loading) return <div style={{ padding: 32 }}>Загрузка...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={setUser} />} />
        <Route path="/" element={user ? <BotsPage user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/editor/:id" element={user ? <EditorPage user={user} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
