/**
 * Codex developer notes:
 * Визуальное представление ноды VariableNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { Handle, Position, useEdges, useNodeId } from '@xyflow/react';

const ACT = { set: '=', increment: '+', decrement: '−', init: '?=' };

export default function VariableNode({ data, selected }) {
  const entries = data.entries || [];
  const nodeId = useNodeId();
  const edges = useEdges();
  const leftConnected  = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue-left');
  const rightConnected = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue');

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in"
        style={{ ...s.hIn, top: 17 }} />

      <div style={s.header}>
        <span style={s.icon}>📦</span>
        <span style={s.title}>{data.title || 'Переменные'}</span>
        <span style={s.count}>{entries.length}</span>
      </div>

      {entries.length === 0 && <div style={s.empty}>Нет операций</div>}

      {entries.map(e => (
        <div key={e.id} style={s.row}>
          <span style={s.varName}>{e.varName || '?'}</span>
          <span style={s.act}>{ACT[e.action] || ACT.set}</span>
          <span style={s.val}>
            {String(e.value ?? (e.varType === 'number' ? 0 : 'false'))}
          </span>
          <span style={s.typeBadge}>{e.varType === 'number' ? '123' : 'T/F'}</span>
        </div>
      ))}

      <div style={s.cont}>
        <Handle
          type="source"
          position={Position.Left}
          id="continue-left"
          title="Left output"
          style={{ ...s.hOut, left: -6, right: 'auto', opacity: rightConnected ? 0.25 : 1 }}
          isConnectable={!rightConnected}
        />
        <span style={s.contLabel}>Продолжить</span>
        <Handle
          type="source"
          position={Position.Right}
          id="continue"
          style={{ ...s.hOut, opacity: leftConnected ? 0.25 : 1 }}
          isConnectable={!leftConnected}
        />
      </div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: { background: '#2a2d3e', borderRadius: 10, minWidth: 220, overflow: 'visible', transition: 'border-color .15s,box-shadow .15s' },
  header: { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 13 },
  title: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1 },
  count: { background: 'rgba(167,139,250,0.2)', color: '#a78bfa', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 },
  empty: { padding: '8px 14px', fontSize: 12, color: '#4a5568', fontStyle: 'italic' },
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderBottom: '1px solid #2d3250' },
  varName: { fontSize: 12, fontWeight: 700, color: '#a78bfa', flex: 1 },
  act: { fontSize: 12, color: '#718096', fontWeight: 700 },
  val: { fontSize: 12, color: '#f6ad55', fontWeight: 600 },
  typeBadge: { fontSize: 9, color: '#4a5568', background: '#1e2030', borderRadius: 3, padding: '1px 4px' },
  cont: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderTop: '1px solid #3a3f55', position: 'relative' },
  contLabel: { fontSize: 12, color: '#718096' },
  hIn:  { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6, transform: 'none' },
  hOut: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
