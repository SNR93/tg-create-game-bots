import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBots, createBot, deleteBot, updateBotComment } from '../api';

export default function BotsPage({ user, onLogout }) {
  const [bots, setBots] = useState([]);
  const [newName, setNewName] = useState('');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [commentStatus, setCommentStatus] = useState({});
  const navigate = useNavigate();

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
        <button style={styles.btnSecondary} onClick={onLogout}>Выйти</button>
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
        <input
          style={styles.commentInput}
          placeholder="Комментарий о боте"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
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
              <button style={styles.btnDelete} onClick={e => handleDelete(e, bot.id)}>Удалить</button>
            </div>
            <div style={styles.createdByCell}>{bot.createdBy || 'unknown'}</div>
            <div style={styles.commentCell}>
              <textarea
                style={styles.commentArea}
                value={comments[bot.id] || ''}
                maxLength={500}
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
