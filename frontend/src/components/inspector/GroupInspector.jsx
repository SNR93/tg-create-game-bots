import React from 'react';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS } from '../../telegramLimits';

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#64748b'];

export default function GroupInspector({ node, onUpdateData, onUpdateStyle }) {
  const width = Math.round(Number.parseFloat(node.style?.width) || node.measured?.width || 320);
  const height = Math.round(Number.parseFloat(node.style?.height) || node.measured?.height || 220);
  const color = node.data.color || COLORS[0];

  return (
    <div style={s.section}>
      <label style={s.label}>
        Название
        <CountedInput style={s.input} value={node.data.title || ''} maxLength={EDITOR_LIMITS.title} onChange={event => onUpdateData({ title: event.target.value })} />
      </label>

      <div style={s.label}>Цвет фона</div>
      <div style={s.colors}>
        {COLORS.map(item => (
          <button
            key={item}
            type="button"
            aria-label={item}
            style={{ ...s.color, background: item, outline: item === color ? '2px solid #e2e8f0' : 'none' }}
            onClick={() => onUpdateData({ color: item })}
          />
        ))}
        <input type="color" style={s.colorPicker} value={color} onChange={event => onUpdateData({ color: event.target.value })} />
      </div>

      <div style={s.row}>
        <label style={s.label}>
          Ширина
          <input type="number" min="220" style={s.input} value={width} onChange={event => onUpdateStyle({ width: Math.max(220, +event.target.value || 220) })} />
        </label>
        <label style={s.label}>
          Высота
          <input type="number" min="140" style={s.input} value={height} onChange={event => onUpdateStyle({ height: Math.max(140, +event.target.value || 140) })} />
        </label>
      </div>

      <div style={s.hint}>
        Перетащите ноду внутрь рамки, чтобы добавить её в группу. Перетащите наружу, чтобы отделить.
      </div>
    </div>
  );
}

const s = {
  section: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 5, color: '#a0aec0', fontSize: 12, flex: 1 },
  input: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', padding: '7px 8px', outline: 'none' },
  colors: { display: 'flex', alignItems: 'center', gap: 8 },
  color: { width: 22, height: 22, border: 'none', borderRadius: '50%', cursor: 'pointer' },
  colorPicker: { width: 26, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' },
  row: { display: 'flex', gap: 10 },
  hint: { color: '#718096', background: '#12131a', border: '1px solid #2d3458', borderRadius: 6, padding: '9px 10px', fontSize: 11, lineHeight: 1.5 },
};
