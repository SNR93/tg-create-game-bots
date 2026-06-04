import React, { useEffect, useMemo, useRef, useState } from 'react';
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
          onChange={e => {
            setNewName(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <textarea
          style={styles.commentInput}
          placeholder="Комментарий о боте"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreate(); }}
          rows={Math.max(1, Math.ceil((newComment.length || 1) / 70))}
        />
        <button style={styles.btnCreate} onClick={handleCreate} disabled={creating}>
          {creating ? 'Создание...' : 'Создать бота'}
        </button>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.tableWrap}>
        <div style={styles.tableHeader}>
          <div>Дата создания</div>
          <div>Название</div>
          <div>Кто создал</div>
          <div>Комментарий о боте</div>
        </div>

        {sortedBots.length === 0 && (
          <div style={styles.empty}>Ботов пока нет</div>
        )}

        {sortedBots.map(bot => (
          <div key={bot.id} style={styles.row}>
            <div style={styles.dateCell}>
              {bot.createdAt ? new Date(bot.createdAt).toLocaleString('ru') : 'Дата неизвестна'}
            </div>
            <div style={styles.nameCell}>
              <button style={styles.botName} onClick={() => navigate(`/editor/${bot.id}`)}>
                {bot.name}
              </button>
              {(user?.login === 'admin' || user?.login === 'SNR93' || bot.createdBy === user?.login) && (
                <button style={styles.btnDelete} onClick={e => handleDelete(e, bot.id)}>Удалить</button>
              )}
            </div>
            <div style={styles.createdByCell}>{bot.createdBy || 'unknown'}</div>
            <div style={styles.commentCell}>
              <textarea
                style={styles.commentArea}
                value={comments[bot.id] || ''}
                maxLength={500}
                rows={Math.max(2, Math.ceil(((comments[bot.id] || '').length || 1) / 58))}
                placeholder="Добавить комментарий"
                onChange={e => setComments(prev => ({ ...prev, [bot.id]: e.target.value }))}
                onBlur={() => handleCommentSave(bot.id)}
              />
              <div style={styles.commentMeta}>
                {commentStatus[bot.id] === 'saving' && 'Сохранение...'}
                {commentStatus[bot.id] === 'saved' && 'Сохранено'}
                {commentStatus[bot.id] === 'error' && 'Ошибка'}
              </div>
            </div>
          </div>
        ))}
      </section>
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onUser={profile => {}} />}
      {showUsers && <UsersModal currentUser={user} onClose={() => setShowUsers(false)} />}
    </div>
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
    gridTemplateColumns: 'minmax(180px, 280px) minmax(220px, 1fr) auto',
    gap: 12,
    marginBottom: 14,
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
  commentInput: {
    background: '#1e2030',
    border: '1px solid #2d3458',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 15,
    padding: '11px 14px',
    outline: 'none',
    minWidth: 0,
    resize: 'vertical',
    lineHeight: 1.35,
    fontFamily: 'inherit',
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
  tableWrap: {
    border: '1px solid #2d3458',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#171925',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '190px minmax(220px, 1fr) 150px minmax(280px, 1.4fr)',
    gap: 0,
    background: '#202437',
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 600,
    padding: '12px 14px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '190px minmax(220px, 1fr) 150px minmax(280px, 1.4fr)',
    gap: 0,
    alignItems: 'start',
    borderTop: '1px solid #2d3458',
    padding: '14px',
  },
  dateCell: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 1.4,
    paddingRight: 14,
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingRight: 14,
  },
  botName: {
    background: 'transparent',
    border: 'none',
    color: '#bfdbfe',
    fontSize: 15,
    fontWeight: 600,
    padding: 0,
    textAlign: 'left',
    overflowWrap: 'anywhere',
  },
  btnDelete: {
    background: '#2a1820',
    border: '1px solid #7f1d1d',
    color: '#fecaca',
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  createdByCell: {
    color: '#e2e8f0',
    fontSize: 14,
    paddingRight: 14,
    overflowWrap: 'anywhere',
  },
  commentCell: {
    minWidth: 0,
  },
  commentArea: {
    width: '100%',
    minHeight: 58,
    height: 'auto',
    resize: 'vertical',
    background: '#111827',
    border: '1px solid #2d3458',
    borderRadius: 8,
    color: '#e2e8f0',
    padding: '9px 10px',
    fontSize: 14,
    lineHeight: 1.4,
    outline: 'none',
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
  commentMeta: {
    minHeight: 18,
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
  },
  empty: {
    color: '#94a3b8',
    textAlign: 'center',
    padding: 42,
    borderTop: '1px solid #2d3458',
  },
};
