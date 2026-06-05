/**
 * Codex developer notes:
 * Визуальное представление ноды ConditionNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export default function ConditionNode({ data, selected }) {
  const [condition, setCondition] = useState(data.condition || 'Текст содержит...');

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25), 0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.handleIn, top: 17, transform: 'none' }} />

      <div style={s.header}>
        <span style={s.icon}>⚡</span>
        <span style={s.label}>{data.title || 'Проверка текста'}</span>
      </div>

      <div style={s.body}>
        <input
          style={s.input}
          value={condition}
          onChange={e => { setCondition(e.target.value); data.condition = e.target.value; }}
          placeholder="Условие..."
          onKeyDown={e => e.stopPropagation()}
        />
      </div>

      <div style={s.ports}>
        <div style={s.portRow}>
          <span style={{ ...s.portLabel, color: '#68d391' }}>✓ Да</span>
          <Handle type="source" position={Position.Right} id="yes" style={{ ...s.handle, background: '#22c55e' }} />
        </div>
        <div style={s.portRow}>
          <span style={{ ...s.portLabel, color: '#fc8181' }}>✗ Нет</span>
          <Handle type="source" position={Position.Right} id="no" style={{ ...s.handle, background: '#ef4444' }} />
        </div>
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
  label: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  body: { padding: '8px 14px' },
  input: {
    width: '100%',
    background: '#1e2030', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '5px 8px', outline: 'none',
    boxSizing: 'border-box',
  },
  ports: { padding: '4px 14px 8px' },
  portRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', position: 'relative',
  },
  portLabel: { fontSize: 13 },
  handle: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  handleIn: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6 },
  nodeId: { padding: '4px 14px 8px', fontSize: 11, color: '#4a5568', textAlign: 'center' },
};
