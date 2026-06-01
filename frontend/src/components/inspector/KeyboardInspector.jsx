import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS } from '../../telegramLimits';

export default function KeyboardInspector({ data, onUpdate }) {
  const buttons = data.buttons || [];

  function setButtons(list) { onUpdate({ buttons: list }); }

  function addButton() {
    setButtons([...buttons, { id: uuidv4(), label: `Вариант ${buttons.length + 1}` }]);
  }

  function updateLabel(id, label) {
    setButtons(buttons.map(b => b.id === id ? { ...b, label } : b));
  }

  function delButton(id) {
    setButtons(buttons.filter(b => b.id !== id));
  }

  function move(id, dir) {
    const arr = [...buttons];
    const i = arr.findIndex(b => b.id === id);
    if (dir === 'up'   && i > 0)              [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
    if (dir === 'down' && i < arr.length - 1) [arr[i+1], arr[i]] = [arr[i], arr[i+1]];
    setButtons(arr);
  }

  return (
    <div>
      <Sect label="Название блока">
        <PlaceholderField style={s.inp} value={data.title || ''} placeholder="Клавиатура"
          maxLength={EDITOR_LIMITS.title}
          onChange={e => onUpdate({ title: e.target.value })}
          onKeyDown={e => e.stopPropagation()} />
      </Sect>

      <Sect label={`Варианты (${buttons.length})`}>
        <div style={s.hint}>
          У каждого варианта есть левый ◄ и правый ► выходы. При подключении одного — второй блокируется.
        </div>
        {buttons.length === 0 && <div style={s.empty}>Нет вариантов</div>}
        {buttons.map((btn, i) => (
          <div key={btn.id} style={s.row}>
            <span style={s.idx}>{i + 1}</span>
            <PlaceholderField style={{ ...s.inp, flex: 1 }} value={btn.label}
              maxLength={EDITOR_LIMITS.shortText}
              onChange={e => updateLabel(btn.id, e.target.value)}
              onKeyDown={e => e.stopPropagation()} />
            <button style={s.ctrl} onClick={() => move(btn.id, 'up')}   disabled={i === 0}>↑</button>
            <button style={s.ctrl} onClick={() => move(btn.id, 'down')} disabled={i === buttons.length - 1}>↓</button>
            <button style={{ ...s.ctrl, color: '#fc8181' }} onClick={() => delButton(btn.id)}>✕</button>
          </div>
        ))}
        <button style={s.addBtn} onClick={addButton}>+ Добавить вариант</button>
      </Sect>

      <Sect label="Подсказка">
        <div style={s.info}>
          Inline-клавиатура показывается в Telegram прямо в чате (кнопки под сообщением).
          Нажатие пользователя следует по ветке, подключённой к левому ◄ или правому ► выходу выбранного варианта.
        </div>
      </Sect>
    </div>
  );
}

function Sect({ label, children }) {
  return <div style={s.sect}><div style={s.sLabel}>{label}</div>{children}</div>;
}

const s = {
  sect: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  sLabel: { fontSize: 11, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  hint: { fontSize: 11, color: '#4a5568', lineHeight: 1.5, marginBottom: 10 },
  empty: { color: '#4a5568', fontSize: 12, fontStyle: 'italic', marginBottom: 6 },
  row: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  idx: { fontSize: 11, color: '#4a5568', width: 18, textAlign: 'center', flexShrink: 0 },
  inp: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' },
  ctrl: { background: 'transparent', border: 'none', color: '#718096', cursor: 'pointer', fontSize: 13, padding: '2px 4px', flexShrink: 0 },
  addBtn: { width: '100%', background: '#1e2030', border: '1px dashed #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 13, padding: '7px 0', cursor: 'pointer', marginTop: 4 },
  info: { fontSize: 11, color: '#718096', lineHeight: 1.6 },
};
