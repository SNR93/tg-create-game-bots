import React from 'react';
import CountedInput from './CountedInput';
import { EDITOR_LIMITS, TELEGRAM_LIMITS } from '../../telegramLimits';

const INFO = {
  menuNode: 'Открывается по /start. Эта ветка не меняет сохранённое место прохождения игрока.',
  settingsNode: 'Открывается по /settings. Эта ветка не меняет сохранённое место прохождения игрока.',
  continueStoryNode: 'Возвращает игрока из меню к ожидающему выбору или к сохранённому месту основной истории.',
  customCommandNode: 'Открывает независимую ветку по своей Telegram-команде. Подключите к выходу обычные сообщения, клавиатуры и другие ноды.',
};

export default function CommandEntryInspector({ type, data, onUpdate }) {
  return (
    <div style={s.section}>
      <div style={s.title}>Независимая ветка</div>
      <div style={s.info}>{INFO[type]}</div>
      {type === 'customCommandNode' ? (
        <>
          <label style={s.label}>Название блока</label>
          <CountedInput style={s.input} value={data.title || ''} maxLength={EDITOR_LIMITS.title} placeholder="Профиль игрока" onChange={event => onUpdate({ title: event.target.value })} />
          <label style={s.label}>Команда</label>
          <div style={s.commandRow}><span style={s.slash}>/</span><CountedInput style={s.input} value={data.command || ''} maxLength={32} placeholder="profile" onChange={event => {
            const command = cleanCommand(event.target.value);
            const previousAutoTitle = data.command ? `Команда /${data.command}` : 'Команда';
            const patch = { command };
            if (!String(data.title || '').trim() || data.title === previousAutoTitle) patch.title = command ? `Команда /${command}` : 'Команда';
            onUpdate(patch);
          }} /></div>
          <label style={s.label}>Описание в меню Telegram</label>
          <CountedInput style={s.input} value={data.description || ''} placeholder="Показать профиль" maxLength={TELEGRAM_LIMITS.commandDescription} onChange={event => onUpdate({ description: event.target.value })} />
          <label style={s.label}>Псевдонимы через запятую</label>
          <CountedInput style={s.input} value={data.aliases || ''} maxLength={EDITOR_LIMITS.shortText} placeholder="me, hero" onChange={event => onUpdate({ aliases: event.target.value })} />
          <label style={s.check}><input type="checkbox" checked={data.showInMenu !== false} onChange={event => onUpdate({ showInMenu: event.target.checked })} /> Показывать в системном меню Telegram</label>
          <div style={s.hint}>Аргументы доступны в подключённых сообщениях: <code>{'{{command.args}}'}</code>, <code>{'{{command.arg1}}'}</code>, <code>{'{{command.arg2}}'}</code>.</div>
        </>
      ) : type !== 'continueStoryNode' && (
        <CountedInput
          style={s.input}
          value={data.title || ''}
          maxLength={EDITOR_LIMITS.title}
          placeholder={type === 'menuNode' ? 'Глобальное меню' : 'Настройки'}
          onChange={event => onUpdate({ title: event.target.value })}
          onKeyDown={event => event.stopPropagation()}
        />
      )}
    </div>
  );
}

function cleanCommand(value) {
  return String(value || '').replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  title: { color: '#718096', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 9 },
  info: { color: '#a0aec0', fontSize: 12, lineHeight: 1.5, marginBottom: 10 },
  input: { width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '6px 8px', fontSize: 12 },
  label: { display: 'block', color: '#718096', fontSize: 11, margin: '9px 0 5px' },
  commandRow: { display: 'flex', alignItems: 'center', gap: 4 },
  slash: { color: '#34d399', fontWeight: 700 },
  check: { display: 'flex', alignItems: 'center', gap: 6, color: '#a0aec0', fontSize: 12, marginTop: 10 },
  hint: { color: '#718096', fontSize: 11, lineHeight: 1.6, marginTop: 10 },
};
