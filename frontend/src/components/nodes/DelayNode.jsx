import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function DelayNode({ data, selected }) {
  const amount = data.amount ?? data.seconds ?? 3;
  const unit = { seconds: 'сек', minutes: 'мин', hours: 'ч', days: 'дн' }[data.unit || 'seconds'];
  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.hi, top: 17, transform: 'none' }} />
      <div style={s.header}>
        <span style={s.icon}>⏱</span>
        <span style={s.label}>Задержка</span>
      </div>
      <div style={s.body}>
        <span style={s.num}>{amount}</span>
        <span style={s.unit}>{unit}</span>
      </div>
      <div style={s.cont}>
        <span style={s.contLabel}>Продолжить</span>
        <Handle type="source" position={Position.Right} id="continue" style={s.ho} />
      </div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}
const s = {
  wrap: { background: '#2a2d3e', borderRadius: 10, minWidth: 180, overflow: 'visible', transition: 'border-color .15s,box-shadow .15s' },
  header: { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 15 }, label: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  body: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '10px 14px', justifyContent: 'center' },
  num: { fontSize: 28, fontWeight: 700, color: '#f6ad55' },
  unit: { fontSize: 13, color: '#718096' },
  cont: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', borderTop: '1px solid #3a3f55', position: 'relative' },
  contLabel: { fontSize: 12, color: '#718096' },
  hi: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6 },
  ho: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
