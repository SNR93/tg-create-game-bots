import React, { useEffect } from 'react';
import { Handle, Position, useEdges, useNodeId, useUpdateNodeInternals } from '@xyflow/react';
import { normalizeRandomConfig } from '../../randomUtils';

function Frame({ children, selected, icon, title, data, input = true, output = true }) {
  const nodeId = useNodeId();
  const edges = useEdges();
  const leftConnected  = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue-left');
  const rightConnected = edges.some(e => e.source === nodeId && e.sourceHandle === 'continue');
  return (
    <div style={{ ...s.wrap, border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55' }}>
      {input && <Handle type="target" position={Position.Left} id="in" style={s.hIn} />}
      <div style={s.header}><span>{icon}</span><span style={s.title}>{title}</span></div>
      {children}
      {output && (
        <div style={s.cont}>
          <Handle
            type="source"
            position={Position.Left}
            id="continue-left"
            title="Выход влево"
            style={{ ...s.hOut, left: -6, right: 'auto', opacity: rightConnected ? 0.25 : 1 }}
            isConnectable={!rightConnected}
          />
          <span style={s.muted}>Продолжить</span>
          <Handle
            type="source"
            position={Position.Right}
            id="continue"
            style={{ ...s.hOut, opacity: leftConnected ? 0.25 : 1 }}
            isConnectable={!leftConnected}
          />
        </div>
      )}
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

export function InventoryNode({ data, selected }) {
  const entries = data.entries || [];
  return (
    <Frame selected={selected} icon="🎒" title={data.title === 'Инвентарь' ? 'Изменить инвентарь' : (data.title || 'Изменить инвентарь')} data={data}>
      {entries.length === 0 && <div style={s.empty}>Нет операций</div>}
      {entries.map(entry => <div key={entry.id} style={s.row}><span style={s.key}>{entry.itemKey || '?'}</span><span style={s.value}>{entry.action || 'add'} {entry.quantity ?? 1}</span></div>)}
    </Frame>
  );
}

export function InventoryViewNode({ data, selected }) {
  return (
    <Frame selected={selected} icon="🎒" title={data.title || 'Инвентарь'} data={data}>
      <div style={s.body}>{data.emptyText || 'Инвентарь пуст.'}</div>
      <div style={s.row}><span style={s.key}>Формат</span><span style={s.value}>{data.itemFormat || '{{item}} x{{amount}}'}</span></div>
    </Frame>
  );
}

export function FormulaNode({ data, selected }) {
  const entries = data.entries || [];
  return (
    <Frame selected={selected} icon="🧮" title={data.title || 'Формула'} data={data}>
      {data.formula ? (
        <div style={s.row}>
          <span style={{ ...s.key, color: '#68d391' }}>{data.varName || '?'}</span>
          <span style={{ ...s.value, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            = {data.formula}
          </span>
        </div>
      ) : entries.length === 0 ? (
        <div style={s.empty}>Нет вычислений</div>
      ) : entries.map(entry => (
        <div key={entry.id} style={s.row}>
          <span style={s.key}>{entry.varName || '?'}</span>
          <span style={s.value}>{entry.operator || '='} {entry.value ?? 0}</span>
        </div>
      ))}
    </Frame>
  );
}

export function CheckpointNode({ data, selected }) {
  return <Frame selected={selected} icon="🚩" title={data.title || 'Чекпоинт'} data={data}><div style={s.body}>Сохранить прогресс</div></Frame>;
}

export function RelationNode({ data, selected }) {
  const entries = data.entries || [];
  return <Frame selected={selected} icon="♥" title={data.title || 'Отношения'} data={data}>
    {entries.length === 0 && <div style={s.empty}>Нет изменений</div>}
    {entries.map(entry => <div key={entry.id} style={s.row}><span style={s.key}>{entry.characterKey || '?'}</span><span style={s.value}>{entry.action || 'add'} {entry.value ?? 1}</span></div>)}
  </Frame>;
}

export function AchievementNode({ data, selected }) {
  return <Frame selected={selected} icon="🏆" title={data.title === 'Достижение' ? 'Выдать достижение' : (data.title || 'Выдать достижение')} data={data}><div style={s.body}>{data.achievementKey || 'Укажите ключ достижения'}</div></Frame>;
}

export function AchievementsViewNode({ data, selected }) {
  return (
    <Frame selected={selected} icon="🏆" title={data.title || 'Достижения'} data={data}>
      <div style={s.body}>{data.template || 'Достижения: {{unlocked}} / {{total}}'}</div>
    </Frame>
  );
}

export function PromocodeNode({ data, selected }) {
  return <Frame selected={selected} icon="🎟" title={data.title || 'Промокод'} data={data}><div style={s.body}>{data.prompt || 'Запросить промокод у игрока'}</div></Frame>;
}

export function SubscenarioNode({ data, selected }) {
  return <Frame selected={selected} icon="↳" title={data.title || 'Подсценарий'} data={data}><div style={s.body}>Перейти к: {data.targetNodeId || 'не выбрано'}</div></Frame>;
}

export function ReturnNode({ data, selected }) {
  return <Frame selected={selected} icon="↵" title={data.title || 'Возврат'} data={data} output={false}><div style={s.body}>Вернуться из подсценария</div></Frame>;
}

export function TextInputNode({ data, selected }) {
  return (
    <Frame selected={selected} icon="✏️" title={data.title || 'Ввод текста'} data={data}>
      <div style={s.body}>{data.prompt || 'Введите ответ:'}</div>
      {data.varName && <div style={s.row}><span style={s.key}>→ {data.varName}</span><span style={s.value}>{data.varType || 'text'}</span></div>}
    </Frame>
  );
}

export function EditMessageNode({ data, selected }) {
  return <Frame selected={selected} icon="📝" title={data.title || 'Изменить сообщение'} data={data}><div style={s.body}>{data.text || 'Введите новый текст'}</div></Frame>;
}

export function PollNode({ data, selected }) {
  return <Frame selected={selected} icon="📊" title={data.title || 'Опрос или тест'} data={data}><div style={s.body}>{data.question || 'Введите вопрос'} · {(data.options || []).length} вариантов</div></Frame>;
}

export function StickerNode({ data, selected }) {
  return <Frame selected={selected} icon="🏷" title={data.title || 'Стикер'} data={data}><div style={s.body}>{data.sticker || 'Укажите file_id или URL'}</div></Frame>;
}

export function LocationNode({ data, selected }) {
  return <Frame selected={selected} icon="📍" title={data.title || 'Геолокация'} data={data}><div style={s.body}>{data.latitude || 0}, {data.longitude || 0}</div></Frame>;
}

export function SubscriptionCheckNode({ data, selected }) {
  return (
    <div style={{ ...s.wrap, border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55' }}>
      <Handle type="target" position={Position.Left} id="in" style={s.hIn} />
      <div style={s.header}><span>📡</span><span style={s.title}>{data.title || 'Проверка подписки'}</span></div>
      <div style={s.body}>{data.channelId || 'Укажите @канал'}</div>
      <div style={{ ...s.cont, color: '#22c55e' }}><span style={s.muted}>Подписан</span><Handle type="source" position={Position.Right} id="subscribed" style={s.hOut} /></div>
      <div style={{ ...s.cont, color: '#ef4444' }}><span style={s.muted}>Не подписан</span><Handle type="source" position={Position.Right} id="not_subscribed" style={s.hOut} /></div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

export function HttpRequestNode({ data, selected }) {
  return (
    <div style={{ ...s.wrap, border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55' }}>
      <Handle type="target" position={Position.Left} id="in" style={s.hIn} />
      <div style={s.header}><span>🌐</span><span style={s.title}>{data.title || 'HTTP-запрос'}</span></div>
      <div style={s.body}><span style={{ color: '#f6ad55', fontWeight: 700, fontSize: 11 }}>{data.method || 'GET'}</span> {data.url ? data.url.slice(0, 38) : 'Укажите URL'}</div>
      {data.responseVar && <div style={s.row}><span style={{ ...s.key, color: '#38bdf8' }}>→ {data.responseVar}</span></div>}
      <div style={{ ...s.cont, color: '#22c55e' }}><span style={s.muted}>Успех</span><Handle type="source" position={Position.Right} id="success" style={s.hOut} /></div>
      <div style={{ ...s.cont, color: '#ef4444' }}><span style={s.muted}>Ошибка</span><Handle type="source" position={Position.Right} id="error" style={s.hOut} /></div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

export function LoopNode({ data, selected }) {
  return (
    <div style={{ ...s.wrap, border: selected ? '1px solid #4fd1c5' : '1px solid #3a3f55' }}>
      <Handle type="target" position={Position.Left} id="in" style={s.hIn} />
      <div style={s.header}><span>🔁</span><span style={s.title}>{data.title || 'Цикл'}</span></div>
      <div style={s.body}>Итераций: {data.maxIterations || 10}</div>
      <div style={{ ...s.cont, color: '#38bdf8' }}><span style={s.muted}>Тело цикла</span><Handle type="source" position={Position.Right} id="body" style={s.hOut} /></div>
      <div style={{ ...s.cont, color: '#a78bfa' }}><span style={s.muted}>Завершить</span><Handle type="source" position={Position.Right} id="done" style={s.hOut} /></div>
      {data.nodeId && <div style={s.id}>ID {data.nodeId}</div>}
    </div>
  );
}

export function BreakLoopNode({ data, selected }) {
  return <Frame selected={selected} icon="⏹" title={data.title || 'Выход из цикла'} data={data}><div style={s.body}>Прервать цикл: {data.targetLoopId ? data.targetLoopId.slice(0, 7) : 'не выбран'}</div></Frame>;
}

export function GlobalVariableNode({ data, selected }) {
  const entries = data.entries || [];
  return (
    <Frame selected={selected} icon="🌐" title={data.title || 'Глобальные переменные'} data={data}>
      {entries.length === 0 && <div style={s.empty}>Нет операций</div>}
      {entries.map(e => <div key={e.id} style={s.row}><span style={{ ...s.key, color: '#38bdf8' }}>{e.varName || '?'}</span><span style={s.value}>{e.action || 'set'} {e.value ?? ''}</span></div>)}
    </Frame>
  );
}

export function InvokeCommandNode({ data, selected }) {
  const label = data.targetTitle || (data.targetNodeId ? data.targetNodeId.slice(0, 7) : null);
  return (
    <Frame selected={selected} icon="⚡" title={data.title || 'Вызвать команду'} data={data}>
      <div style={s.body}>{label ? `→ ${label}` : 'Не выбрана команда'}</div>
    </Frame>
  );
}

export function PurchaseNode({ data, selected }) {
  return <Frame selected={selected} icon="⭐" title={data.title || 'Покупка'} data={data}><div style={s.body}>{data.productKey || 'Укажите товар'}</div></Frame>;
}

export function RandomNode({ id, data, selected }) {
  const { rangeMin, rangeMax, branches } = normalizeRandomConfig(data);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(frame);
  }, [id, branches.length, updateNodeInternals]);

  return (
    <Frame selected={selected} icon="🎲" title={data.title || 'Случайность'} data={data} output={false}>
      <div style={s.body}>Случайное число: {rangeMin}..{rangeMax}</div>
      {branches.map((branch, index) => (
        <div key={branch.id} style={s.row}>
          <span style={s.key}>{branch.label || `Вариант ${index + 1}`}</span>
          <span style={s.value}>{branch.from}..{branch.to}</span>
          <Handle type="source" position={Position.Right} id={`random-${branch.id}`} style={{ ...s.hOut, top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      ))}
      {branches.length === 0 && <div style={s.empty}>Нет вариантов</div>}
    </Frame>
  );
}

const s = {
  wrap: { position: 'relative', background: '#2a2d3e', borderRadius: 10, minWidth: 220, overflow: 'visible' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 7px', borderBottom: '1px solid #3a3f55' },
  title: { color: '#e2e8f0', fontSize: 13, fontWeight: 600 },
  row: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid #2d3250', minHeight: 28 },
  key: { flex: 1, color: '#cbd5e0', fontSize: 12 },
  value: { color: '#f6ad55', fontSize: 11 },
  body: { color: '#a0aec0', fontSize: 12, padding: '9px 14px' },
  empty: { color: '#4a5568', fontSize: 12, padding: '8px 14px', fontStyle: 'italic' },
  cont: { position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '7px 14px' },
  muted: { color: '#718096', fontSize: 12 },
  hIn: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, left: -6, top: 17, transform: 'none' },
  hOut: { background: '#38bdf8', border: '2px solid #0f172a', width: 12, height: 12, right: -6 },
  id: { padding: '3px 14px 6px', color: '#4a5568', fontSize: 10, textAlign: 'center' },
};
