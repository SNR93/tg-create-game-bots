import React from 'react';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS } from '../../telegramLimits';

const CONDITION_TYPES = ['Текст равен', 'Текст содержит', 'Начинается с', 'Заканчивается на', 'Любой ввод'];

export default function ConditionInspector({ data, onUpdate }) {
  return (
    <div>
      <Section label="Тип условия">
        <select
          style={s.select}
          value={data.conditionType || 'Текст содержит'}
          onChange={e => onUpdate({ conditionType: e.target.value })}
        >
          {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Section>

      {(data.conditionType || 'Текст содержит') !== 'Любой ввод' && (
        <Section label="Значение">
          <CountedInput
            style={s.input}
            value={data.condition || ''}
            maxLength={EDITOR_LIMITS.shortText}
            placeholder="Введите условие..."
            onChange={e => onUpdate({ condition: e.target.value })}
            onKeyDown={e => e.stopPropagation()}
          />
          <div style={s.hint}>
            Если пользователь введёт это — путь «Да», иначе — «Нет»
          </div>
        </Section>
      )}

      <Section label="Учитывать регистр">
        <label style={s.toggle}>
          <input
            type="checkbox"
            checked={data.caseSensitive || false}
            onChange={e => onUpdate({ caseSensitive: e.target.checked })}
          />
          <span>Да, учитывать (A ≠ a)</span>
        </label>
      </Section>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  select: {
    width: '100%',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none',
  },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none',
  },
  hint: { fontSize: 11, color: '#4a5568', marginTop: 6 },
  toggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a0aec0', cursor: 'pointer' },
};
