import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import PlaceholderField from './PlaceholderField';
import { EDITOR_LIMITS, TELEGRAM_LIMITS, isSystemPlaceholderName } from '../../telegramLimits';
import { normalizeRandomConfig, randomConfigErrors } from '../../randomUtils';
import { uploadBotMedia } from '../../api';

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

const ACTION_META = {
  add:    { icon: '➕', label: 'Добавить', color: '#68d391' },
  remove: { icon: '➖', label: 'Убрать',   color: '#fc8181' },
  set:    { icon: '🔢', label: 'Установить', color: '#f6ad55' },
};

export function InventoryInspector({ data, onUpdate }) {
  const entries = data.entries || [];
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return (
    <Section title="Операции с инвентарем">
      {entries.length === 0 && <div style={s.hint}>Нет операций. Добавьте первую ниже.</div>}
      {entries.map(entry => {
        const meta = ACTION_META[entry.action || 'add'];
        return (
          <div key={entry.id} style={s.invCard}>
            <div style={s.invCardHead}>
              <span style={{ fontSize: 14, marginRight: 4 }}>{meta.icon}</span>
              <select
                style={{ ...s.select, flex: 1, color: meta.color, fontWeight: 600 }}
                value={entry.action || 'add'}
                onChange={event => patch(entry.id, { action: event.target.value })}
              >
                <option value="add">Добавить</option>
                <option value="remove">Убрать</option>
                <option value="set">Установить</option>
              </select>
              <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
            </div>
            <div style={s.invCardBody}>
              <div style={s.invRow}>
                <span style={s.invLabel}>Предмет</span>
                <Input value={entry.itemKey || ''} placeholder="ключ_предмета" onChange={event => patch(entry.id, { itemKey: event.target.value })} />
              </div>
              <div style={s.invRow}>
                <span style={s.invLabel}>Кол-во</span>
                <Input type="number" min="0" value={entry.quantity ?? 1} style={{ width: 80, flex: 'none' }} onChange={event => patch(entry.id, { quantity: +event.target.value })} />
              </div>
            </div>
          </div>
        );
      })}
      <button style={s.add} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), itemKey: '', action: 'add', quantity: 1 }] })}>
        + Добавить операцию
      </button>
    </Section>
  );
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
  // Multiplicative %: *50% → *(50/100), /50% → /(50/100)
  let normalized = withValues.replace(/([*/])\s*(\d+(?:[.,]\d+)?)\s*%/g,
    (_, op, n) => `${op}(${n.replace(',', '.')}/100)`);
  // Additive %: +50% → *(1+50/100)  i.e. "add 50% of the current value"
  //             -50% → *(1-50/100)  i.e. "subtract 50% of the current value"
  normalized = normalized.replace(/([+\-])\s*(\d+(?:[.,]\d+)?)\s*%/g,
    (_, op, n) => `*(1${op}${n.replace(',', '.')}/100)`);
  if (!/^[\d+\-*/().\s]+$/.test(normalized)) throw new Error('Недопустимые символы');
  const result = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(result)) throw new Error('Результат не число');
  return Number.isInteger(result) ? result : Math.ceil(result);
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
    <div style={s.fieldLabel}>Заголовок (поддерживает {'{{переменные}}'}):</div>
    <PlaceholderField as="textarea" rows={3} value={data.header || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting
      style={{ ...s.input, flex: 'none', width: '100%' }}
      placeholder="Ваш инвентарь:" onChange={event => onUpdate({ header: event.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Формат строки предмета:</div>
    <Input value={data.itemFormat || '{{item}} x{{amount}}'} placeholder="{{item}} x{{amount}}" onChange={event => onUpdate({ itemFormat: event.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Текст когда инвентарь пуст:</div>
    <PlaceholderField as="textarea" rows={2} value={data.emptyText || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter
      style={{ ...s.input, flex: 'none', width: '100%' }}
      placeholder="Инвентарь пуст." onChange={event => onUpdate({ emptyText: event.target.value })} />
    <div style={s.hint}>В формате строки доступны {'{{item}}'} и {'{{amount}}'}. Каждый предмет — с новой строки.</div>
  </Section>;
}

export function FormulaInspector({ data, onUpdate, botVariables }) {
  const entries = data.entries || [];
  const allVarEntries = Object.entries(botVariables || {});
  const numericVars = allVarEntries.filter(([, v]) => v.type === 'number').map(([name]) => name);
  const placeholders = useMemo(() => formulaPlaceholders(data.formula), [data.formula]);
  const [debugValues, setDebugValues] = useState({});

  const instantResult = useMemo(() => {
    if (!data.formula) return null;
    const defaults = Object.fromEntries(Object.entries(botVariables || {}).map(([n, v]) => [n, v.defaultValue ?? 0]));
    const vals = { ...defaults, ...debugValues };
    try { return evaluateFormulaExpression(data.formula, vals); }
    catch (error) { return error.message; }
  }, [data.formula, debugValues, botVariables]);

  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });

  return (
    <Section title="Числовые вычисления">
      <div style={s.hint}>
        Поддерживаются +, −, *, /, скобки, плейсхолдеры {"{{переменная}}"} (только числовые).
        Переменная-результат в формуле использует своё старое значение, затем перезаписывается.
      </div>

      {/* Куда записать результат */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...s.hint, marginBottom: 4 }}>Куда записать результат:</div>
        <select style={{ ...s.select, width: '100%' }} value={data.varName || ''} onChange={event => onUpdate({ varName: event.target.value })}>
          <option value="">— не сохранять —</option>
          {numericVars.map(name => <option key={name}>{name}</option>)}
        </select>
        {numericVars.length === 0 && <div style={{ ...s.hint, marginTop: 4 }}>Сначала создайте числовую переменную в ноде «Переменная».</div>}
      </div>

      {/* Формула — textarea */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ ...s.hint, marginBottom: 4 }}>Формула:</div>
        <PlaceholderField
          as="textarea"
          rows={4}
          value={data.formula || ''}
          placeholder={"({{деньги}}+5)*2"}
          onChange={event => onUpdate({ formula: event.target.value })}
          style={{ ...s.input, flex: 'none', width: '100%', resize: 'vertical', minHeight: 72, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}
        />
      </div>

      {/* Подсветка плейсхолдеров */}
      <FormulaPreview formula={data.formula || ''} botVariables={botVariables} />

      {/* Результат (мгновенный на основе дефолтных значений + отладочных) */}
      {data.formula && (
        <div style={s.resultBox}>
          <span style={s.resultLabel}>Результат</span>
          <span style={Number.isFinite(Number(instantResult)) ? s.resultValue : s.resultError}>
            {instantResult === null ? '—' : String(instantResult)}
          </span>
        </div>
      )}

      {/* Отладочные значения для плейсхолдеров */}
      {placeholders.length > 0 && (
        <div style={s.debugBox}>
          <div style={{ ...s.hint, marginBottom: 6 }}>Тест-значения (переопределяют дефолт):</div>
          {placeholders.map(name => (
            <label key={name} style={s.debugRow}>
              <span style={{ ...s.key, color: botVariables?.[name]?.type === 'number' ? '#68d391' : '#fc8181' }}>
                {name}
              </span>
              <input
                type="number"
                style={s.debugInput}
                value={debugValues[name] ?? ''}
                placeholder={String(botVariables?.[name]?.defaultValue ?? 0)}
                onChange={event => setDebugValues(values => ({ ...values, [name]: event.target.value }))}
                onKeyDown={event => event.stopPropagation()}
              />
            </label>
          ))}
        </div>
      )}

      {/* Все доступные переменные */}
      {allVarEntries.length > 0 && (
        <div style={s.varsBox}>
          <div style={s.varsTitle}>📦 Доступные переменные</div>
          {allVarEntries.map(([name, v]) => (
            <div key={name} style={s.varRow}>
              <span style={{ ...s.varName, color: v.type === 'number' ? '#68d391' : '#a78bfa' }}>{name}</span>
              <span style={s.varType}>{v.type}</span>
              <span style={s.varVal}>{String(v.defaultValue ?? (v.type === 'number' ? 0 : ''))}</span>
            </div>
          ))}
        </div>
      )}

      {/* Старый режим операций */}
      {!data.formula && (
        <>
          <div style={{ ...s.hint, borderTop: '1px solid #2d3458', paddingTop: 10, marginTop: 6 }}>
            Старый режим: пошаговые операции (работает когда формула пустая).
          </div>
          {entries.map(entry => (
            <div key={entry.id} style={s.row}>
              <select style={{ ...s.select, flex: 1 }} value={entry.varName || ''} onChange={event => patch(entry.id, { varName: event.target.value })}>
                <option value="">Переменная</option>{numericVars.map(name => <option key={name}>{name}</option>)}
              </select>
              <select style={s.select} value={entry.operator || 'set'} onChange={event => patch(entry.id, { operator: event.target.value })}>
                <option value="set">=</option><option value="add">+</option><option value="subtract">−</option><option value="multiply">×</option><option value="divide">÷</option>
              </select>
              <Input type="number" value={entry.value ?? 0} style={{ width: 65, flex: 'none' }} onChange={event => patch(entry.id, { value: +event.target.value })} />
              <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
            </div>
          ))}
          <button style={s.add} disabled={!numericVars.length} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), varName: numericVars[0] || '', operator: 'add', value: 1 }] })}>
            + Добавить вычисление
          </button>
        </>
      )}
    </Section>
  );
}

export function CheckpointInspector({ data, onUpdate }) {
  return <Section title="Чекпоинт"><Input value={data.title || ''} placeholder="Название чекпоинта" onChange={event => onUpdate({ title: event.target.value })} /><div style={s.hint}>При прохождении этой ноды сохраняется точка прогресса игрока.</div></Section>;
}

const REL_ACTION = { add: { icon: '💚', label: 'Увеличить' }, subtract: { icon: '❤️', label: 'Уменьшить' }, set: { icon: '🔢', label: 'Установить' } };

export function RelationInspector({ data, onUpdate }) {
  const entries = data.entries || [];
  const patch = (id, value) => onUpdate({ entries: entries.map(entry => entry.id === id ? { ...entry, ...value } : entry) });
  return (
    <Section title="Отношения с персонажами">
      {entries.length === 0 && <div style={s.hint}>Нет изменений. Добавьте персонажа ниже.</div>}
      {entries.map(entry => {
        const meta = REL_ACTION[entry.action || 'add'];
        return (
          <div key={entry.id} style={s.invCard}>
            <div style={s.invCardHead}>
              <span style={{ fontSize: 14, marginRight: 4 }}>{meta.icon}</span>
              <select style={{ ...s.select, flex: 1, fontWeight: 600 }} value={entry.action || 'add'} onChange={e => patch(entry.id, { action: e.target.value })}>
                <option value="add">Увеличить</option>
                <option value="subtract">Уменьшить</option>
                <option value="set">Установить</option>
              </select>
              <button style={s.remove} onClick={() => onUpdate({ entries: entries.filter(item => item.id !== entry.id) })}>×</button>
            </div>
            <div style={s.invCardBody}>
              <div style={s.invRow}>
                <span style={s.invLabel}>Персонаж</span>
                <Input value={entry.characterKey || ''} placeholder="ключ_персонажа" onChange={e => patch(entry.id, { characterKey: e.target.value })} />
              </div>
              <div style={s.invRow}>
                <span style={s.invLabel}>На сколько</span>
                <Input type="number" value={entry.value ?? 1} style={{ width: 80, flex: 'none' }} onChange={e => patch(entry.id, { value: +e.target.value })} />
              </div>
            </div>
          </div>
        );
      })}
      <button style={s.add} onClick={() => onUpdate({ entries: [...entries, { id: uuidv4(), characterKey: '', action: 'add', value: 1 }] })}>
        + Добавить изменение
      </button>
    </Section>
  );
}

export function AchievementInspector({ data, onUpdate }) {
  return (
    <Section title="Выдать достижение">
      <div style={s.fieldLabel}>Уникальный ключ достижения:</div>
      <Input value={data.achievementKey || ''} placeholder="уникальный_ключ" onChange={e => onUpdate({ achievementKey: e.target.value })} />
      <div style={{ ...s.fieldLabel, marginTop: 8 }}>Название для игрока (поддерживает {'{{переменные}}'}):</div>
      <PlaceholderField value={data.title || ''} maxLength={EDITOR_LIMITS.shortText} placeholder="Первое достижение" onChange={e => onUpdate({ title: e.target.value })} style={{ ...s.input, flex: 'none', width: '100%' }} />
      <div style={{ ...s.fieldLabel, marginTop: 8 }}>URL картинки (необязательно):</div>
      <Input value={data.imageUrl || ''} maxLength={EDITOR_LIMITS.url} placeholder="https://example.com/badge.png" onChange={e => onUpdate({ imageUrl: e.target.value })} />
      <label style={{ ...s.check, marginTop: 8 }}>
        <input type="checkbox" checked={data.notify !== false} onChange={e => onUpdate({ notify: e.target.checked })} />
        <span>Показать уведомление игроку при получении</span>
      </label>
    </Section>
  );
}

export function AchievementsViewInspector({ data, onUpdate }) {
  return <Section title="Показать достижения">
    <PlaceholderField as="textarea" rows={4} value={data.template || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting
      style={{ ...s.input, flex: 'none', width: '100%' }}
      placeholder="Достижения: {{unlocked}} / {{total}}" onChange={event => onUpdate({ template: event.target.value })} />
    <div style={s.hint}>{'{{unlocked}}'} — кол-во полученных, {'{{total}}'} — общее кол-во достижений на схеме.</div>
  </Section>;
}

export function PromocodeInspector({ data, onUpdate, botVariables }) {
  const rewardVars = data.rewardVars || [];
  const allVars = Object.keys(botVariables || {});
  const patchVar = (id, val) => onUpdate({ rewardVars: rewardVars.map(e => e.id === id ? { ...e, ...val } : e) });

  return (
    <Section title="Промокод">
      <div style={s.fieldLabel}>Текст запроса промокода:</div>
      <PlaceholderField as="textarea" rows={2} value={data.prompt || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter
        style={{ ...s.input, flex: 'none', width: '100%', resize: 'vertical' }}
        placeholder="Введите промокод:" onChange={e => onUpdate({ prompt: e.target.value })} />

      <div style={{ ...s.fieldLabel, marginTop: 12 }}>Переменные при успехе:</div>
      {rewardVars.length === 0 && <div style={s.hint}>Добавьте переменные, которые изменятся при успешном промокоде.</div>}
      {rewardVars.map(entry => (
        <div key={entry.id} style={s.row}>
          <select style={{ ...s.select, flex: 1 }} value={entry.varName || ''} onChange={e => patchVar(entry.id, { varName: e.target.value })}>
            <option value="">— переменная —</option>
            {allVars.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <span style={s.rangeLabel}>=</span>
          <Input value={entry.varValue ?? ''} placeholder="значение" style={{ width: 90, flex: 'none' }} onChange={e => patchVar(entry.id, { varValue: e.target.value })} />
          <button style={s.remove} onClick={() => onUpdate({ rewardVars: rewardVars.filter(e => e.id !== entry.id) })}>×</button>
        </div>
      ))}
      <button style={s.add} onClick={() => onUpdate({ rewardVars: [...rewardVars, { id: uuidv4(), varName: '', varValue: '' }] })}>
        + Добавить переменную
      </button>
      <div style={s.hint}>При неверном промокоде — обычный выход, переменные не меняются.</div>
    </Section>
  );
}

export function SubscenarioInspector({ data, onUpdate, nodes }) {
  return (
    <Section title="Подсценарий">
      <div style={s.fieldLabel}>Название этого вызова:</div>
      <Input value={data.title || ''} placeholder="Например: Флэшбек или Диалог с NPC" onChange={e => onUpdate({ title: e.target.value })} />
      <div style={{ ...s.fieldLabel, marginTop: 8 }}>Точка входа (нода):</div>
      <select style={{ ...s.select, width: '100%' }} value={data.targetNodeId || ''} onChange={event => onUpdate({ targetNodeId: event.target.value })}>
        <option value="">Выберите точку входа</option>
        {(nodes || []).filter(node => node.type !== 'startNode' && node.type !== 'commentNode').map(node => (
          <option key={node.id} value={node.id}>{node.data?.title || node.type} · {node.data?.nodeId || node.id.slice(0, 7)}</option>
        ))}
      </select>
      <div style={s.hint}>После ноды «Возврат» выполнение продолжится по обычному выходу этой ноды.</div>
    </Section>
  );
}

export function ReturnInspector({ data, onUpdate, nodes }) {
  const subscenarioNodes = (nodes || []).filter(n => n.type === 'subscenarioNode');
  return (
    <Section title="Возврат из подсценария">
      {subscenarioNodes.length === 0
        ? <div style={s.hint}>В сценарии нет нод «Подсценарий». По умолчанию возвращается из последнего вызванного.</div>
        : (
          <>
            <div style={s.fieldLabel}>Вернуться из:</div>
            <select style={{ ...s.select, width: '100%' }} value={data.subscenarioNodeId || ''} onChange={e => onUpdate({ subscenarioNodeId: e.target.value })}>
              <option value="">Последний активный подсценарий</option>
              {subscenarioNodes.map(n => (
                <option key={n.id} value={n.id}>{n.data?.title || 'Подсценарий'} · {n.data?.nodeId || n.id.slice(0, 7)}</option>
              ))}
            </select>
            <div style={s.hint}>Если указан конкретный — возвращается именно из него. Иначе — из последнего вызванного.</div>
          </>
        )
      }
    </Section>
  );
}

export function PurchaseInspector({ data, onUpdate }) {
  return (
    <Section title="Покупка Telegram Stars ⭐">
      <div style={s.fieldLabel}>Ключ товара из магазина:</div>
      <Input value={data.productKey || ''} placeholder="premium_pack" onChange={e => onUpdate({ productKey: e.target.value })} />
      <div style={s.hint}>
        Товар, цену и награду настройте в разделе «Магазин» в Админ-панели.
        Сценарий продолжится по обычному выходу после успешной оплаты.
      </div>
    </Section>
  );
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
  return (
    <Section title="Ввод текста от игрока">
      <div style={s.fieldLabel}>Вопрос / подсказка для игрока:</div>
      <PlaceholderField as="textarea" rows={3} value={data.prompt || ''} maxLength={500} showCounter
        style={{ ...s.input, flex: 'none', width: '100%', resize: 'vertical' }}
        placeholder="Как тебя зовут?" onChange={e => onUpdate({ prompt: e.target.value })} />
      <div style={{ ...s.fieldLabel, marginTop: 10 }}>Сохранить ответ в переменную:</div>
      <div style={s.row}>
        <Input value={data.varName || ''} placeholder="имя_переменной" onChange={e => onUpdate({ varName: e.target.value })} />
        <select style={{ ...s.select, flexShrink: 0 }} value={data.varType || 'text'} onChange={e => onUpdate({ varType: e.target.value })}>
          <option value="text">текст</option>
          <option value="number">число</option>
        </select>
      </div>
      <div style={s.hint}>Бот отправит вопрос, ожидает ответа игрока и сохраняет его в указанную переменную.</div>
    </Section>
  );
}

export function EditMessageInspector({ data, onUpdate }) {
  return <Section title="Изменить последнее сообщение">
    <PlaceholderField as="textarea" rows={4} value={data.text || ''} maxLength={TELEGRAM_LIMITS.messageText} showCounter formatting
      style={{ ...s.input, flex: 'none', width: '100%' }}
      placeholder="Новый текст сообщения" onChange={e => onUpdate({ text: e.target.value })} />
    <div style={s.hint}>Если ранее бот не отправлял текстовое сообщение, будет создано новое.</div>
  </Section>;
}

export function PollInspector({ data, onUpdate }) {
  const options = data.options || [];
  return (
    <Section title="Опрос или тест">
      <div style={s.fieldLabel}>Вопрос:</div>
      <Input value={data.question || ''} maxLength={TELEGRAM_LIMITS.pollQuestion} placeholder="Введите вопрос..." onChange={e => onUpdate({ question: e.target.value })} />
      <div style={{ ...s.fieldLabel, marginTop: 10 }}>Варианты ответа:</div>
      {options.map((option, index) => (
        <div key={index} style={s.row}>
          <span style={{ color: '#4a5568', fontSize: 12, flexShrink: 0, width: 20 }}>{index + 1}.</span>
          <Input value={option} maxLength={TELEGRAM_LIMITS.pollOption} placeholder={`Вариант ${index + 1}`} onChange={e => onUpdate({ options: options.map((v, i) => i === index ? e.target.value : v) })} />
          <button style={s.remove} onClick={() => onUpdate({ options: options.filter((_, i) => i !== index) })}>×</button>
        </div>
      ))}
      <button style={s.add} disabled={options.length >= 10} onClick={() => onUpdate({ options: [...options, ''] })}>+ Добавить вариант</button>
      <label style={{ ...s.check, marginTop: 10 }}>
        <input type="checkbox" checked={!!data.quiz} onChange={e => onUpdate({ quiz: e.target.checked })} />
        <span>Режим теста (один правильный ответ)</span>
      </label>
      {data.quiz && options.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={s.fieldLabel}>Правильный ответ:</div>
          <select style={{ ...s.select, width: '100%' }} value={data.correctOption ?? 0} onChange={e => onUpdate({ correctOption: +e.target.value })}>
            {options.map((opt, i) => <option key={i} value={i}>{i + 1}. {opt || `Вариант ${i + 1}`}</option>)}
          </select>
        </div>
      )}
    </Section>
  );
}

export function StickerInspector({ data, onUpdate, botId }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  async function handleFile(file) {
    if (!file) return;
    setUploading(true); setUploadError('');
    try {
      const uploaded = await uploadBotMedia(botId, 'sticker', file);
      onUpdate({ sticker: uploaded.url, fileName: uploaded.fileName });
    } catch (e) { setUploadError(e.message); }
    finally { setUploading(false); }
  }
  return (
    <Section title="Стикер">
      <div style={s.fieldLabel}>file_id или URL стикера:</div>
      <Input value={data.sticker || ''} maxLength={EDITOR_LIMITS.url} placeholder="file_id или https://..." onChange={e => onUpdate({ sticker: e.target.value })} />
      {botId && (
        <>
          <div style={{ ...s.fieldLabel, marginTop: 8 }}>Или загрузить с компьютера (WebP/PNG):</div>
          <label style={s.fileUploadBtn}>
            {uploading ? '⏳ Загрузка...' : '📁 Выбрать файл'}
            <input type="file" accept="image/webp,image/png,image/gif" style={{ display: 'none' }} disabled={uploading}
              onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {data.fileName && <div style={s.fileName}>📎 {data.fileName}</div>}
          {uploadError && <div style={s.error}>{uploadError}</div>}
        </>
      )}
      <div style={s.hint}>Стикер — это анимированный или статичный WebP/PNG. Обычно вставляют file_id из чата. Загруженный файл сохраняется на сервере.</div>
    </Section>
  );
}

export function LocationInspector({ data, onUpdate }) {
  return (
    <Section title="Геолокация">
      <div style={s.fieldRow}>
        <span style={s.fieldLabel2}>🌐 Широта (lat):</span>
        <Input type="number" step="any" value={data.latitude ?? ''} placeholder="55.7558" onChange={e => onUpdate({ latitude: +e.target.value })} />
      </div>
      <div style={{ ...s.fieldRow, marginTop: 6 }}>
        <span style={s.fieldLabel2}>🌐 Долгота (lon):</span>
        <Input type="number" step="any" value={data.longitude ?? ''} placeholder="37.6176" onChange={e => onUpdate({ longitude: +e.target.value })} />
      </div>
      <div style={s.hint}>Координаты в десятичных градусах. Москва — 55.7558, 37.6176. Пример Нью-Йорка — 40.7128, −74.0060.</div>
    </Section>
  );
}

export function SubscriptionCheckInspector({ data, onUpdate }) {
  return (
    <Section title="Проверка подписки на канал">
      <div style={s.fieldLabel}>ID или юзернейм канала:</div>
      <Input value={data.channelId || ''} placeholder="@mychannel или -100123456789" onChange={e => onUpdate({ channelId: e.target.value })} />
      <div style={{ ...s.fieldLabel, marginTop: 10 }}>Сообщение если НЕ подписан:</div>
      <PlaceholderField as="textarea" rows={2} value={data.prompt || ''} maxLength={500} showCounter
        style={{ ...s.input, flex: 'none', width: '100%', resize: 'vertical' }}
        placeholder="Подпишитесь на канал, чтобы продолжить." onChange={e => onUpdate({ prompt: e.target.value })} />
      <div style={s.hint}>✅ Левый выход — подписан &nbsp;|&nbsp; ❌ Правый — не подписан. Сообщение с кнопкой подписки отправляется только не подписанным игрокам.</div>
    </Section>
  );
}

export function HttpRequestInspector({ data, onUpdate }) {
  return <Section title="HTTP-запрос">
    <div style={s.fieldLabel}>Метод и URL:</div>
    <div style={s.row}>
      <select style={{ ...s.select, flexShrink: 0 }} value={data.method || 'GET'} onChange={e => onUpdate({ method: e.target.value })}>
        {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
      </select>
      <PlaceholderField style={{ ...s.input, flex: 1, minWidth: 0 }} value={data.url || ''} placeholder="https://api.example.com/endpoint" onChange={e => onUpdate({ url: e.target.value })} />
    </div>
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Заголовки (JSON):</div>
    <Input value={data.headers || '{}'} placeholder='{"Authorization":"Bearer token"}' onChange={e => onUpdate({ headers: e.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Тело запроса (поддерживает {'{{плейсхолдеры}}'}):</div>
    <PlaceholderField style={{ ...s.input, flex: 'none', width: '100%' }} value={data.body || ''} placeholder='{"key":"{{Переменная}}"}' onChange={e => onUpdate({ body: e.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Путь к значению в ответе (dot-нотация):</div>
    <Input value={data.responsePath || ''} placeholder="data.user.name" onChange={e => onUpdate({ responsePath: e.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Сохранить результат в переменную:</div>
    <Input value={data.responseVar || ''} placeholder="api_result" onChange={e => onUpdate({ responseVar: e.target.value })} />
    <div style={{ ...s.fieldLabel, marginTop: 8 }}>Таймаут (мс):</div>
    <Input type="number" min="500" style={{ width: 100, flex: 'none' }} value={data.requestTimeout || 5000} onChange={e => onUpdate({ requestTimeout: +e.target.value })} />
    <div style={s.hint}>✅ Успех → левый выход &nbsp;|&nbsp; ❌ Ошибка → правый выход.</div>
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
  return (
    <Section title="Случайные варианты">
      <div style={s.hint}>Генерируется случайное число в диапазоне, потом бот идёт по совпадающей ветке.</div>
      <div style={{ ...s.row, marginBottom: 0, padding: '8px 0', borderBottom: '1px solid #2d3458' }}>
        <span style={s.rangeLabel}>Случайное число от</span>
        <Input type="number" step="1" value={config.rangeMin} style={s.rangeInput} onChange={event => commit({ rangeMin: +event.target.value })} />
        <span style={s.rangeLabel}>до</span>
        <Input type="number" step="1" value={config.rangeMax} style={s.rangeInput} onChange={event => commit({ rangeMax: +event.target.value })} />
      </div>

      {branches.length > 0 && (
        <div style={s.randomBranchHeader}>
          <span style={{ flex: 1, color: '#4a5568', fontSize: 11 }}>Название варианта</span>
          <span style={{ color: '#4a5568', fontSize: 11, width: 110, textAlign: 'center' }}>от — до</span>
        </div>
      )}
      {branches.map((branch, index) => (
        <div key={branch.id} style={s.randomBranchRow}>
          <Input value={branch.label || ''} placeholder={`Вариант ${index + 1}`}
            onChange={event => patch(branch.id, { label: event.target.value })} />
          <Input type="number" step="1" value={branch.from} style={s.rangeInput}
            onChange={event => patch(branch.id, { from: +event.target.value })} />
          <span style={{ ...s.rangeLabel, flexShrink: 0 }}>—</span>
          <Input type="number" step="1" value={branch.to} style={s.rangeInput}
            onChange={event => patch(branch.id, { to: +event.target.value })} />
          <button style={s.remove} onClick={() => commit({ branches: branches.filter(item => item.id !== branch.id) })}>×</button>
        </div>
      ))}
      {errors.map(error => <div key={error} style={s.error}>{error}</div>)}
      <button style={s.add} onClick={() => {
        const nextValue = lastEnd + 1;
        commit({ rangeMax: Math.max(config.rangeMax, nextValue), branches: [...branches, { id: uuidv4(), label: `Вариант ${branches.length + 1}`, from: nextValue, to: nextValue }] });
      }}>+ Добавить вариант</button>
    </Section>
  );
}

const s = {
  section: { padding: '14px 16px', borderBottom: '1px solid #222436' },
  title: { color: '#718096', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 9 },
  row: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 6 },
  input: { flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12 },
  inputGroup: { flex: 1, minWidth: 0, display: 'flex' },
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
  randomBranchHeader: { display: 'flex', gap: 5, alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  randomBranchRow: { display: 'flex', gap: 5, alignItems: 'center', marginBottom: 5 },
  formulaPreview: { minHeight: 32, marginBottom: 8, padding: '7px 9px', background: '#0f172a', border: '1px solid #2d3458', borderRadius: 6, color: '#cbd5e1', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  goodPlaceholder: { color: '#68d391', fontWeight: 700 },
  badPlaceholder: { color: '#fc8181', fontWeight: 700 },
  bracket: { color: '#facc15', fontWeight: 800 },
  debugBox: { margin: '8px 0', padding: 8, background: '#111827', border: '1px solid #2d3458', borderRadius: 7 },
  debugRow: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 },
  debugInput: { width: 90, marginLeft: 'auto', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 5, color: '#e2e8f0', padding: '5px 7px', fontSize: 12 },
  debugResult: { color: '#68d391', fontSize: 12, fontWeight: 700 },
  // Shared field label
  fieldLabel: { color: '#718096', fontSize: 11, fontWeight: 600, marginBottom: 4, marginTop: 2 },
  fieldLabel2: { color: '#718096', fontSize: 12, flexShrink: 0, minWidth: 110 },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 8 },
  // File upload button
  fileUploadBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2a2d3e', border: '1px solid #3a3f55', borderRadius: 6, color: '#a0aec0', fontSize: 12, padding: '5px 10px', cursor: 'pointer', marginTop: 4 },
  fileName: { fontSize: 11, color: '#718096', marginTop: 4 },
  // Formula result block
  resultBox: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0a0f1e', border: '1px solid #1e3a5f', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  resultLabel: { color: '#718096', fontSize: 12, fontWeight: 600 },
  resultValue: { color: '#68d391', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' },
  resultError: { color: '#fc8181', fontSize: 11, fontStyle: 'italic' },
  // Variables list in Formula
  varsBox: { marginTop: 10, padding: '8px 0 2px', borderTop: '1px solid #2d3458' },
  varsTitle: { color: '#718096', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  varRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' },
  varName: { flex: 1, fontSize: 12, fontWeight: 600 },
  varType: { color: '#4a5568', fontSize: 10, background: '#1a1c2a', borderRadius: 3, padding: '1px 5px' },
  varVal: { color: '#f6ad55', fontSize: 11, minWidth: 30, textAlign: 'right' },
  // Inventory card styles
  invCard: { background: '#0f172a', border: '1px solid #2d3458', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  invCardHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: '#12131a', borderBottom: '1px solid #2d3458' },
  invCardBody: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 },
  invRow: { display: 'flex', alignItems: 'center', gap: 8 },
  invLabel: { color: '#718096', fontSize: 11, width: 46, flexShrink: 0 },
};
