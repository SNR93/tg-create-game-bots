import React from 'react';
import { Handle, Position } from '@xyflow/react';

const META = {
  menuNode: { icon: '☰', title: 'Глобальное меню', command: '/start', color: '#38bdf8' },
  settingsNode: { icon: '⚙', title: 'Настройки', command: '/settings', color: '#a78bfa' },
  customCommandNode: { icon: '/', title: 'Команда', command: '', color: '#34d399' },
};

export function CommandEntryNode({ type, data, selected }) {
  const meta = META[type] || META.menuNode;
  const command = type === 'customCommandNode'
    ? `/${String(data.command || 'command').replace(/^\/+/, '')}`
    : meta.command;
  return (
    <div style={{ ...s.wrap, borderColor: selected ? '#4fd1c5' : meta.color }}>
      <div style={s.header}>
        <span style={{ ...s.icon, color: meta.color }}>{meta.icon}</span>
        <span style={s.title}>{data.title || meta.title}</span>
      </div>
      <div style={s.command}>{command}</div>
      <div style={s.port}>
        <span style={s.portLabel}>Выполнить ветку</span>
        <Handle type="source" position={Position.Right} id="continue" style={s.handle} />
      </div>
      {data.nodeId && <div style={s.nodeId}>ID {data.nodeId}</div>}
    </div>
  );
}

export function ContinueStoryNode({ data, selected }) {
  return (
    <div style={{ ...s.wrap, borderColor: selected ? '#4fd1c5' : '#f6ad55' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.handle, left: -6 }} />
      <div style={s.header}>
        <span style={{ ...s.icon, color: '#f6ad55' }}>▶</span>
        <span style={s.title}>{data.title || 'Продолжить историю'}</span>
      </div>
      <div style={s.command}>Вернуться к прохождению</div>
      {data.nodeId && <div style={s.nodeId}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: { position: 'relative', minWidth: 220, overflow: 'visible', background: '#2a2d3e', border: '2px dashed', borderRadius: 10 },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 15 },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: 600 },
  command: { color: '#a0aec0', fontSize: 12, padding: '8px 14px' },
  port: { position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderTop: '1px solid #3a3f55' },
  portLabel: { color: '#cbd5e0', fontSize: 12 },
  handle: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  nodeId: { padding: '3px 14px 6px', color: '#4a5568', fontSize: 10, textAlign: 'center' },
};
