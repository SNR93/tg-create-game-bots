import React, { useEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';

function Frame({ children, selected, icon, title, data, input = true, output = true }) {
  return (
    <div style={{ ...s.wrap, border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55' }}>
      {input && <Handle type="target" position={Position.Left} id="in" style={s.hIn} />}
      <div style={s.header}><span>{icon}</span><span style={s.title}>{title}</span></div>
      {children}
      {output && <div style={s.cont}><span style={s.muted}>Продолжить</span><Handle type="source" position={Position.Right} id="continue" style={s.hOut} /></div>}
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

export function InventoryNode({ data, selected }) {
  const entries = data.entries || [];
  return (
    <Frame selected={selected} icon="🎒" title={data.title || 'Инвентарь'} data={data}>
      {entries.length === 0 && <div style={s.empty}>Нет операций</div>}
      {entries.map(entry => <div key={entry.id} style={s.row}><span style={s.key}>{entry.itemKey || '?'}</span><span style={s.value}>{entry.action || 'add'} {entry.quantity ?? 1}</span></div>)}
    </Frame>
  );
}

export function FormulaNode({ data, selected }) {
  const entries = data.entries || [];
  return (
    <Frame selected={selected} icon="🧮" title={data.title || 'Формула'} data={data}>
      {entries.length === 0 && <div style={s.empty}>Нет вычислений</div>}
      {entries.map(entry => <div key={entry.id} style={s.row}><span style={s.key}>{entry.varName || '?'}</span><span style={s.value}>{entry.operator || '='} {entry.value ?? 0}</span></div>)}
    </Frame>
  );
}

export function CheckpointNode({ data, selected }) {
  return <Frame selected={selected} icon="🚩" title={data.title || 'Чекпоинт'} data={data}><div style={s.body}>Сохранить прогресс</div></Frame>;
}

export function RelationNode({ data, selected }) {
  const entries = data.entries || [];
  return <Frame selected={selected} icon="♥" title={data.title || 'Отношения'} data={data}>
    {entries.length === 0 && <div style={s.empty}>Нет изменений</div>}
    {entries.map(entry => <div key={entry.id} style={s.row}><span style={s.key}>{entry.characterKey || '?'}</span><span style={s.value}>{entry.action || 'add'} {entry.value ?? 1}</span></div>)}
  </Frame>;
}

export function AchievementNode({ data, selected }) {
  return <Frame selected={selected} icon="🏆" title={data.title || 'Достижение'} data={data}><div style={s.body}>{data.achievementKey || 'Укажите ключ достижения'}</div></Frame>;
}

export function PromocodeNode({ data, selected }) {
  return <Frame selected={selected} icon="🎟" title={data.title || 'Промокод'} data={data}><div style={s.body}>{data.prompt || 'Запросить промокод у игрока'}</div></Frame>;
}

export function SubscenarioNode({ data, selected }) {
  return <Frame selected={selected} icon="↳" title={data.title || 'Подсценарий'} data={data}><div style={s.body}>Перейти к: {data.targetNodeId || 'не выбрано'}</div></Frame>;
}

export function ReturnNode({ data, selected }) {
  return <Frame selected={selected} icon="↵" title={data.title || 'Возврат'} data={data} output={false}><div style={s.body}>Вернуться из подсценария</div></Frame>;
}

export function InvokeCommandNode({ data, selected }) {
  const label = data.targetTitle || (data.targetNodeId ? data.targetNodeId.slice(0, 7) : null);
  return (
    <Frame selected={selected} icon="⚡" title={data.title || 'Вызвать команду'} data={data}>
      <div style={s.body}>{label ? `→ ${label}` : 'Не выбрана команда'}</div>
    </Frame>
  );
}

export function PurchaseNode({ data, selected }) {
  return <Frame selected={selected} icon="⭐" title={data.title || 'Покупка'} data={data}><div style={s.body}>{data.productKey || 'Укажите товар'}</div></Frame>;
}

export function RandomNode({ id, data, selected }) {
  const branches = data.branches || [];
  const refs = useRef([]);
  const [tops, setTops] = useState([]);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const next = refs.current.map(element => element ? element.offsetTop + Math.round(element.offsetHeight / 2) : 0);
    setTops(previous => previous.length === next.length && previous.every((value, index) => value === next[index]) ? previous : next);
  });
  useEffect(() => { if (tops.length) updateNodeInternals(id); }, [tops, id, updateNodeInternals]);

  return (
    <Frame selected={selected} icon="🎲" title={data.title || 'Случайность'} data={data} output={false}>
      {branches.map((branch, index) => (
        <div key={branch.id} ref={element => { refs.current[index] = element; }} style={s.row}>
          <span style={s.key}>{branch.label || `Вариант ${index + 1}`}</span>
          <span style={s.value}>{branch.weight || 1}</span>
          <Handle type="source" position={Position.Right} id={`random-${branch.id}`} style={{ ...s.hOut, top: tops[index] || 0, transform: 'none' }} />
        </div>
      ))}
      {branches.length === 0 && <div style={s.empty}>Нет вариантов</div>}
    </Frame>
  );
}

const s = {
  wrap: { position: 'relative', background: '#2a2d3e', borderRadius: 10, minWidth: 220, overflow: 'visible' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  title: { color: '#e2e8f0', fontSize: 13, fontWeight: 600 },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid #2d3250', minHeight: 28 },
  key: { flex: 1, color: '#cbd5e0', fontSize: 12 },
  value: { color: '#f6ad55', fontSize: 11 },
  body: { color: '#a0aec0', fontSize: 12, padding: '9px 14px' },
  empty: { color: '#4a5568', fontSize: 12, padding: '8px 14px', fontStyle: 'italic' },
  cont: { position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '7px 14px' },
  muted: { color: '#718096', fontSize: 12 },
  hIn: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6, top: 17, transform: 'none' },
  hOut: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', color: '#4a5568', fontSize: 10, textAlign: 'center' },
};
