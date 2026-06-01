import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import CharacterCounter from './CharacterCounter';
import { EDITOR_LIMITS, TELEGRAM_LIMITS } from '../../telegramLimits';

function Section({ title, children }) {
  return <div style={s.section}><div style={s.title}>{title}</div>{children}</div>;
}
function Input({ groupStyle, ...props }) {
  const isText = !props.type || props.type === 'text';
  const maxLength = isText ? (props.maxLength || EDITOR_LIMITS.key) : undefined;
  if (!isText) return <input {...props} style={{ ...s.input, ...props.style }} onKeyDown={event => event.stopPropagation()} />;
  return <div style={{ ...s.inputGroup, ...(groupStyle || {}) }}>
    <input {...props} maxLength={maxLength} style={{ ...s.input, ...props.style }} onKeyDown={event => event.stopPropagation()} />
    {isText && <CharacterCounter value={props.value || ''} maxLength={maxLength} />}
  </div>;
}

export function InventoryInspector({ data, onUpdate }) {
  const entries = data.entries || [];
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return <Section title="Операции с инвентарем">
    {entries.map(entry => <div key={entry.id} style={s.row}>
      <Input value={entry.itemKey || ''} placeholder="Предмет" onChange={event => patch(entry.id, { itemKey: event.target.value })} />
      <select style={s.select} value={entry.action || 'add'} onChange={event => patch(entry.id, { action: event.target.value })}>
        <option value="add">+</option><option value="remove">−</option><option value="set">=</option>
      </select>
      <Input type="number" min="0" value={entry.quantity ?? 1} style={{ width: 55, flex: 'none' }} onChange={event => patch(entry.id, { quantity: +event.target.value })} />
      <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
    </div>)}
    <button style={s.add} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), itemKey: '', action: 'add', quantity: 1 }] })}>+ Добавить операцию</button>
  </Section>;
}

export function FormulaInspector({ data, onUpdate, botVariables }) {
  const entries = data.entries || [];
  const numericVars = Object.entries(botVariables || {}).filter(([, variable]) => variable.type === 'number').map(([name]) => name);
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return <Section title="Числовые вычисления">
    {numericVars.length === 0 && <div style={s.hint}>Сначала создайте числовую переменную.</div>}
    {entries.map(entry => <div key={entry.id} style={s.row}>
      <select style={{ ...s.select, flex: 1 }} value={entry.varName || ''} onChange={event => patch(entry.id, { varName: event.target.value })}>
        <option value="">Переменная</option>{numericVars.map(name => <option key={name}>{name}</option>)}
      </select>
      <select style={s.select} value={entry.operator || 'set'} onChange={event => patch(entry.id, { operator: event.target.value })}>
        <option value="set">=</option><option value="add">+</option><option value="subtract">−</option><option value="multiply">×</option><option value="divide">÷</option>
      </select>
      <Input type="number" value={entry.value ?? 0} style={{ width: 65, flex: 'none' }} onChange={event => patch(entry.id, { value: +event.target.value })} />
      <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
    </div>)}
    <button style={s.add} disabled={!numericVars.length} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), varName: numericVars[0] || '', operator: 'add', value: 1 }] })}>+ Добавить вычисление</button>
  </Section>;
}

export function CheckpointInspector({ data, onUpdate }) {
  return <Section title="Чекпоинт"><Input value={data.title || ''} placeholder="Название чекпоинта" onChange={event => onUpdate({ title: event.target.value })} /><div style={s.hint}>При прохождении этой ноды сохраняется точка прогресса игрока.</div></Section>;
}

export function RelationInspector({ data, onUpdate }) {
  const entries = data.entries || [];
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return <Section title="Отношения с персонажами">
    {entries.map(entry => <div key={entry.id} style={s.row}>
      <Input value={entry.characterKey || ''} placeholder="Ключ персонажа" onChange={event => patch(entry.id, { characterKey: event.target.value })} />
      <select style={s.select} value={entry.action || 'add'} onChange={event => patch(entry.id, { action: event.target.value })}>
        <option value="add">+</option><option value="subtract">−</option><option value="set">=</option>
      </select>
      <Input type="number" value={entry.value ?? 1} style={{ width: 55, flex: 'none' }} onChange={event => patch(entry.id, { value: +event.target.value })} />
      <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
    </div>)}
    <button style={s.add} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), characterKey: '', action: 'add', value: 1 }] })}>+ Добавить изменение</button>
  </Section>;
}

export function AchievementInspector({ data, onUpdate }) {
  return <Section title="Достижение">
    <Input value={data.achievementKey || ''} placeholder="Уникальный ключ" onChange={event => onUpdate({ achievementKey: event.target.value })} />
    <PlaceholderField value={data.title || ''} maxLength={EDITOR_LIMITS.shortText} placeholder="Название для игрока" onChange={event => onUpdate({ title: event.target.value })} style={{ ...s.input, marginTop: 6 }} />
    <label style={s.check}><input type="checkbox" checked={data.notify !== false} onChange={event => onUpdate({ notify: event.target.checked })} /> Показать уведомление игроку</label>
  </Section>;
}

export function PromocodeInspector({ data, onUpdate }) {
  return <Section title="Промокод">
    <PlaceholderField value={data.prompt || ''} maxLength={TELEGRAM_LIMITS.messageText} style={s.input} placeholder="Введите промокод:" onChange={event => onUpdate({ prompt: event.target.value })} />
    <div style={s.hint}>Нода ожидает ввод игрока и применяет промокод из админ-панели. Команда /promo CODE работает в любом месте сценария.</div>
  </Section>;
}

export function SubscenarioInspector({ data, onUpdate, nodes }) {
  return <Section title="Подсценарий">
    <select style={{ ...s.select, width: '100%' }} value={data.targetNodeId || ''} onChange={event => onUpdate({ targetNodeId: event.target.value })}>
      <option value="">Выберите точку входа</option>
      {(nodes || []).filter(node => node.type !== 'startNode' && node.type !== 'commentNode').map(node => <option key={node.id} value={node.id}>{node.data?.title || node.type} · {node.data?.nodeId || node.id.slice(0, 7)}</option>)}
    </select>
    <div style={s.hint}>После ноды «Возврат» выполнение продолжится по обычному выходу этой ноды.</div>
  </Section>;
}

export function PurchaseInspector({ data, onUpdate }) {
  return <Section title="Покупка Telegram Stars">
    <Input value={data.productKey || ''} placeholder="Ключ товара из магазина" onChange={event => onUpdate({ productKey: event.target.value })} />
    <div style={s.hint}>Товар и награда настраиваются в админ-панели. Сценарий продолжится после успешной оплаты.</div>
  </Section>;
}

export function InvokeCommandInspector({ data, onUpdate, nodes }) {
  const commandNodes = (nodes || []).filter(n => ['menuNode', 'settingsNode', 'customCommandNode'].includes(n.type));
  return <Section title="Целевая команда">
    <select style={{ ...s.select, width: '100%' }} value={data.targetNodeId || ''}
      onChange={event => {
        const node = commandNodes.find(n => n.id === event.target.value);
        onUpdate({ targetNodeId: event.target.value, targetTitle: node?.data?.title || node?.type || '' });
      }}>
      <option value="">Выберите команду</option>
      {commandNodes.map(node => <option key={node.id} value={node.id}>{node.data?.title || node.type} · {node.data?.nodeId || node.id.slice(0, 7)}</option>)}
    </select>
    <div style={s.hint}>Открывает выбранную командную ноду (меню, настройки, свою команду) как оверлей поверх текущей позиции в истории. После нажатия «Продолжить историю» сюжет продолжается со следующего блока.</div>
  </Section>;
}

export function RandomInspector({ data, onUpdate }) {
  const branches = data.branches || [];
  const patch = (id, value) => onUpdate({ branches: branches.map(branch => branch.id === id ? { ...branch, ...value } : branch) });
  return <Section title="Случайные варианты">
    {branches.map(branch => <div key={branch.id} style={s.row}>
      <Input value={branch.label || ''} placeholder="Название" onChange={event => patch(branch.id, { label: event.target.value })} />
      <Input type="number" min="1" value={branch.weight || 1} style={{ width: 55, flex: 'none' }} onChange={event => patch(branch.id, { weight: Math.max(1, +event.target.value) })} />
      <button style={s.remove} onClick={() => onUpdate({ branches: branches.filter(item => item.id !== branch.id) })}>×</button>
    </div>)}
    <div style={s.hint}>Вес определяет относительную вероятность выбора варианта.</div>
    <button style={s.add} onClick={() => onUpdate({ branches: [...branches, { id: uuidv4(), label: `Вариант ${branches.length + 1}`, weight: 1 }] })}>+ Добавить вариант</button>
  </Section>;
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  title: { color: '#718096', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 9 },
  row: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 },
  input: { flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12 },
  inputGroup: { flex: 1, minWidth: 0 },
  select: { background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 6px', fontSize: 12 },
  add: { background: '#2563eb', border: 'none', borderRadius: 5, color: '#fff', padding: '6px 9px', fontSize: 12, cursor: 'pointer' },
  remove: { background: 'transparent', border: 'none', color: '#fc8181', fontSize: 16, cursor: 'pointer' },
  hint: { color: '#718096', fontSize: 11, marginBottom: 8, lineHeight: 1.5 },
  check: { display: 'flex', gap: 6, alignItems: 'center', color: '#a0aec0', fontSize: 12, marginTop: 8 },
};
