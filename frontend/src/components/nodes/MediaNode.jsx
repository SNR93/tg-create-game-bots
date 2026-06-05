/**
 * Codex developer notes:
 * Визуальное представление ноды MediaNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';

const TYPE_ICON = { photo: '🖼', video: '▶', voice: '🎤', audio: '🎵', document: '📄' };

export default function MediaNode({ data, selected }) {
  const items = data.items || [];

  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55',
      boxShadow: selected ? '0 0 0 2px rgba(79,209,197,0.25),0 0 20px rgba(79,209,197,0.12)' : 'none',
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...s.hIn, top: 17 }} />

      <div style={s.header}>
        <span style={s.icon}>🖼</span>
        <span style={s.title}>{(data.title || 'Медиа').slice(0, 22)}</span>
        <span style={s.count}>{items.length}</span>
      </div>

      {items.length === 0 && <div style={s.empty}>Нет медиа</div>}

      {items.map(item => (
        <div key={item.id} style={s.row}>
          {item.protected && <span style={s.lock} title="Защищённый контент">🔒</span>}
          <span style={s.mIcon}>{TYPE_ICON[item.type] ?? '📎'}</span>
          <span style={s.mText}>{item.fileName || item.url?.split('/').pop() || item.type}</span>
        </div>
      ))}

      <div style={s.cont}>
        <span style={s.contLabel}>Продолжить</span>
        <Handle type="source" position={Position.Right} id="continue" style={s.hOut} />
      </div>

      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: { background: '#2a2d3e', borderRadius: 10, minWidth: 220, maxWidth: 270, overflow: 'visible', transition: 'border-color .15s,box-shadow .15s' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  icon: { fontSize: 13 },
  title: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1 },
  count: { background: 'rgba(56,189,248,0.18)', color: '#38bdf8', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 },
  empty: { padding: '8px 14px', fontSize: 12, color: '#4a5568', fontStyle: 'italic' },
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderBottom: '1px solid #2d3250', minHeight: 28 },
  lock: { fontSize: 11, filter: 'sepia(1) saturate(3) hue-rotate(10deg)', flexShrink: 0 },
  mIcon: { fontSize: 12, flexShrink: 0 },
  mText: { flex: 1, fontSize: 12, color: '#a0aec0', overflow: 'hidden', whiteSpace: 'nowrap' },
  cont: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', position: 'relative' },
  contLabel: { fontSize: 12, color: '#718096' },
  hIn: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6, transform: 'none' },
  hOut: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', fontSize: 10, color: '#4a5568', textAlign: 'center' },
};
