import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useUpdateNodeInternals } from '@xyflow/react';

function hasEnabledCondition(button) {
  if (Array.isArray(button.conditions) && button.conditions.length > 0) {
    return button.conditions.some(condition => condition?.enabled);
  }
  return !!button.condition?.enabled;
}

export default function KeyboardNode({ id, data, selected }) {
  const edges               = useEdges();
  const nodes               = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const buttons             = data.buttons || [];

  // Set of existing node IDs for fast lookup
  const nodeIds = new Set(nodes.map(n => n.id));

  const rowRefs  = useRef([]);
  const [hTops, setHTops] = useState([]);

  // 1. Measure row positions after every render
  useEffect(() => {
    const tops = rowRefs.current.map(el =>
      el ? el.offsetTop + Math.round(el.offsetHeight / 2) : 0
    );
    setHTops(prev =>
      prev.length === tops.length && prev.every((v, i) => v === tops[i]) ? prev : tops
    );
  }); // intentionally no deps — runs every render, comparison stops loop

  // 2. After hTops change, tell ReactFlow to re-read handle DOM positions
  //    so edges connect from the correct point
  useEffect(() => {
    if (hTops.length > 0) {
      updateNodeInternals(id);
    }
  }, [hTops, id, updateNodeInternals]);

  // Only count an edge as "used" if the target node still exists
  const used = (side, btnId) =>
    edges.some(e =>
      e.source === id &&
      e.sourceHandle === `${side}-${btnId}` &&
      nodeIds.has(e.target)
    );

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      {/* Input handle at title level */}
      <Handle type="target" position={Position.Left} id="in" style={s.hIn} />

      <div style={s.header}>
        <span style={s.icon}>⌨</span>
        <span style={s.title}>{(data.title || 'Клавиатура').slice(0, 22)}</span>
      </div>

      {buttons.length === 0 && <div style={s.empty}>Нет вариантов</div>}

      {buttons.map((btn, i) => {
        const lUsed = used('left',  btn.id);
        const rUsed = used('right', btn.id);
        const hTop  = hTops[i] ?? 0;
        const vis   = hTops[i] !== undefined ? 1 : 0;

        return (
          <div key={btn.id}
            ref={el => { rowRefs.current[i] = el; }}
            style={s.row}>

            {/* Always render handles so ReactFlow registers them on first render */}
            <Handle type="source" position={Position.Left} id={`left-${btn.id}`}
              isConnectable={!rUsed}
              style={{
                ...s.hBase,
                top: hTop, left: -6,
                opacity: vis * (rUsed ? 0.3 : 1),
                background: rUsed ? '#1e2030' : '#38bdf8',
                borderColor: rUsed ? '#3a3f55' : '#0f172a',
              }} />

            {hasEnabledCondition(btn) && (
              <span style={s.conditionGear} title="Condition enabled">{'\u2699'}</span>
            )}
            <span style={s.label}>{btn.label || '…'}</span>
            {lUsed && <span style={s.arrow}>◄</span>}
            {rUsed && <span style={s.arrow}>►</span>}

            <Handle type="source" position={Position.Right} id={`right-${btn.id}`}
              isConnectable={!lUsed}
              style={{
                ...s.hBase,
                top: hTop, right: -6,
                opacity: vis * (lUsed ? 0.3 : 1),
                background: lUsed ? '#1e2030' : '#38bdf8',
                borderColor: lUsed ? '#3a3f55' : '#0f172a',
              }} />
          </div>
        );
      })}

      {(data.timeout > 0) && (
        <div style={s.timeoutRow}>
          <span style={s.muted}>⏱ Таймаут {data.timeout}с</span>
          <Handle type="source" position={Position.Right} id="timeout"
            style={{ ...s.hBase, right: -6, background: '#38bdf8', borderColor: '#0f172a' }} />
        </div>
      )}

      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: {
    position: 'relative',       // makes wrap the offsetParent for child rows
    background: '#2a2d3e', borderRadius: 10, minWidth: 220,
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
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '9px 14px', borderBottom: '1px solid #2d3250', minHeight: 38,
  },
  conditionGear: { color: '#38bdf8', fontSize: 12, lineHeight: 1, flexShrink: 0 },
  label: { flex: 1, fontSize: 13, color: '#cbd5e0' },
  arrow: { fontSize: 9, color: '#38bdf8' },
  hIn: {
    background: '#38bdf8', border: '2px solid #0f172a',
    width: 12, height: 12, left: -6, top: 19, transform: 'none',
  },
  hBase: {
    width: 12, height: 12, border: '2px solid',
    transform: 'none', transition: 'opacity .15s',
  },
  id: { padding: '4px 14px 7px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
  timeoutRow: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderTop: '1px solid #3a3f55' },
  muted: { fontSize: 11, color: '#718096' },
};
