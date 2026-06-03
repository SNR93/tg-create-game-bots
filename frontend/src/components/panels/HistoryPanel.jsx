import React from 'react';

export default function HistoryPanel({ snapshots, onRestore, onCompare, onComment, onDelete, onClose }) {
  const list = [...snapshots].reverse();

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>История сохранений</span>
        <button style={s.closeBtn} onClick={onClose}>×</button>
      </div>
      <div style={s.list}>
        {list.length === 0 ? (
          <div style={s.empty}>
            Нет снапшотов.<br />
            <span style={{ color: '#4a5568' }}>Нажмите Ctrl+S для создания.</span>
          </div>
        ) : list.map((snap, i) => (
          <div key={snap.timestamp} style={s.item}>
            <div style={s.itemInfo}>
              <div style={s.itemLabel} title={snap.comment || undefined}>
                {snap.label || `Снапшот #${snapshots.length - i}`}
              </div>
              <div style={s.itemDate}>
                {new Date(snap.timestamp).toLocaleString('ru')}
              </div>
              <div style={s.itemMeta}>
                {snap.nodes?.length ?? 0} нод · {snap.edges?.length ?? 0} связей
              </div>
            </div>
            <div style={s.btnGroup}>
              <button style={s.iconBtn} title="Комментарий" aria-label="Комментарий" onClick={() => onComment(snap)}>
                💬
              </button>
              <button style={s.iconBtn} title="Сравнить" aria-label="Сравнить" onClick={() => onCompare(snap)}>
                🔍
              </button>
              <button style={s.iconBtn} title="Восстановить" aria-label="Восстановить" onClick={() => onRestore(snap)}>
                ↩
              </button>
              <button style={{ ...s.iconBtn, ...s.deleteBtn }} title="Удалить" aria-label="Удалить" onClick={() => onDelete(snap)}>
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 290,
    background: '#1a1c2a', borderLeft: '1px solid #2d3458',
    zIndex: 10, display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #2d3458', flexShrink: 0,
  },
  title: { fontWeight: 700, fontSize: 14, color: '#e2e8f0' },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#718096',
    fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  list: { flex: 1, overflowY: 'auto' },
  empty: {
    padding: 28, color: '#718096', textAlign: 'center', fontSize: 13, lineHeight: 1.8,
  },
  item: {
    padding: '12px 14px', borderBottom: '1px solid #222436',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  itemInfo: {},
  itemLabel: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2, cursor: 'default' },
  itemDate: { fontSize: 11, color: '#718096' },
  itemMeta: { fontSize: 11, color: '#4a5568', marginTop: 2 },
  btnGroup: { display: 'flex', gap: 6 },
  iconBtn: {
    width: 32, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e2030', border: '1px solid #3a3f55',
    borderRadius: 6, color: '#cbd5e1', fontSize: 15,
    padding: 0, cursor: 'pointer', fontWeight: 700,
  },
  deleteBtn: { color: '#f87171', borderColor: '#7f1d1d', fontSize: 20, lineHeight: 1 },
};
