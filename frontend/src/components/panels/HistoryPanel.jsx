import React from 'react';

export default function HistoryPanel({ snapshots, onRestore, onCompare, onClose }) {
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
              <div style={s.itemLabel}>
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
              <button style={s.btnCompare} onClick={() => onCompare(snap)}>
                Сравнить
              </button>
              <button style={s.btnRestore} onClick={() => onRestore(snap)}>
                Восстановить
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
  itemLabel: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 },
  itemDate:  { fontSize: 11, color: '#718096' },
  itemMeta:  { fontSize: 11, color: '#4a5568', marginTop: 2 },
  btnGroup: { display: 'flex', gap: 6 },
  btnCompare: {
    flex: 1, background: '#1e2030', border: '1px solid #3b82f6',
    borderRadius: 6, color: '#3b82f6', fontSize: 12,
    padding: '5px 0', cursor: 'pointer', fontWeight: 600,
  },
  btnRestore: {
    flex: 1, background: '#2a2d3e', border: '1px solid #3a3f55',
    borderRadius: 6, color: '#a0aec0', fontSize: 12,
    padding: '5px 0', cursor: 'pointer',
  },
};
