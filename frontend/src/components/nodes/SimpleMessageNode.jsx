/**
 * Codex developer notes:
 * Визуальное представление ноды SimpleMessageNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { Handle, Position, useEdges, useNodeId } from '@xyflow/react';

const ICONS = { text:'✎', photo:'🖼', video:'▶', voice:'🎤', audio:'🎵', document:'📄' };

export default function SimpleMessageNode({ data, selected }) {
  const type = data.type || 'text';
  const nodeId = useNodeId();
  const edges = useEdges();
  const leftConnected  = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue-left');
  const rightConnected = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue');
  const expanded = !!data.__expanded;
  const displayText = type === 'text'
    ? (expanded ? (data.text || '') : (data.text?.slice(0, 32) || ''))
    : (data.fileName || data.url?.split('/').pop() || type);
  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.hi, top: 17, transform: 'none' }} />
      <div style={s.header}>
        <span style={s.icon}>💬</span>
        <span style={s.label}>{data.title || 'Сообщение'}</span>
      </div>
      <div style={s.preview}>
        {data.protected && <span style={s.lock} title="Защищённый контент">🔒</span>}
        <span style={s.typeIcon}>{ICONS[type]}</span>
        <span style={{ ...s.text, whiteSpace: expanded ? 'pre-wrap' : 'nowrap', wordBreak: expanded ? 'break-word' : 'normal' }}>
          {displayText || <em style={{ color: '#4a5568' }}>пусто</em>}
        </span>
      </div>
      <div style={s.cont}>
        <Handle
          type="source"
          position={Position.Left}
          id="continue-left"
          title="Выход влево"
          style={{ ...s.ho, left: -6, right: 'auto', opacity: rightConnected ? 0.25 : 1 }}
          isConnectable={!rightConnected}
        />
        <span style={s.contLabel}>Продолжить</span>
        <Handle
          type="source"
          position={Position.Right}
          id="continue"
          style={{ ...s.ho, opacity: leftConnected ? 0.25 : 1 }}
          isConnectable={!leftConnected}
        />
      </div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}
const s = {
  wrap: { background: '#2a2d3e', borderRadius: 10, width: 240, maxWidth: 240, overflow: 'visible', transition: 'border-color .15s,box-shadow .15s', boxSizing: 'border-box' },
  header: { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 13 }, label: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1 },
  lock: { fontSize: 12, filter: 'sepia(1) saturate(3) hue-rotate(10deg)', flexShrink: 0 },
  preview: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', minHeight: 34 },
  typeIcon: { fontSize: 14, flexShrink: 0 },
  text: { fontSize: 12, color: '#a0aec0', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  cont: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', borderTop: '1px solid #3a3f55', position: 'relative' },
  contLabel: { fontSize: 12, color: '#718096' },
  hi: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6 },
  ho: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
