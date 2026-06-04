import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, createBot, createUser, deleteBot, deleteUser, getProfile, listBots, listUsers, updateBotComment, updateProfile, updateUser, uploadProfileAvatar } from '../api';

export default function BotsPage({ user, onLogout }) {
  const [bots, setBots] = useState([]);
  const [newName, setNewName] = useState('');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [commentStatus, setCommentStatus] = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const navigate = useNavigate();
  const canManageUsers = user?.login === 'admin' || user?.login === 'SNR93' || user?.role === 'admin';

  useEffect(() => {
    listBots()
      .then(items => {
        setBots(items);
        setComments(Object.fromEntries(items.map(bot => [bot.id, bot.comment || ''])));
      })
      .catch(err => setError(err.message));
  }, []);

  const sortedBots = useMemo(() => (
    [...bots].sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
  ), [bots]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError('Укажите название бота');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const bot = await createBot(name, newComment);
      setNewName('');
      setNewComment('');
      navigate(`/editor/${bot.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Удалить бота?')) return;
    try {
      await deleteBot(id);
      setBots(prev => prev.filter(bot => bot.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCommentSave(id) {
    const comment = comments[id] || '';
    setCommentStatus(prev => ({ ...prev, [id]: 'saving' }));
    try {
      const updated = await updateBotComment(id, comment);
      setBots(prev => prev.map(bot => (bot.id === id ? { ...bot, ...updated } : bot)));
      setCommentStatus(prev => ({ ...prev, [id]: 'saved' }));
      window.setTimeout(() => {
        setCommentStatus(prev => ({ ...prev, [id]: '' }));
      }, 1200);
    } catch (err) {
      setCommentStatus(prev => ({ ...prev, [id]: 'error' }));
      setError(err.message);
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>TG Bot Constructor</h1>
          <p style={styles.subtitle}>Пользователь: {user?.login}</p>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.btnSecondary} onClick={() => setShowProfile(true)}>Профиль</button>
          {canManageUsers && <button style={styles.btnSecondary} onClick={() => setShowUsers(true)}>Пользователи</button>}
          <button style={styles.btnSecondary} onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <section style={styles.createBox}>
        <input
          style={styles.input}
          placeholder="Название нового бота"
          value={newName}
          onChange={e => { setNewName(e.target.value); if (error) setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...styles.input, width: '100%', boxSizing: 'border-box', paddingRight: 52 }}
            placeholder="Комментарий о боте"
            value={newComment}
            maxLength={170}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <span style={styles.charHint}>{newComment.length}/170</span>
        </div>
        <button style={styles.btnCreate} onClick={handleCreate} disabled={creating}>
          {creating ? 'Создание...' : 'Создать бота'}
        </button>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.cards}>
        {sortedBots.length === 0 && <div style={styles.empty}>Ботов пока нет</div>}
        {sortedBots.map(bot => {
          const commentVal = comments[bot.id] || '';
          const canDelete = user?.login === 'admin' || user?.login === 'SNR93' || bot.createdBy === user?.login;
          return (
            <div key={bot.id} style={styles.card}>
              {/* Top: name + date + delete */}
              <div style={styles.cardTop}>
                <button style={styles.botName} onClick={() => navigate(`/editor/${bot.id}`)}>
                  {bot.name}
                </button>
                <div style={styles.cardTopRight}>
                  <span style={styles.cardDate}>
                    {bot.createdAt ? new Date(bot.createdAt).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {canDelete && (
                    <button style={styles.btnDelete} onClick={e => handleDelete(e, bot.id)}>Удалить</button>
                  )}
                </div>
              </div>
              {/* Bottom: creator + comment */}
              <div style={styles.cardBottom}>
                <div style={styles.creatorBlock}>
                  <UserAvatar login={bot.createdBy} size={40} />
                  <span style={styles.creatorName}>{bot.createdBy || 'unknown'}</span>
                </div>
                <div style={styles.commentBlock}>
                  <textarea
                    style={styles.commentArea}
                    value={commentVal}
                    maxLength={170}
                    rows={3}
                    placeholder="Комментарий о боте..."
                    onChange={e => setComments(prev => ({ ...prev, [bot.id]: e.target.value }))}
                    onBlur={() => handleCommentSave(bot.id)}
                  />
                  <div style={styles.commentFooter}>
                    <span style={{ color: commentVal.length >= 160 ? '#f87171' : '#475569' }}>
                      {commentVal.length}/170
                    </span>
                    <span style={{ color: commentStatus[bot.id] === 'error' ? '#f87171' : '#475569' }}>
                      {commentStatus[bot.id] === 'saving' && 'Сохранение...'}
                      {commentStatus[bot.id] === 'saved' && '✓ Сохранено'}
                      {commentStatus[bot.id] === 'error' && 'Ошибка'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onUser={profile => {}} />}
      {showUsers && <UsersModal currentUser={user} onClose={() => setShowUsers(false)} />}
    </div>
  );
}

function UserAvatar({ login, size = 22 }) {
  const safeName = (login || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const [src, setSrc] = useState(`/api/media/avatars/${safeName}.png`);
  const [gone, setGone] = useState(false);
  if (!login || gone) return null;
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #2d3458' }}
      onError={() => {
        if (src.endsWith('.png')) setSrc(`/api/media/avatars/${safeName}.jpg`);
        else setGone(true);
      }}
    />
  );
}

function ProfileModal({ onClose }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ avatar: '', about: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    getProfile().then(data => {
      setProfile(data);
      setForm({ avatar: data.avatar || '', about: data.about || '' });
    }).catch(error => setError(error.message));
  }, []);

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadProfileAvatar(file);
      setForm(v => ({ ...v, avatar: res.url }));
      setStatus('Аватар загружен — нажмите «Сохранить профиль»');
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    e.target.value = '';
  }

  async function saveProfile() {
    setError('');
    try {
      const saved = await updateProfile(form);
      setProfile(saved);
      setStatus('Профиль сохранён');
    } catch (error) { setError(error.message); }
  }

  async function savePassword() {
    setError('');
    try {
      await changePassword(passwords.currentPassword, passwords.newPassword);
      setPasswords({ currentPassword: '', newPassword: '' });
      setStatus('Пароль изменён');
    } catch (error) { setError(error.message); }
  }

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div>
            <div style={styles.modalTitle}>Профиль</div>
            <div style={styles.modalSub}>{profile?.login || ''}</div>
          </div>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        {form.avatar && <img src={form.avatar} alt="" style={styles.avatarPreview} />}
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 0 }}>
          <input
            style={{ ...styles.input, flex: 1, marginBottom: 0 }}
            placeholder="URL аватара"
            value={form.avatar}
            onChange={e => setForm(v => ({ ...v, avatar: e.target.value }))}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={handleAvatarFile}
          />
          <button
            style={{ ...styles.btnSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Загрузить с компьютера (PNG, JPG)"
          >
            {uploading ? '...' : '📁 Загрузить'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, marginTop: 3 }}>PNG, JPG или JPEG · максимум 5 МБ</div>
        <textarea style={styles.profileText} rows={5} placeholder="О себе" value={form.about} onChange={e => setForm(v => ({ ...v, about: e.target.value }))} />
        <button style={styles.btnCreate} onClick={saveProfile}>Сохранить профиль</button>
        <div style={styles.passwordGrid}>
          <input style={styles.input} type="password" placeholder="Текущий пароль" value={passwords.currentPassword} onChange={e => setPasswords(v => ({ ...v, currentPassword: e.target.value }))} />
          <input style={styles.input} type="password" placeholder="Новый пароль" value={passwords.newPassword} onChange={e => setPasswords(v => ({ ...v, newPassword: e.target.value }))} />
          <button style={styles.btnSecondary} onClick={savePassword}>Изменить пароль</button>
        </div>
        {status && <div style={styles.ok}>{status}</div>}
        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

function UsersModal({ currentUser, onClose }) {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState({ login: '', password: '', role: 'user', avatar: '', about: '' });
  const [error, setError] = useState('');

  const load = () => listUsers().then(setUsers).catch(error => setError(error.message));
  useEffect(() => { load(); }, []);

  async function addUser() {
    setError('');
    try {
      await createUser(draft);
      setDraft({ login: '', password: '', role: 'user', avatar: '', about: '' });
      await load();
    } catch (error) { setError(error.message); }
  }

  async function patch(login, data) {
    setError('');
    try {
      const saved = await updateUser(login, data);
      setUsers(list => list.map(user => user.login === login ? saved : user));
    } catch (error) { setError(error.message); }
  }

  async function remove(login) {
    if (!confirm(`Удалить пользователя ${login}?`)) return;
    setError('');
    try {
      await deleteUser(login);
      setUsers(list => list.filter(user => user.login !== login));
    } catch (error) { setError(error.message); }
  }

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={{ ...styles.modal, width: 760 }} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div>
            <div style={styles.modalTitle}>Пользователи</div>
            <div style={styles.modalSub}>Создание, права, профили</div>
          </div>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.userCreate}>
          <input style={styles.input} placeholder="login" value={draft.login} onChange={e => setDraft(v => ({ ...v, login: e.target.value }))} />
          <input style={styles.input} placeholder="password" type="password" value={draft.password} onChange={e => setDraft(v => ({ ...v, password: e.target.value }))} />
          <select style={styles.input} value={draft.role} onChange={e => setDraft(v => ({ ...v, role: e.target.value }))}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button style={styles.btnCreate} onClick={addUser}>Создать</button>
        </div>
        <div style={styles.userList}>
          {users.map(item => (
            <div key={item.login} style={styles.userRow}>
              <div style={styles.userIdentity}>
                {item.avatar ? <img src={item.avatar} alt="" style={styles.userAvatar} /> : <div style={styles.userAvatarFallback}>{item.login.slice(0, 1).toUpperCase()}</div>}
                <div>
                  <div style={styles.userLogin}>{item.login}</div>
                  <div style={styles.userAbout}>{item.about || 'Профиль не заполнен'}</div>
                </div>
              </div>
              <select style={styles.smallSelect} value={item.role || 'user'} onChange={e => patch(item.login, { role: e.target.value })} disabled={item.login === 'admin'}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <button style={styles.btnDelete} disabled={item.login === 'admin' || item.login === currentUser?.login} onClick={() => remove(item.login)}>Удалить</button>
            </div>
          ))}
        </div>
        {error && <div style={styles.error}>{error}</div>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#12131a',
    padding: '32px',
    maxWidth: 1240,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 28,
  },
  headerActions: { display: 'flex', gap: 8, alignItems: 'center' },
  title: {
    fontSize: 30,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 6,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  createBox: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 260px) 1fr auto',
    gap: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  charHint: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 11,
    color: '#475569',
    pointerEvents: 'none',
  },
  input: {
    background: '#1e2030',
    border: '1px solid #2d3458',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 15,
    padding: '11px 14px',
    outline: 'none',
    minWidth: 0,
  },
  btnCreate: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px 18px',
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  btnSecondary: {
    background: '#1e2030',
    color: '#e2e8f0',
    border: '1px solid #2d3458',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
  },
  error: {
    color: '#fecaca',
    background: '#3b1720',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 14,
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    background: '#171925',
    border: '1px solid #2d3458',
    borderRadius: 10,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px 10px',
    borderBottom: '1px solid #252840',
  },
  cardTopRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  cardDate: {
    color: '#64748b',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  botName: {
    background: 'transparent',
    border: 'none',
    color: '#bfdbfe',
    fontSize: 16,
    fontWeight: 700,
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
    letterSpacing: 0.1,
  },
  btnDelete: {
    background: 'transparent',
    border: '1px solid #7f1d1d',
    color: '#fca5a5',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  cardBottom: {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    gap: 0,
    minHeight: 90,
  },
  creatorBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 16px',
    borderRight: '1px solid #252840',
    background: '#12131a',
  },
  creatorName: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
    wordBreak: 'break-all',
  },
  commentBlock: {
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  commentArea: {
    width: '100%',
    flex: 1,
    resize: 'none',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    color: '#cbd5e1',
    padding: '6px 8px',
    fontSize: 14,
    lineHeight: 1.5,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  commentFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    paddingLeft: 2,
  },
  modalOverlay: { position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(3,6,16,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: 520, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', background: '#171925', border: '1px solid #2d3458', borderRadius: 10, padding: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.55)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: 800 },
  modalSub: { color: '#94a3b8', fontSize: 13, marginTop: 3 },
  modalClose: { background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 26, cursor: 'pointer' },
  avatarPreview: { width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #2d3458', marginBottom: 10 },
  profileText: { width: '100%', boxSizing: 'border-box', marginTop: 10, marginBottom: 10, background: '#1e2030', border: '1px solid #2d3458', borderRadius: 8, color: '#e2e8f0', fontSize: 14, padding: 10, resize: 'vertical', fontFamily: 'inherit' },
  passwordGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center', marginTop: 14 },
  ok: { color: '#bbf7d0', background: '#12321f', border: '1px solid #166534', borderRadius: 8, padding: '9px 10px', marginTop: 12 },
  userCreate: { display: 'grid', gridTemplateColumns: '1fr 1fr 110px auto', gap: 8, marginBottom: 12 },
  userList: { display: 'flex', flexDirection: 'column', gap: 8 },
  userRow: { display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 10, alignItems: 'center', background: '#111827', border: '1px solid #2d3458', borderRadius: 8, padding: 10 },
  userIdentity: { display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 },
  userAvatar: { width: 38, height: 38, objectFit: 'cover', borderRadius: 6 },
  userAvatarFallback: { width: 38, height: 38, borderRadius: 6, background: '#293056', color: '#bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  userLogin: { color: '#e2e8f0', fontWeight: 700 },
  userAbout: { color: '#94a3b8', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  smallSelect: { background: '#1e2030', border: '1px solid #2d3458', borderRadius: 6, color: '#e2e8f0', padding: '7px 8px' },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    padding: '48px 0',
    fontSize: 15,
  },
};
