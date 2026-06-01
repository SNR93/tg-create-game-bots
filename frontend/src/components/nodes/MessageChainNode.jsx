import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

const TYPE_ICON = { text:'✎', photo:'🖼', video:'▶', voice:'🎤', audio:'🎵', document:'📄' };

export function makeMessage(type = 'text') {
  return { id: uuidv4(), type, text: '', url: '', fileName: '', delay: 0, protected: false, asVideoNote: false };
}

export default function MessageChainNode({ data, selected }) {
  const messages = data.messages || [makeMessage('text')];

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      {/* Input handle near title */}
      <Handle type="target" position={Position.Left} id="in"
        style={{ ...s.hIn, top: 17 }} />

      <div style={s.header}>
        <span style={s.icon}>🔗</span>
        <span style={s.title}>{(data.title || 'Цепочка сообщений').slice(0, 22)}</span>
      </div>

      {messages.map(msg => (
        <div key={msg.id} style={s.row}>
          {msg.protected && <span style={s.lock} title="Защищённый контент">🔒</span>}
          <span style={s.mIcon}>{TYPE_ICON[msg.type] ?? '?'}</span>
          <span style={s.mText}>
            {msg.type === 'text'
              ? (msg.text?.slice(0, 26) || <em style={{ color: '#4a5568' }}>пусто</em>)
              : (msg.fileName || msg.url?.split('/').pop() || msg.type)}
          </span>
          {msg.delay > 0 && <span style={s.delay}>{msg.delay}с</span>}
        </div>
      ))}

      {/* Single output at bottom */}
      <div style={s.cont}>
        <span style={s.contLabel}>Продолжить</span>
        <Handle type="source" position={Position.Right} id="continue" style={s.hOut} />
      </div>

      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: { background: '#2a2d3e', borderRadius: 10, minWidth: 220, maxWidth: 260, overflow: 'visible', transition: 'border-color .15s,box-shadow .15s' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 13 },
  title: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderBottom: '1px solid #2d3250', minHeight: 28 },
  mIcon: { fontSize: 12, flexShrink: 0 },
  mText: { flex: 1, fontSize: 12, color: '#a0aec0', overflow: 'hidden', whiteSpace: 'nowrap' },
  delay: { fontSize: 10, color: '#3b82f6', background: 'rgba(59,130,246,0.12)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 },
  lock:  { fontSize: 11, filter: 'sepia(1) saturate(3) hue-rotate(10deg)', flexShrink: 0 },
  cont: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', position: 'relative' },
  contLabel: { fontSize: 12, color: '#718096' },
  hIn:  { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6, transform: 'none' },
  hOut: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id:   { padding: '3px 14px 6px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
