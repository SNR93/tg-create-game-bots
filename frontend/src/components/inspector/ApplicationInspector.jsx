/**
 * Codex developer notes:
 * Инспектор настроек ApplicationInspector: форма редактирования data для выбранной ноды.
 * Инспектор не должен напрямую сохранять бота на сервер: он меняет локальное состояние редактора, а сохранение делает страница редактора.
 * При добавлении полей нужно обновлять defaults, визуальную ноду, симулятор/runtime и проверки сценария.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

import React from 'react';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS, TELEGRAM_LIMITS } from '../../telegramLimits';

export default function ApplicationInspector({ data, onUpdate }) {
  return (
    <div>
      <Section label="Название">
        <PlaceholderField
          style={s.input}
          value={data.title || ''}
          maxLength={TELEGRAM_LIMITS.messageText}
          placeholder="Заявка"
          onChange={e => onUpdate({ title: e.target.value })}
          onKeyDown={e => e.stopPropagation()}
        />
      </Section>

      <Section label="Описание (необязательно)">
        <PlaceholderField as="textarea"
          style={s.textarea}
          value={data.description || ''}
          placeholder="Опишите, что происходит в этом блоке..."
          rows={3}
          maxLength={EDITOR_LIMITS.comment}
          onChange={e => onUpdate({ description: e.target.value })}
          onKeyDown={e => e.stopPropagation()}
        />
      </Section>

      <Section label="Тип уведомления">
        {['Запрос данных', 'Уведомление', 'Подтверждение'].map(t => (
          <label key={t} style={s.radio}>
            <input
              type="radio" name="notifType"
              checked={(data.notifType || 'Запрос данных') === t}
              onChange={() => onUpdate({ notifType: t })}
            />
            <span>{t}</span>
          </label>
        ))}
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
  input: {
    width: '100%', boxSizing: 'border-box',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6,
    color: '#e2e8f0', fontSize: 13, padding: '7px 10px', outline: 'none',
    resize: 'vertical', fontFamily: 'inherit',
  },
  radio: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: '#a0aec0', cursor: 'pointer' },
};
