/**
 * Codex developer notes:
 * Визуальное представление ноды GroupNode на холсте React Flow.
 * Компонент должен показывать автору сценария суть ноды и ключевые настройки, не выполняя игровую backend-логику.
 * Данные приходят через data/style/selected; изменения формы data должны быть синхронизированы с инспектором и runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import { NodeResizer } from '@xyflow/react';

function hexToRgba(hex, alpha) {
  const normalized = String(hex || '#3b82f6').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  if (Number.isNaN(number)) return `rgba(59, 130, 246, ${alpha})`;
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

export default function GroupNode({ data, selected }) {
  const color = data.color || '#3b82f6';
  return (
    <div style={{ ...s.wrap, borderColor: color, background: hexToRgba(color, 0.12) }}>
      <NodeResizer isVisible={selected} minWidth={220} minHeight={140} color={color} />
      <div className="nodrag" style={{ ...s.title, color, background: hexToRgba(color, 0.22) }}>
        {data.title || 'Группа'}
      </div>
    </div>
  );
}

const s = {
  wrap: {
    width: '100%', height: '100%', boxSizing: 'border-box',
    border: '1px solid', borderRadius: 10,
  },
  title: {
    display: 'inline-flex', alignItems: 'center', minHeight: 25,
    borderRadius: '8px 0 8px 0', padding: '0 10px',
    fontSize: 12, fontWeight: 700,
  },
};
