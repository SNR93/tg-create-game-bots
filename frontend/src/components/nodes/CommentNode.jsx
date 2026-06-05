/**
 * Codex developer notes:
 * Визуальное представление ноды CommentNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { Handle, Position } from '@xyflow/react';

export default function CommentNode({ data, selected }) {
  return (
    <div style={{
      ...s.wrap,
      border: selected ? '1px solid #f6ad55' : '1px solid #b7791f',
      boxShadow: selected ? '0 0 0 2px rgba(246,173,85,0.2),0 0 20px rgba(246,173,85,0.1)' : 'none',
    }}>
      <div style={s.header}>
        <span style={s.icon}>📝</span>
        <span style={s.title}>{data.title || 'Комментарий'}</span>
      </div>
      <div style={s.text}>
        {data.text?.trim() || <em style={s.empty}>Добавьте текст заметки</em>}
      </div>
      <div style={s.attach}>
        <span style={s.attachLabel}>Привязать к блоку</span>
        <Handle type="source" position={Position.Right} id="comment" style={s.handle} />
      </div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

const s = {
  wrap: {
    background: '#3a321f', borderRadius: 10, width: 260, minHeight: 110,
    overflow: 'visible', transition: 'border-color .15s,box-shadow .15s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 14px 7px', borderBottom: '1px solid rgba(246,173,85,0.2)',
  },
  icon: { fontSize: 14 },
  title: { color: '#fbd38d', fontSize: 13, fontWeight: 700 },
  text: {
    padding: '10px 14px', color: '#fefcbf', fontSize: 12, lineHeight: 1.5,
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minHeight: 58,
  },
  empty: { color: '#b7791f' },
  attach: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 14px', borderTop: '1px solid rgba(246,173,85,0.2)', position: 'relative',
  },
  attachLabel: { color: '#d69e2e', fontSize: 11 },
  handle: { background: '#f6ad55', border: '2px solid #744210', width: 14, height: 14, right: -7 },
  id: { padding: '3px 14px 6px', fontSize: 10, color: '#b7791f', textAlign: 'center' },
};
