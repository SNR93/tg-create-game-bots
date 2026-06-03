import React, { useEffect, useRef, useState } from 'react';
import { getNodeHistory, saveNodeHistorySnapshot, updateNodeHistoryComment, deleteNodeHistoryEntry } from '../../api';

function formatMsk(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function diffData(from, to, path = '') {
  const changes = [];
  if (from === undefined && to === undefined) return changes;
  if (typeof from !== 'object' || typeof to !== 'object' || from === null || to === null || Array.isArray(from) || Array.isArray(to)) {
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ path: path || '(root)', from, to });
    }
    return changes;
  }
  const keys = new Set([...Object.keys(from || {}), ...Object.keys(to || {})]);
  for (const key of keys) {
    if (key === '__expanded' || key === '__debugActive') continue;
    const subPath = path ? `${path}.${key}` : key;
    const fv = from?.[key];
    const tv = to?.[key];
    if (JSON.stringify(fv) === JSON.stringify(tv)) continue;
    if (typeof fv === 'object' && typeof tv === 'object' && fv !== null && tv !== null && !Array.isArray(fv) && !Array.isArray(tv)) {
      changes.push(...diffData(fv, tv, subPath));
    } else {
      changes.push({ path: subPath, from: fv, to: tv });
    }
  }
  return changes;
}

function displayValue(v) {
  if (v === undefined) return <em style={{ color: '#4a5568' }}>—</em>;
  if (v === null) return <em style={{ color: '#4a5568' }}>null</em>;
  if (typeof v === 'boolean') return <span style={{ color: '#f6ad55' }}>{String(v)}</span>;
  if (typeof v === 'number') return <span style={{ color: '#68d391' }}>{v}</span>;
  if (typeof v === 'string') return <span style={{ color: '#e2e8f0' }}>"{v.length > 80 ? v.slice(0, 80) + '…' : v}"</span>;
  return <span style={{ color: '#a78bfa' }}>{JSON.stringify(v).slice(0, 100)}</span>;
}

function DiffView({ from, to }) {
  const changes = diffData(from, to);
  if (changes.length === 0) return <div style={ds.noChanges}>Изменений нет</div>;
  return (
    <div style={ds.diffWrap}>
      {changes.map((c, i) => (
        <div key={i} style={ds.diffRow}>
          <div style={ds.diffPath}>{c.path}</div>
          <div style={ds.diffLine}>
            <span style={ds.was}>Было: </span>{displayValue(c.from)}
          </div>
          <div style={ds.diffLine}>
            <span style={ds.became}>Стало: </span>{displayValue(c.to)}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryEntry({ entry, currentData, onRestore, onDelete, onCommentSave }) {
  const [expanded, setExpanded] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [editComment, setEditComment] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleCommentSave() {
    setSaving(true);
    await onCommentSave(entry.id, editComment);
    setSaving(false);
    setEditComment(null);
  }

  return (
    <div style={s.entry}>
      <div style={s.entryHead} onClick={() => { setExpanded(v => !v); setComparing(false); }}>
        <span style={s.arrow}>{expanded ? '▼' : '▶'}</span>
        <div style={s.entryMeta}>
          <span style={s.entryTime}>{formatMsk(entry.ts)}</span>
          <span style={s.entryAuthor}>· {entry.author}</span>
        </div>
        {entry.comment && <span style={s.entryComment}>{entry.comment}</span>}
      </div>

      {expanded && (
        <div style={s.entryBody}>
          {/* Comment editor */}
          <div style={s.commentRow}>
            {editComment === null ? (
              <>
                <span style={s.commentText}>{entry.comment || <em style={{ color: '#4a5568' }}>без комментария</em>}</span>
                <button style={s.miniBtn} onClick={() => setEditComment(entry.comment || '')}>✏️</button>
              </>
            ) : (
              <>
                <input
                  style={s.commentInput}
                  value={editComment}
                  placeholder="Комментарий к изменению..."
                  maxLength={500}
                  onChange={e => setEditComment(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setEditComment(null); }}
                  autoFocus
                />
                <button style={s.miniBtn} disabled={saving} onClick={handleCommentSave}>💾</button>
                <button style={s.miniBtn} onClick={() => setEditComment(null)}>✕</button>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={s.entryActions}>
            <button style={s.actionBtn} onClick={() => setComparing(v => !v)}>
              {comparing ? 'Скрыть сравнение' : '🔍 Сравнить с текущим'}
            </button>
            <button style={{ ...s.actionBtn, color: '#68d391' }} onClick={() => onRestore(entry.data)}>
              ↩ Восстановить
            </button>
            <button style={{ ...s.actionBtn, color: '#fc8181' }} onClick={() => onDelete(entry.id)}>
              🗑 Удалить
            </button>
          </div>

          {/* Diff */}
          {comparing && <DiffView from={entry.data} to={currentData} />}
        </div>
      )}
    </div>
  );
}

export default function NodeHistoryPanel({ node, botId, currentData, onRestore, onClose }) {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshotComment, setSnapshotComment] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  useEffect(() => {
    setLoading(true);
    getNodeHistory(botId, node.id)
      .then(data => { setEntries(data); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [botId, node.id]);

  async function handleSaveSnapshot() {
    setSavingSnapshot(true);
    try {
      const entry = await saveNodeHistorySnapshot(botId, node.id, snapshotComment);
      setEntries(prev => [entry, ...(prev || [])]);
      setSnapshotComment('');
    } catch (e) { setError(e.message); }
    finally { setSavingSnapshot(false); }
  }

  async function handleCommentSave(entryId, comment) {
    await updateNodeHistoryComment(botId, node.id, entryId, comment);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, comment } : e));
  }

  async function handleDelete(entryId) {
    if (!confirm('Удалить эту запись истории?')) return;
    await deleteNodeHistoryEntry(botId, node.id, entryId);
    setEntries(prev => prev.filter(e => e.id !== entryId));
  }

  function handleRestore(data) {
    if (!confirm('Восстановить эту версию ноды? Несохранённые изменения будут потеряны. Для сохранения нажмите Ctrl+S.')) return;
    onRestore(data);
    onClose();
  }

  const nodeTitle = node.data?.title || node.type || 'Нода';

  return (
    <div style={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.panel}>
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>🕐 История изменений</div>
            <div style={s.headerSub}>{nodeTitle} · ID {node.data?.nodeId || node.id.slice(0, 7)}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Manual snapshot */}
        <div style={s.snapshotRow}>
          <input
            style={s.snapshotInput}
            value={snapshotComment}
            placeholder="Комментарий к снимку (необязательно)..."
            maxLength={500}
            onChange={e => setSnapshotComment(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleSaveSnapshot(); }}
          />
          <button style={s.snapshotBtn} disabled={savingSnapshot} onClick={handleSaveSnapshot}>
            {savingSnapshot ? '...' : '💾 Сохранить снимок'}
          </button>
        </div>

        <div style={s.body}>
          {loading && <div style={s.status}>Загрузка...</div>}
          {error && <div style={s.errorMsg}>{error}</div>}
          {!loading && !error && entries?.length === 0 && (
            <div style={s.status}>
              История пуста. Изменения автоматически записываются при каждом сохранении (Ctrl+S).
            </div>
          )}
          {(entries || []).map(entry => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              currentData={currentData}
              onRestore={handleRestore}
              onDelete={handleDelete}
              onCommentSave={handleCommentSave}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
  },
  panel: {
    width: 480, maxWidth: '96vw', height: '100vh',
    background: '#1a1c2a', borderLeft: '1px solid #2d3458',
    display: 'flex', flexDirection: 'column',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '16px 18px', borderBottom: '1px solid #2d3458',
    background: '#1e2030', flexShrink: 0,
  },
  headerTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: 700 },
  headerSub: { color: '#718096', fontSize: 12, marginTop: 2 },
  closeBtn: { background: 'transparent', border: 'none', color: '#718096', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 },
  snapshotRow: {
    display: 'flex', gap: 8, padding: '10px 14px',
    borderBottom: '1px solid #222436', flexShrink: 0, background: '#12131a',
  },
  snapshotInput: {
    flex: 1, background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 12, padding: '6px 9px', outline: 'none',
  },
  snapshotBtn: {
    background: '#2563eb', border: 'none', borderRadius: 6,
    color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 11px', cursor: 'pointer', flexShrink: 0,
  },
  body: { flex: 1, overflowY: 'auto', padding: '6px 0' },
  status: { color: '#718096', fontSize: 13, padding: '20px 16px', textAlign: 'center', lineHeight: 1.6 },
  errorMsg: { color: '#fc8181', fontSize: 12, padding: '12px 16px' },
  entry: { borderBottom: '1px solid #1e2030' },
  entryHead: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', cursor: 'pointer',
    userSelect: 'none',
    ':hover': { background: '#1e2030' },
  },
  arrow: { color: '#4a5568', fontSize: 10, flexShrink: 0 },
  entryMeta: { display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 },
  entryTime: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
  entryAuthor: { color: '#718096', fontSize: 12 },
  entryComment: { color: '#a78bfa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  entryBody: { padding: '6px 14px 12px', background: '#12131a' },
  commentRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  commentText: { flex: 1, color: '#718096', fontSize: 12, fontStyle: 'italic' },
  commentInput: {
    flex: 1, background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 5,
    color: '#e2e8f0', fontSize: 12, padding: '5px 8px', outline: 'none',
  },
  miniBtn: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', color: '#718096' },
  entryActions: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  actionBtn: {
    background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 5,
    color: '#a0aec0', fontSize: 11, padding: '4px 9px', cursor: 'pointer',
  },
};

const ds = {
  diffWrap: { background: '#0f172a', border: '1px solid #2d3458', borderRadius: 6, padding: '8px', marginTop: 4, maxHeight: 240, overflowY: 'auto' },
  noChanges: { color: '#718096', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 8 },
  diffRow: { marginBottom: 8, borderBottom: '1px solid #1e293b', paddingBottom: 6, fontSize: 11 },
  diffPath: { color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', marginBottom: 2 },
  diffLine: { fontFamily: 'monospace', lineHeight: 1.6 },
  was: { color: '#fc8181', marginRight: 4 },
  became: { color: '#68d391', marginRight: 4 },
};
