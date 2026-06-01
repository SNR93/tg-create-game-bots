import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export default function ApplicationNode({ data, selected }) {
  const [title, setTitle] = useState(data.title || 'Заявка');

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25), 0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.handleIn, top: 17, transform: 'none' }} />
      <div style={s.header}>
        <span style={s.icon}>🔔</span>
        <input
          style={s.titleInput}
          value={title}
          onChange={e => { setTitle(e.target.value); data.title = e.target.value; }}
          onKeyDown={e => e.stopPropagation()}
        />
      </div>
      <div style={s.port}>
        <span style={s.portLabel}>Продолжить</span>
        <Handle type="source" position={Position.Right} id="continue" style={s.handle} />
      </div>
      {data.nodeId && <div style={s.nodeId}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: {
    background: '#2a2d3e',
    borderRadius: 10,
    minWidth: 220,
    overflow: 'visible',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px 8px',
    borderBottom: '1px solid #3a3f55',
  },
  icon: { fontSize: 14 },
  titleInput: {
    background: 'transparent', border: 'none', outline: 'none',
    color: '#e2e8f0', fontSize: 14, fontWeight: 600, width: '100%',
  },
  port: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 14px', position: 'relative',
  },
  portLabel: { fontSize: 13, color: '#cbd5e0' },
  handle: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  handleIn: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6 },
  nodeId: { padding: '4px 14px 8px', fontSize: 11, color: '#4a5568', textAlign: 'center' },
};
