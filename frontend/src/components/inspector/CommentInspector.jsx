import React from 'react';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS } from '../../telegramLimits';

export default function CommentInspector({ data, onUpdate }) {
  return (
    <div style={s.section}>
      <div style={s.label}>Заметка</div>
      <PlaceholderField
        style={s.input}
        value={data.title || ''}
        maxLength={EDITOR_LIMITS.title}
        placeholder="Заголовок комментария"
        onChange={e => onUpdate({ title: e.target.value })}
        onKeyDown={e => e.stopPropagation()}
      />
      <PlaceholderField as="textarea"
        style={s.textarea}
        value={data.text || ''}
        placeholder="Введите любую информацию..."
        rows={12}
        maxLength={EDITOR_LIMITS.comment}
        onChange={e => onUpdate({ text: e.target.value })}
        onKeyDown={e => e.stopPropagation()}
      />
      <div style={s.hint}>Комментарий является заметкой и не выполняется ботом.</div>
    </div>
  );
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  label: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  input: {
    width: '100%', boxSizing: 'border-box', marginBottom: 8,
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', resize: 'vertical',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, lineHeight: 1.5, padding: '8px 10px',
    outline: 'none', fontFamily: 'inherit',
  },
  hint: { color: '#4a5568', fontSize: 11, lineHeight: 1.5, marginTop: 8 },
};
