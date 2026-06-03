import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS, TELEGRAM_LIMITS, isSystemPlaceholderName } from '../../telegramLimits';
import { normalizeRandomConfig, randomConfigErrors } from '../../randomUtils';

function Section({ title, children }) {
  return <div style={s.section}><div style={s.title}>{title}</div>{children}</div>;
}

function ReservedNameError({ name }) {
  return isSystemPlaceholderName(name)
    ? <div style={s.error}>Это имя зарезервировано системным плейсхолдером.</div>
    : null;
}
function Input({ groupStyle, ...props }) {
  const isText = !props.type || props.type === 'text';
  const maxLength = isText ? (props.maxLength || EDITOR_LIMITS.key) : undefined;
  if (!isText) return <input {...props} style={{ ...s.input, ...props.style }} onKeyDown={event => event.stopPropagation()} />;
  return <div style={{ ...s.inputGroup, ...(groupStyle || {}) }}>
    <input {...props} maxLength={maxLength} style={{ ...s.input, ...props.style }} onKeyDown={event => event.stopPropagation()} />
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

function formulaPlaceholders(formula) {
  return [...new Set([...String(formula || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => match[1].trim()))];
}

function evaluateFormulaExpression(expression, values) {
  const withValues = String(expression || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const raw = values[name.trim()];
    if (raw === '' || raw === undefined || !Number.isFinite(Number(raw))) throw new Error(`«${name.trim()}» не число`);
    return String(Number(raw));
  });
  const normalized = withValues.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, value) => `(${String(value).replace(',', '.')}/100)`);
  if (!/^[\d+\-*/().\s]+$/.test(normalized)) throw new Error('Недопустимые символы');
  const result = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(result)) throw new Error('Результат не число');
  return result;
}

function FormulaPreview({ formula, botVariables }) {
  const validNumbers = new Set(Object.entries(botVariables || {}).filter(([, variable]) => variable.type === 'number').map(([name]) => name));
  const allVars = new Set(Object.keys(botVariables || {}));
  const parts = [];
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}|[()]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(String(formula || '')))) {
    if (match.index > cursor) parts.push(<span key={`t-${cursor}`}>{String(formula).slice(cursor, match.index)}</span>);
    if (match[0] === '(' || match[0] === ')') {
      parts.push(<span key={`b-${match.index}`} style={s.bracket}>{match[0]}</span>);
    } else {
      const name = match[1].trim();
      const ok = validNumbers.has(name);
      parts.push(<span key={`p-${match.index}`} style={ok ? s.goodPlaceholder : s.badPlaceholder} title={!allVars.has(name) ? 'Плейсхолдер не найден' : !ok ? 'Плейсхолдер не числовой' : ''}>{match[0]}</span>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < String(formula || '').length) parts.push(<span key={`t-${cursor}`}>{String(formula).slice(cursor)}</span>);
  return <div style={s.formulaPreview}>{parts.length ? parts : <span style={s.hint}>Введите формулу для подсветки.</span>}</div>;
}

export function InventoryViewInspector({ data, onUpdate }) {
  return <Section title="Показать инвентарь">
    <PlaceholderField as="textarea" rows={3} value={data.header || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting style={s.input} placeholder="Ваш инвентарь:" onChange={event => onUpdate({ header: event.target.value })} />
    <Input value={data.itemFormat || '{{item}} x{{amount}}'} placeholder="Формат строки предмета" onChange={event => onUpdate({ itemFormat: event.target.value })} />
    <PlaceholderField as="textarea" rows={2} value={data.emptyText || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter style={{ ...s.input, marginTop: 6 }} placeholder="Инвентарь пуст." onChange={event => onUpdate({ emptyText: event.target.value })} />
    <div style={s.hint}>В формате строки доступны поля {'{{item}}'} и {'{{amount}}'}. Каждый предмет выводится с новой строки.</div>
  </Section>;
}

export function FormulaInspector({ data, onUpdate, botVariables }) {
  const entries = data.entries || [];
  const numericVars = Object.entries(botVariables || {}).filter(([, variable]) => variable.type === 'number').map(([name]) => name);
  const placeholders = useMemo(() => formulaPlaceholders(data.formula), [data.formula]);
  const [debugValues, setDebugValues] = useState({});
  const debugResult = useMemo(() => {
    if (!data.formula) return '';
    try { return evaluateFormulaExpression(data.formula, debugValues); }
    catch (error) { return error.message; }
  }, [data.formula, debugValues]);
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return <Section title="Числовые вычисления">
    <div style={s.hint}>Новая форма: одна формула строкой. Проценты можно писать как 17%, плейсхолдеры должны быть числовыми.</div>
    <div style={s.row}>
      <select style={{ ...s.select, flex: 1 }} value={data.varName || ''} onChange={event => onUpdate({ varName: event.target.value })}>
        <option value="">Куда записать результат</option>{numericVars.map(name => <option key={name}>{name}</option>)}
      </select>
    </div>
    <PlaceholderField value={data.formula || ''} placeholder="({{деньги}}+5)-17%*100" onChange={event => onUpdate({ formula: event.target.value })} style={{ ...s.input, marginBottom: 8 }} />
    <FormulaPreview formula={data.formula || ''} botVariables={botVariables} />
    {placeholders.length > 0 && <div style={s.debugBox}>
      {placeholders.map(name => (
        <label key={name} style={s.debugRow}>
          <span style={{ ...s.key, color: botVariables?.[name]?.type === 'number' ? '#68d391' : '#fc8181' }}>{name}</span>
          <input type="number" style={s.debugInput} value={debugValues[name] ?? ''} placeholder="0" onChange={event => setDebugValues(values => ({ ...values, [name]: event.target.value }))} onKeyDown={event => event.stopPropagation()} />
        </label>
      ))}
      <div style={Number.isFinite(Number(debugResult)) ? s.debugResult : s.error}>Результат: {String(debugResult)}</div>
    </div>}
    {numericVars.length === 0 && <div style={s.hint}>Сначала создайте числовую переменную.</div>}
    {!data.formula && <div style={s.hint}>Старый режим операций ниже работает, если строковая формула пустая.</div>}
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
    <Input value={data.imageUrl || ''} maxLength={EDITOR_LIMITS.url} placeholder="URL картинки достижения (необязательно)" onChange={event => onUpdate({ imageUrl: event.target.value })} />
    <label style={s.check}><input type="checkbox" checked={data.notify !== false} onChange={event => onUpdate({ notify: event.target.checked })} /> Показать уведомление игроку</label>
  </Section>;
}

export function AchievementsViewInspector({ data, onUpdate }) {
  return <Section title="Показать достижения">
    <PlaceholderField as="textarea" rows={4} value={data.template || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting style={s.input} placeholder="Достижения: {{unlocked}} / {{total}}" onChange={event => onUpdate({ template: event.target.value })} />
    <div style={s.hint}>Поля {'{{unlocked}}'} и {'{{total}}'} заменяются количеством полученных и общим количеством достижений на схеме.</div>
  </Section>;
}

export function PromocodeInspector({ data, onUpdate, nodes }) {
  return <Section title="Промокод">
    <PlaceholderField value={data.prompt || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter style={s.input} placeholder="Введите промокод:" onChange={event => onUpdate({ prompt: event.target.value })} />
    <select style={{ ...s.select, width: '100%', marginTop: 8 }} value={data.successTargetNodeId || ''} onChange={event => onUpdate({ successTargetNodeId: event.target.value })}>
      <option value="">После успеха: обычный выход</option>
      {(nodes || []).filter(node => node.type !== 'commentNode' && node.type !== 'groupNode').map(node => <option key={node.id} value={node.id}>{node.data?.title || node.type} · {node.data?.nodeId || node.id.slice(0, 7)}</option>)}
    </select>
    <div style={s.hint}>После успешного промокода можно перейти к отдельной награде или главе. При ошибке используется обычный выход.</div>
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

export function TextInputInspector({ data, onUpdate }) {
  return <Section title="Ввод текста от игрока">
    <PlaceholderField value={data.prompt || ''} maxLength={500} showCounter style={s.input} placeholder="Введите ваше имя:" onChange={e => onUpdate({ prompt: e.target.value })} />
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>Сохранить в:</span>
      <Input value={data.varName || ''} placeholder="НазваниеПеременной" onChange={e => onUpdate({ varName: e.target.value })} />
      <select style={s.select} value={data.varType || 'text'} onChange={e => onUpdate({ varType: e.target.value })}>
        <option value="text">текст</option>
        <option value="number">число</option>
      </select>
    </div>
    <div style={s.hint}>Бот отправит текст промта, затем ожидает ввода игрока и сохраняет его в переменную.</div>
  </Section>;
}

export function EditMessageInspector({ data, onUpdate }) {
  return <Section title="Изменить последнее сообщение">
    <PlaceholderField as="textarea" rows={4} value={data.text || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting style={s.input} placeholder="Новый текст сообщения" onChange={e => onUpdate({ text: e.target.value })} />
    <div style={s.hint}>Если ранее бот не отправлял текстовое сообщение, будет создано новое.</div>
  </Section>;
}

export function PollInspector({ data, onUpdate }) {
  const options = data.options || [];
  return <Section title="Опрос или тест">
    <Input value={data.question || ''} maxLength={TELEGRAM_LIMITS.pollQuestion} placeholder="Вопрос" onChange={e => onUpdate({ question: e.target.value })} />
    {options.map((option, index) => <div key={index} style={s.row}>
      <Input value={option} maxLength={TELEGRAM_LIMITS.pollOption} placeholder={`Вариант ${index + 1}`} onChange={e => onUpdate({ options: options.map((value, i) => i === index ? e.target.value : value) })} />
      <button style={s.remove} onClick={() => onUpdate({ options: options.filter((_, i) => i !== index) })}>×</button>
    </div>)}
    <button style={s.add} disabled={options.length >= 10} onClick={() => onUpdate({ options: [...options, ''] })}>+ Вариант</button>
    <label style={s.check}><input type="checkbox" checked={!!data.quiz} onChange={e => onUpdate({ quiz: e.target.checked })} /> Режим теста</label>
    {data.quiz && <Input type="number" min="1" max={Math.max(1, options.length)} value={(data.correctOption ?? 0) + 1} onChange={e => onUpdate({ correctOption: Math.max(0, +e.target.value - 1) })} />}
  </Section>;
}

export function StickerInspector({ data, onUpdate }) {
  return <Section title="Стикер"><Input value={data.sticker || ''} maxLength={EDITOR_LIMITS.url} placeholder="file_id или https://..." onChange={e => onUpdate({ sticker: e.target.value })} /></Section>;
}

export function LocationInspector({ data, onUpdate }) {
  return <Section title="Геолокация"><div style={s.row}>
    <Input type="number" step="any" value={data.latitude ?? ''} placeholder="Широта" onChange={e => onUpdate({ latitude: +e.target.value })} />
    <Input type="number" step="any" value={data.longitude ?? ''} placeholder="Долгота" onChange={e => onUpdate({ longitude: +e.target.value })} />
  </div></Section>;
}

export function SubscriptionCheckInspector({ data, onUpdate }) {
  return <Section title="Проверка подписки на канал">
    <Input value={data.channelId || ''} placeholder="@mychannel или -100123456789" onChange={e => onUpdate({ channelId: e.target.value })} />
    <PlaceholderField value={data.prompt || ''} maxLength={500} showCounter style={{ ...s.input, marginTop: 6 }} placeholder="Подпишитесь на канал, чтобы продолжить." onChange={e => onUpdate({ prompt: e.target.value })} />
    <div style={s.hint}>Левый выход — подписан, правый — не подписан. Сообщение отправляется только если игрок не подписан.</div>
  </Section>;
}

export function HttpRequestInspector({ data, onUpdate }) {
  return <Section title="HTTP-запрос">
    <div style={s.row}>
      <select style={s.select} value={data.method || 'GET'} onChange={e => onUpdate({ method: e.target.value })}>
        {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
      </select>
      <PlaceholderField style={{ ...s.input, flex: 1 }} value={data.url || ''} placeholder="https://api.example.com/endpoint" onChange={e => onUpdate({ url: e.target.value })} />
    </div>
    <div style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>Заголовки (JSON):</div>
    <Input value={data.headers || '{}'} placeholder='{"Authorization":"Bearer token"}' onChange={e => onUpdate({ headers: e.target.value })} />
    <div style={{ fontSize: 11, color: '#718096', margin: '6px 0 4px' }}>Тело запроса (поддерживает плейсхолдеры):</div>
    <PlaceholderField style={s.input} value={data.body || ''} placeholder='{"key":"{{Переменная}}"}' onChange={e => onUpdate({ body: e.target.value })} />
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>Путь в ответе:</span>
      <Input value={data.responsePath || ''} placeholder="data.value" onChange={e => onUpdate({ responsePath: e.target.value })} />
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>Сохранить в:</span>
      <Input value={data.responseVar || ''} placeholder="api_result" onChange={e => onUpdate({ responseVar: e.target.value })} />
    </div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>Таймаут (мс):</span>
      <Input type="number" min="500" style={{ width: 80, flex: 'none' }} value={data.requestTimeout || 5000} onChange={e => onUpdate({ requestTimeout: +e.target.value })} />
    </div>
    <div style={s.hint}>Успех → левый выход, Ошибка → правый. Путь в ответе использует точечную нотацию: data.user.name</div>
  </Section>;
}

export function LoopInspector({ data, onUpdate }) {
  return <Section title="Параметры цикла">
    <div style={s.row}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>Макс. итераций:</span>
      <Input type="number" min="1" max="100" value={data.maxIterations || 10} style={{ width: 80, flex: 'none' }} onChange={e => onUpdate({ maxIterations: Math.max(1, +e.target.value) })} />
    </div>
    <div style={s.hint}>«Тело цикла» — выполняется N раз. «Завершить» — продолжение после цикла.</div>
  </Section>;
}

export function BreakLoopInspector({ data, onUpdate, nodes }) {
  const loopNodes = (nodes || []).filter(n => n.type === 'loopNode');
  return <Section title="Прервать цикл">
    <select style={{ ...s.select, width: '100%' }} value={data.targetLoopId || ''} onChange={e => onUpdate({ targetLoopId: e.target.value })}>
      <option value="">Выберите цикл</option>
      {loopNodes.map(n => <option key={n.id} value={n.id}>{n.data?.title || 'Цикл'} · {n.data?.nodeId || n.id.slice(0, 7)}</option>)}
    </select>
    <div style={s.hint}>Устанавливает счётчик выбранного цикла в максимум, что при следующем проходе выведет на выход «Завершить».</div>
  </Section>;
}

export function GlobalVariableInspector({ data, onUpdate }) {
  const entries = data.entries || [];
  const patch = (id, value) => onUpdate({ entries: entries.map(e => e.id === id ? { ...e, ...value } : e) });
  return <Section title="Глобальные переменные бота">
    <div style={s.hint}>Общие для всех игроков. Значения доступны в условиях ветвления (источник: Глоб. переменная).</div>
    {entries.map(entry => <div key={entry.id} style={s.row}>
      <Input value={entry.varName || ''} placeholder="Имя переменной" onChange={e => patch(entry.id, { varName: e.target.value })} />
      <select style={s.select} value={entry.varType || 'number'} onChange={e => patch(entry.id, { varType: e.target.value })}>
        <option value="number">число</option>
        <option value="text">текст</option>
        <option value="boolean">логика</option>
      </select>
      <select style={s.select} value={entry.action || 'set'} onChange={e => patch(entry.id, { action: e.target.value })}>
        <option value="set">установить</option>
        <option value="increment">прибавить</option>
        <option value="decrement">убавить</option>
      </select>
      {entry.varType === 'boolean'
        ? <select style={s.select} value={String(entry.value ?? false)} onChange={e => patch(entry.id, { value: e.target.value === 'true' })}><option value="false">false</option><option value="true">true</option></select>
        : <Input type={entry.varType === 'text' ? 'text' : 'number'} value={entry.value ?? (entry.varType === 'text' ? '' : 0)} style={{ width: 70, flex: 'none' }} onChange={e => patch(entry.id, { value: entry.varType === 'text' ? e.target.value : +e.target.value })} />}
      <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(e => e.id !== entry.id) })}>×</button>
    </div>)}
    <button style={s.add} onClick={() => onUpdate({ entries: [...entries, { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), varName: '', varType: 'number', action: 'set', value: 0 }] })}>+ Переменная</button>
  </Section>;
}

export function RandomInspector({ data, onUpdate }) {
  const config = normalizeRandomConfig(data);
  const branches = config.branches;
  const current = { ...data, rangeMin: config.rangeMin, rangeMax: config.rangeMax, branches };
  const errors = randomConfigErrors(current);
  const commit = patch => onUpdate({ ...patch, branches: patch.branches || branches, rangeMin: patch.rangeMin ?? config.rangeMin, rangeMax: patch.rangeMax ?? config.rangeMax });
  const patch = (id, value) => commit({ branches: branches.map(branch => branch.id === id ? { ...branch, ...value } : branch) });
  const lastEnd = branches.length ? Math.max(...branches.map(branch => branch.to)) : config.rangeMin - 1;
  return <Section title="Случайные варианты">
    <div style={s.row}>
      <span style={s.rangeLabel}>Случайное число от</span>
      <Input type="number" step="1" value={config.rangeMin} style={s.rangeInput} onChange={event => commit({ rangeMin: +event.target.value })} />
      <span style={s.rangeLabel}>до</span>
      <Input type="number" step="1" value={config.rangeMax} style={s.rangeInput} onChange={event => commit({ rangeMax: +event.target.value })} />
    </div>
    {branches.map(branch => <div key={branch.id} style={s.randomBranch}>
      <Input groupStyle={{ width: '100%' }} value={branch.label || ''} placeholder="Название варианта" onChange={event => patch(branch.id, { label: event.target.value })} />
      <div style={s.randomBranchRange}>
        <span style={s.rangeLabel}>Диапазон от</span>
        <Input type="number" step="1" value={branch.from} style={s.rangeInput} onChange={event => patch(branch.id, { from: +event.target.value })} />
        <span style={s.rangeLabel}>до</span>
        <Input type="number" step="1" value={branch.to} style={s.rangeInput} onChange={event => patch(branch.id, { to: +event.target.value })} />
        <button style={s.remove} onClick={() => commit({ branches: branches.filter(item => item.id !== branch.id) })}>×</button>
      </div>
    </div>)}
    {errors.map(error => <div key={error} style={s.error}>{error}</div>)}
    <div style={s.hint}>Выпадает целое число от N до N включительно. Интервалы вариантов должны покрывать общий диапазон и не пересекаться.</div>
    <button style={s.add} onClick={() => {
      const nextValue = lastEnd + 1;
      commit({ rangeMax: Math.max(config.rangeMax, nextValue), branches: [...branches, { id: uuidv4(), label: `Вариант ${branches.length + 1}`, from: nextValue, to: nextValue }] });
    }}>+ Добавить вариант</button>
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
  rangeLabel: { color: '#718096', fontSize: 12, flexShrink: 0 },
  rangeInput: { width: 62, flex: 'none' },
  error: { color: '#fc8181', fontSize: 11, marginBottom: 5, lineHeight: 1.4 },
  randomBranch: { borderBottom: '1px solid #2d3250', paddingBottom: 7, marginBottom: 7 },
  randomBranchRange: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 },
  formulaPreview: { minHeight: 32, marginBottom: 8, padding: '7px 9px', background: '#0f172a', border: '1px solid #2d3458', borderRadius: 6, color: '#cbd5e1', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  goodPlaceholder: { color: '#68d391', fontWeight: 700 },
  badPlaceholder: { color: '#fc8181', fontWeight: 700 },
  bracket: { color: '#facc15', fontWeight: 800 },
  debugBox: { margin: '8px 0', padding: 8, background: '#111827', border: '1px solid #2d3458', borderRadius: 7 },
  debugRow: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 },
  debugInput: { width: 90, marginLeft: 'auto', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12 },
  debugResult: { color: '#68d391', fontSize: 12, fontWeight: 700 },
};
