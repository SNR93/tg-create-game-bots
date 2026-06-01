import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listBots, createBot, deleteBot } from '../api';

export default function BotsPage() {
  const [bots, setBots] = useState([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    listBots().then(setBots).catch(console.error);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const bot = await createBot(newName.trim());
    setCreating(false);
    setNewName('');
    navigate(`/editor/${bot.id}`);
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Удалить бота?')) return;
    await deleteBot(id);
    setBots(prev => prev.filter(b => b.id !== id));
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>🤖 TG Bot Constructor</h1>
        <p style={styles.subtitle}>Визуальный редактор Telegram-ботов</p>
      </div>

      <div style={styles.createBox}>
        <input
          style={styles.input}
          placeholder="Название нового бота..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button style={styles.btnCreate} onClick={handleCreate} disabled={creating}>
          {creating ? '...' : '+ Создать бота'}
        </button>
      </div>

      <div style={styles.grid}>
        {bots.length === 0 && (
          <div style={styles.empty}>Нет ботов. Создайте первого!</div>
        )}
        {bots.map(bot => (
          <div key={bot.id} style={styles.card} onClick={() => navigate(`/editor/${bot.id}`)}>
            <div style={styles.cardIcon}>🤖</div>
            <div style={styles.cardName}>{bot.name}</div>
            <div style={styles.cardDate}>{new Date(bot.updatedAt).toLocaleString('ru')}</div>
            <button style={styles.btnDelete} onClick={e => handleDelete(e, bot.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#12131a',
    padding: '40px 32px',
    maxWidth: 1100,
    margin: '0 auto'
  },
  header: {
    marginBottom: 40,
    textAlign: 'center'
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: '#e2e8f0',
    marginBottom: 8
  },
  subtitle: {
    color: '#718096',
    fontSize: 16
  },
  createBox: {
    display: 'flex',
    gap: 12,
    marginBottom: 40,
    maxWidth: 560,
    margin: '0 auto 40px'
  },
  input: {
    flex: 1,
    background: '#1e2030',
    border: '1px solid #2d3458',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 15,
    padding: '10px 14px',
    outline: 'none'
  },
  btnCreate: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: 'nowrap'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 18
  },
  card: {
    background: '#1e2030',
    border: '1px solid #2d3458',
    borderRadius: 12,
    padding: '22px 18px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'border-color 0.2s',
    ':hover': { borderColor: '#3b82f6' }
  },
  cardIcon: { fontSize: 32, marginBottom: 10 },
  cardName: { fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 },
  cardDate: { fontSize: 12, color: '#718096' },
  btnDelete: {
    position: 'absolute',
    top: 10,
    right: 10,
    background: 'transparent',
    border: 'none',
    color: '#718096',
    fontSize: 16,
    lineHeight: 1,
    padding: '2px 6px',
    borderRadius: 4
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    color: '#718096',
    padding: 60,
    fontSize: 16
  }
};
