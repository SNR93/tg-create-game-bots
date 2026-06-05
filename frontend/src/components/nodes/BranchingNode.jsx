/**
 * Codex developer notes:
 * Визуальное представление ноды BranchingNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useUpdateNodeInternals } from '@xyflow/react';

function condSummary(conditions) {
  if (!conditions || conditions.length === 0) return '(иначе)';
  return conditions
    .map(c => `${c.varName || '?'} ${c.operator || '=='} ${String(c.value ?? '?')}`)
    .join(' И ');
}

export default function BranchingNode({ id, data, selected }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();
  const branches = data.branches || [];

  const rowRefs = useRef([]);
  const [hTops, setHTops] = useState([]);

  useEffect(() => {
    const tops = branches.map((_, i) => {
      const el = rowRefs.current[i];
      return (
      el ? el.offsetTop + Math.round(el.offsetHeight / 2) : 0
      );
    });
    setHTops(prev =>
      prev.length === tops.length && prev.every((v, i) => v === tops[i]) ? prev : tops
    );
  });

  useEffect(() => {
    if (hTops.length > 0) updateNodeInternals(id);
  }, [hTops, id, updateNodeInternals]);

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in"
        style={s.hIn} />

      <div style={s.header}>
        <span style={s.icon}>🔀</span>
        <span style={s.title}>{(data.title || 'Ветвление').slice(0, 20)}</span>
      </div>

      {branches.length === 0 && <div style={s.empty}>Нет веток</div>}

      {branches.map((branch, i) => {
        const hTop = hTops[i] ?? 0;
        const vis  = hTops[i] !== undefined ? 1 : 0;
        const summary = condSummary(branch.conditions);
        const leftHandle = `branch-left-${branch.id}`;
        const rightHandle = `branch-${branch.id}`;
        const lUsed = edges.some(edge => edge.source === id && edge.sourceHandle === leftHandle);
        const rUsed = edges.some(edge => edge.source === id && edge.sourceHandle === rightHandle);

        return (
          <div key={branch.id}
            ref={el => { rowRefs.current[i] = el; }}
            style={s.row}>
            <Handle type="source" position={Position.Left} id={leftHandle}
              isConnectable={!rUsed}
              style={{
                ...s.hOut,
                top: hTop,
                left: -6,
                opacity: vis * (rUsed ? 0.3 : 1),
                background: rUsed ? '#1e2030' : '#38bdf8',
                borderColor: rUsed ? '#3a3f55' : '#0f172a',
              }} />
            <div style={s.rowContent}>
              <span style={s.cond}>{summary}</span>
              <span style={s.label}>{branch.label || `Ветка ${i + 1}`}</span>
            </div>
            <Handle type="source" position={Position.Right} id={rightHandle}
              isConnectable={!lUsed}
              style={{
                ...s.hOut,
                top: hTop,
                right: -6,
                opacity: vis * (lUsed ? 0.3 : 1),
                background: lUsed ? '#1e2030' : '#38bdf8',
                borderColor: lUsed ? '#3a3f55' : '#0f172a',
              }} />
          </div>
        );
      })}

      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: {
    position: 'relative',
    background: '#2a2d3e', borderRadius: 10, minWidth: 240,
    overflow: 'visible', transition: 'border-color .15s, box-shadow .15s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 14px 8px', borderBottom: '1px solid #3a3f55',
  },
  icon: { fontSize: 14 },
  title: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  empty: { padding: '8px 14px', fontSize: 12, color: '#4a5568', fontStyle: 'italic' },
  row: {
    display: 'flex', alignItems: 'center',
    padding: '7px 14px', borderBottom: '1px solid #2d3250', minHeight: 36,
  },
  rowContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 8 },
  cond:  { fontSize: 10, color: '#718096', fontFamily: 'monospace', overflow: 'hidden', whiteSpace: 'nowrap' },
  label: { fontSize: 12, fontWeight: 600, color: '#cbd5e0' },
  hIn: {
    background: '#38bdf8', border: '2px solid #0f172a',
    width: 12, height: 12, left: -6, top: 19, transform: 'none',
  },
  hOut: {
    background: '#38bdf8', border: '2px solid #0f172a',
    width: 12, height: 12, transform: 'none',
  },
  id: { padding: '4px 14px 7px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
