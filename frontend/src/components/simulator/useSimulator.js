import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { pickRandomBranch } from '../../randomUtils';
import { SYSTEM_PLACEHOLDER_VARIABLES } from '../../telegramLimits';

function getNext(edges, nodes, srcId, handle) {
  const e = handle
    ? edges.find(e => !e.data?.isComment && e.source === srcId && e.sourceHandle === handle && nodes.some(n => n.id === e.target && n.type !== 'commentNode'))
    : edges.find(e => !e.data?.isComment && e.source === srcId && nodes.some(n => n.id === e.target && n.type !== 'commentNode'));
  return e?.target ?? null;
}

function evalCondition(data, input) {
  const type = data.conditionType || 'Текст содержит';
  const val = data.caseSensitive ? (data.condition || '') : (data.condition || '').toLowerCase();
  const inp = data.caseSensitive ? input : input.toLowerCase();
  if (type === 'Текст равен')      return inp === val;
  if (type === 'Текст содержит')   return inp.includes(val);
  if (type === 'Начинается с')     return inp.startsWith(val);
  if (type === 'Заканчивается на') return inp.endsWith(val);
  if (type === 'Любой ввод')       return true;
  return false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function delaySeconds(data = {}) {
  const amount = Math.max(0, +(data.amount ?? data.seconds ?? 3) || 0);
  return amount * ({ seconds: 1, minutes: 60, hours: 3600, days: 86400 }[data.unit] || 1);
}

function interpolate(text, vars) {
  // Keep {{varName}} as-is when variable is missing so users can spot the problem instantly
  return String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const variable = vars?.[name.trim()];
    return variable !== undefined ? String(variable.value ?? '') : match;
  });
}

function evaluateFormulaExpression(expression, vars) {
  const withValues = String(expression || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const variable = vars?.[name.trim()];
    if (!variable || variable.type !== 'number') throw new Error(`Плейсхолдер «${name.trim()}» не является числом`);
    return String(Number(variable.value) || 0);
  });
  const normalized = withValues.replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, value) => `(${String(value).replace(',', '.')}/100)`);
  if (!/^[\d+\-*/().\s]+$/.test(normalized)) throw new Error('Недопустимые символы в формуле');
  const result = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(result)) throw new Error('Формула вернула не число');
  return result;
}

function evalBranchCond(cond, session) {
  const { source = 'variable', key, varName, operator, value } = cond;
  const resolvedKey = key || varName || '';
  if (!resolvedKey) return false;

  let actual;
  if (source === 'inventory') actual = session.inventory?.[resolvedKey] ?? 0;
  else if (source === 'relation') actual = session.relations?.[resolvedKey] ?? 0;
  else if (source === 'achievement') {
    const has = (session.achievementList || []).includes(resolvedKey);
    if (operator === 'has') return has;
    if (operator === 'not_has') return !has;
    return has;
  } else if (source === 'global') {
    const gv = session.globalVars?.[resolvedKey];
    if (!gv) return false;
    actual = gv.value;
  } else {
    const varData = session.vars?.[resolvedKey] || session.systemVars?.[resolvedKey];
    if (!varData) return false;
    actual = varData.value;
  }

  switch (operator) {
    case '==': return String(actual) === String(value) || actual == value;
    case '!=': return String(actual) !== String(value) && actual != value;
    case '>':  return +actual > +value;
    case '<':  return +actual < +value;
    case '>=': return +actual >= +value;
    case '<=': return +actual <= +value;
    default:   return false;
  }
}

function enabledButtonConditions(buttonOrCondition) {
  if (!buttonOrCondition) return [];
  if (Array.isArray(buttonOrCondition.conditions) && buttonOrCondition.conditions.length > 0) {
    return buttonOrCondition.conditions.filter(condition => condition?.enabled);
  }
  if (buttonOrCondition.condition?.enabled) return [buttonOrCondition.condition];
  return buttonOrCondition.enabled ? [buttonOrCondition] : [];
}

function evalButtonCondition(buttonOrCondition, session) {
  const conditions = enabledButtonConditions(buttonOrCondition);
  if (conditions.length === 0) return true;
  return conditions.every(cond => evalBranchCond({ source: cond.source, key: cond.key, operator: cond.operator, value: cond.value }, session));
}

const TYPE_LABEL = { menuNode:'Глобальное меню', settingsNode:'Настройки', customCommandNode:'Своя команда', continueStoryNode:'Продолжить историю', invokeCommandNode:'Вызвать команду', messageChainNode:'Цепочка сообщений', simpleMessageNode:'Сообщение', editMessageNode:'Изменить сообщение', pollNode:'Опрос или тест', stickerNode:'Стикер', locationNode:'Геолокация', mediaNode:'Медиа-подборка', inventoryNode:'Изменить инвентарь', inventoryViewNode:'Инвентарь', formulaNode:'Расчёт чисел', randomNode:'Случайный выбор', checkpointNode:'Контрольная точка', relationNode:'Отношения', achievementNode:'Выдать достижение', achievementsViewNode:'Достижения', promocodeNode:'Промокод', subscenarioNode:'Подсценарий', returnNode:'Возврат', purchaseNode:'Покупка Stars', delayNode:'Задержка', variableNode:'Переменные', textInputNode:'Ввод текста', subscriptionCheckNode:'Проверка подписки', httpRequestNode:'HTTP-запрос', loopNode:'Цикл', breakLoopNode:'Выход из цикла', globalVariableNode:'Глобальные переменные' };

export function useSimulator(nodes, edges, initVars) {
  const [chatMsgs, setChatMsgs]       = useState([]);
  const [log, setLog]                 = useState([]);
  const [runtimeVars, setRuntimeVars] = useState({});
  const [status, setStatus]           = useState('idle');
  const [curNodeId, setCurNodeId]     = useState(null);
  const [delayInfo, setDelayInfo]     = useState(null);

  const stopRef         = useRef(false);
  const inputResolveRef = useRef(null);
  const delayResolveRef = useRef(null);
  const delayTickRef    = useRef(null);
  const executionRef    = useRef(0);
  const runtimeVarsRef  = useRef(runtimeVars);
  runtimeVarsRef.current = runtimeVars;

  function pushMsg(msg)   { setChatMsgs(p => [...p, { id: uuidv4(), ts: Date.now(), ...msg }]); }
  function pushLog(entry) { setLog(p => [...p, { id: uuidv4(), ts: new Date().toLocaleTimeString('ru'), ...entry }]); }

  async function doDelay(sec) {
    return new Promise(resolve => {
      let rem = Math.max(1, sec);
      delayResolveRef.current = resolve;
      setDelayInfo({ total: sec, remaining: rem });
      delayTickRef.current = setInterval(() => {
        rem--;
        setDelayInfo({ total: sec, remaining: rem });
        if (rem <= 0) {
          clearInterval(delayTickRef.current);
          delayTickRef.current = null;
          delayResolveRef.current = null;
          setDelayInfo(null);
          resolve();
        }
      }, 1000);
    });
  }

  function skipDelay() {
    if (delayTickRef.current)    clearInterval(delayTickRef.current);
    if (delayResolveRef.current) delayResolveRef.current();
    delayTickRef.current = null; delayResolveRef.current = null;
    setDelayInfo(null);
  }

  function sendUserMessage(text) {
    pushMsg({ from: 'user', type: 'text', text });
    if (inputResolveRef.current) {
      const res = inputResolveRef.current; inputResolveRef.current = null;
      setStatus('running'); res(text);
    }
  }

  function clickButton(btnId, label) {
    pushMsg({ from: 'user', type: 'text', text: label });
    if (inputResolveRef.current) {
      const res = inputResolveRef.current; inputResolveRef.current = null;
      setStatus('running'); res(btnId);
    }
  }

  function patchVar(name, value) {
    setRuntimeVars(v => {
      const next = { ...v, [name]: { ...v[name], value } };
      runtimeVarsRef.current = next;
      return next;
    });
  }

  const start = useCallback(async (fromId, options = {}) => {
    const executionId = ++executionRef.current;
    stopRef.current = false;
    setChatMsgs(options.commandLabel ? [{ id: uuidv4(), ts: Date.now(), from: 'user', type: 'text', text: options.commandLabel }] : []);
    setLog([]);
    const initState = {};
    Object.entries(initVars || {}).forEach(([k, v]) => {
      initState[k] = { type: v.type, value: v.defaultValue ?? (v.type === 'number' ? 0 : false) };
    });
    setRuntimeVars(initState);
    setStatus('running');
    const inventory = {};
    const relations = {};
    const achievementList = [];
    const achievementMeta = {};
    const globalVars = {};
    const systemVars = Object.fromEntries(
      Object.entries(SYSTEM_PLACEHOLDER_VARIABLES).map(([name, variable]) => [
        name,
        { type: variable.type, value: variable.defaultValue ?? '' },
      ])
    );
    const templateVars = () => {
      const dynamic = {};
      Object.entries(inventory).forEach(([itemKey, amount]) => {
        dynamic[`inventory.${itemKey}`] = { type: 'text', value: itemKey };
        dynamic[`inventory.my.${itemKey}`] = { type: 'text', value: `${itemKey} x${amount}` };
        dynamic[`inventory.my.amount.${itemKey}`] = { type: 'number', value: amount };
      });
      achievementList.forEach(key => {
        const meta = achievementMeta[key] || {};
        const title = meta.title || key;
        dynamic[`achievement.${key}`] = { type: 'text', value: meta.imageUrl ? `${title}\n${meta.imageUrl}` : title };
      });
      return { ...dynamic, ...systemVars, ...globalVars, ...runtimeVarsRef.current };
    };
    const loopCounters = {};
    const callStack = [];

    // Find story root: backward-compat startNode, then first node with no incoming edges
    const hasIncoming = new Set(edges.filter(e => !e.data?.isComment).map(e => e.target));
    const entryTypes = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode', 'commentNode', 'groupNode']);
    const storyRootId =
      nodes.find(n => n.type === 'startNode')?.id ||
      nodes.find(n => !entryTypes.has(n.type) && !hasIncoming.has(n.id))?.id ||
      null;

    // storyResumeNodeId tracks where continueStoryNode should return to (mirrors runtime behaviour)
    let storyResumeNodeId = storyRootId;

    let nodeId = fromId || nodes.find(n => n.type === 'menuNode')?.id || storyRootId;

    while (nodeId && !stopRef.current && executionRef.current === executionId) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) { pushLog({ kind: 'error', msg: `Нода ${nodeId} не найдена` }); break; }

      setCurNodeId(nodeId);
      pushLog({ kind: 'node', nodeId, nodeType: node.type, msg: `→ ${TYPE_LABEL[node.type] || node.type}` });

      // Track story position for continueStoryNode (only in non-transient story nodes)
      const nonStoryTypes = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode', 'commentNode', 'groupNode']);
      if (!nonStoryTypes.has(node.type)) storyResumeNodeId = nodeId;

      switch (node.type) {
        case 'startNode':
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'menuNode':
        case 'settingsNode':
        case 'customCommandNode':
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'continueStoryNode':
          // Resume from the last recorded story position (mirrors runtime storyResumeNodeId)
          nodeId = storyResumeNodeId;
          break;

        case 'simpleMessageNode': {
          const d = node.data;
          pushMsg({ from: 'bot', type: d.type === 'audio' ? 'voice' : (d.type || 'text'), text: interpolate(d.text, templateVars()), url: d.url, fileName: d.fileName, protected: d.protected, asVideoNote: d.asVideoNote });
          pushLog({ kind: 'msg', nodeId, msg: `Отправлено: ${d.type||'text'}` });
          await sleep(350);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'editMessageNode':
          pushMsg({ from: 'bot', type: 'notification', text: `📝 Изменено сообщение: ${interpolate(node.data.text, templateVars())}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'pollNode':
          pushMsg({ from: 'bot', type: 'notification', text: `📊 ${node.data.question || 'Опрос'} · ${(node.data.options || []).length} вариантов` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'stickerNode':
          pushMsg({ from: 'bot', type: 'notification', text: `🏷 Стикер: ${node.data.sticker || '?'}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'locationNode':
          pushMsg({ from: 'bot', type: 'notification', text: `📍 ${node.data.latitude || 0}, ${node.data.longitude || 0}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'messageChainNode': {
          for (const msg of (node.data.messages || [])) {
            if (stopRef.current) break;
            if (msg.delay > 0) {
              setStatus('delay');
              pushLog({ kind: 'delay', nodeId, msg: `Задержка ${msg.delay} сек` });
              await doDelay(msg.delay);
              setStatus('running');
            }
            pushMsg({ from: 'bot', type: msg.type === 'audio' ? 'voice' : (msg.type || 'text'), text: interpolate(msg.text, templateVars()), url: msg.url, fileName: msg.fileName, protected: msg.protected, asVideoNote: msg.asVideoNote });
            pushLog({ kind: 'msg', nodeId, msg: `Сообщение: ${msg.type||'text'}` });
            await sleep(300);
          }
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'mediaNode': {
          for (const item of (node.data.items || [])) {
            if (stopRef.current) break;
            if (item.delay > 0) {
              setStatus('delay');
              pushLog({ kind: 'delay', nodeId, msg: `Задержка ${item.delay} сек` });
              await doDelay(item.delay);
              setStatus('running');
            }
            pushMsg({ from: 'bot', type: item.type === 'audio' ? 'voice' : item.type, url: item.url, fileName: item.fileName, protected: item.protected, asVideoNote: item.asVideoNote });
            pushLog({ kind: 'msg', nodeId, msg: `Медиа: ${item.type}` });
            await sleep(300);
          }
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'delayNode': {
          const sec = delaySeconds(node.data);
          setStatus('delay');
          pushLog({ kind: 'delay', nodeId, msg: `Ожидание ${sec} сек` });
          await doDelay(sec);
          setStatus('running');
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'conditionNode': {
          setStatus('waiting_input');
          pushLog({ kind: 'wait', nodeId, msg: 'Ожидание ввода...' });
          const input = await new Promise(r => { inputResolveRef.current = r; });
          if (stopRef.current) break;
          setStatus('running');
          const ok = evalCondition(node.data, input);
          pushLog({ kind: 'condition', nodeId, msg: `Условие "${node.data.condition}": ${ok ? '✓ Да' : '✗ Нет'}` });
          nodeId = getNext(edges, nodes, nodeId, ok ? 'yes' : 'no');
          break;
        }

        case 'variableNode': {
          const entries = node.data.entries || [];
          for (const e of entries) {
            if (!e.varName) continue;
            const { varName, varType = 'boolean', action = 'set', value } = e;
            setRuntimeVars(v => {
              const cur = v[varName] || { type: varType, value: varType === 'number' ? 0 : (varType === 'text' ? '' : false) };
              let nv = value ?? (varType === 'number' ? 0 : (varType === 'text' ? '' : false));
              if (action === 'increment') nv = (+cur.value || 0) + (+value || 1);
              if (action === 'decrement') nv = (+cur.value || 0) - (+value || 1);
              return { ...v, [varName]: { type: varType, value: nv } };
            });
            pushLog({ kind: 'var', nodeId, msg: `${varName} ${action} ${value ?? ''}` });
          }
          await sleep(80);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'inventoryNode':
          for (const entry of node.data.entries || []) {
            if (!entry.itemKey) continue;
            const current = inventory[entry.itemKey] || 0;
            if (entry.action === 'set') inventory[entry.itemKey] = +entry.quantity || 0;
            if (entry.action === 'add') inventory[entry.itemKey] = current + (+entry.quantity || 0);
            if (entry.action === 'remove') inventory[entry.itemKey] = Math.max(0, current - (+entry.quantity || 0));
            pushLog({ kind: 'var', nodeId, msg: `🎒 ${entry.itemKey}: ${inventory[entry.itemKey]}` });
          }
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'inventoryViewNode': {
          const entries = Object.entries(inventory).filter(([, amount]) => Number(amount) > 0);
          const header = interpolate(node.data.header || 'Ваш инвентарь:', templateVars()).trim();
          const itemFormat = node.data.itemFormat || '{{item}} x{{amount}}';
          const lines = entries.map(([item, amount]) => itemFormat.replace(/\{\{\s*item\s*\}\}/g, item).replace(/\{\{\s*amount\s*\}\}/g, String(amount)));
          pushMsg({ from: 'bot', type: 'text', text: lines.length ? [header, ...lines].filter(Boolean).join('\n') : interpolate(node.data.emptyText || 'Инвентарь пуст.', templateVars()) });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'formulaNode':
          setRuntimeVars(previous => {
            const next = { ...previous };
            if (node.data.formula && node.data.varName) {
              try {
                const value = evaluateFormulaExpression(node.data.formula, templateVars());
                next[node.data.varName] = { type: 'number', value };
                pushLog({ kind: 'var', nodeId, msg: `🧮 ${node.data.varName}: ${value}` });
              } catch (error) {
                pushLog({ kind: 'warn', nodeId, msg: `🧮 ${error.message}` });
              }
            } else {
              for (const entry of node.data.entries || []) {
                const variable = next[entry.varName];
                if (!variable || variable.type !== 'number') continue;
                const operand = +entry.value || 0;
                let value = +variable.value || 0;
                if (entry.operator === 'set') value = operand;
                if (entry.operator === 'add') value += operand;
                if (entry.operator === 'subtract') value -= operand;
                if (entry.operator === 'multiply') value *= operand;
                if (entry.operator === 'divide' && operand !== 0) value /= operand;
                next[entry.varName] = { ...variable, value };
              }
            }
            return next;
          });
          await sleep(80);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'checkpointNode':
          pushLog({ kind: 'notification', nodeId, msg: '🚩 Прогресс сохранён' });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'relationNode':
          for (const entry of node.data.entries || []) {
            if (!entry.characterKey) continue;
            const current = relations[entry.characterKey] || 0;
            if (entry.action === 'set') relations[entry.characterKey] = +entry.value || 0;
            if (entry.action === 'add') relations[entry.characterKey] = current + (+entry.value || 0);
            if (entry.action === 'subtract') relations[entry.characterKey] = current - (+entry.value || 0);
            pushLog({ kind: 'var', nodeId, msg: `♥ ${entry.characterKey}: ${relations[entry.characterKey]}` });
          }
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'achievementNode':
          if (node.data.achievementKey && !achievementList.includes(node.data.achievementKey)) achievementList.push(node.data.achievementKey);
          if (node.data.achievementKey) achievementMeta[node.data.achievementKey] = { title: node.data.title || '', imageUrl: node.data.imageUrl || '' };
          pushLog({ kind: 'notification', nodeId, msg: `🏆 ${interpolate(node.data.title || node.data.achievementKey || 'Достижение', templateVars())}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'achievementsViewNode': {
          const total = new Set(nodes.filter(item => item.type === 'achievementNode' && item.data?.achievementKey).map(item => item.data.achievementKey)).size;
          const unlocked = achievementList.filter(key => nodes.some(item => item.type === 'achievementNode' && item.data?.achievementKey === key)).length;
          const text = (node.data.template || 'Достижения: {{unlocked}} / {{total}}').replace(/\{\{\s*unlocked\s*\}\}/g, String(unlocked)).replace(/\{\{\s*total\s*\}\}/g, String(total));
          pushMsg({ from: 'bot', type: 'text', text: interpolate(text, templateVars()) });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'promocodeNode': {
          pushMsg({ from: 'bot', type: 'text', text: interpolate(node.data.prompt || 'Введите промокод:', templateVars()) });
          setStatus('waiting_input');
          const code = await new Promise(resolve => { inputResolveRef.current = resolve; });
          if (stopRef.current) break;
          setStatus('running');
          pushLog({ kind: 'notification', nodeId, msg: `🎟 Введён промокод: ${code}` });
          nodeId = node.data.successTargetNodeId || getNext(edges, nodes, nodeId, 'continue') || getNext(edges, nodes, nodeId);
          break;
        }

        case 'invokeCommandNode': {
          const nextNodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          storyResumeNodeId = nextNodeId;
          const targetNode = nodes.find(n => n.id === node.data.targetNodeId);
          if (targetNode) {
            pushLog({ kind: 'notification', nodeId, msg: `⚡ Вызов: ${targetNode.data?.title || targetNode.type}` });
            nodeId = targetNode.id;
          } else {
            pushLog({ kind: 'skip', nodeId, msg: 'Целевая команда не найдена — пропуск' });
            nodeId = nextNodeId;
          }
          break;
        }

        case 'subscenarioNode': {
          const returnNodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          if (returnNodeId) callStack.push(returnNodeId);
          nodeId = node.data.targetNodeId || returnNodeId;
          break;
        }

        case 'returnNode':
          nodeId = callStack.pop() || null;
          break;

        case 'purchaseNode': {
          const productKey = node.data.productKey || '(товар не указан)';
          pushMsg({
            from: 'bot',
            type: 'purchase',
            productKey,
            buttons: [
              { id: 'pay', label: `⭐ Оплатить (симуляция)` },
              { id: 'skip', label: 'Пропустить' },
            ],
          });
          pushLog({ kind: 'notification', nodeId, msg: `⭐ Покупка: ${productKey}` });
          setStatus('waiting_input');
          const choice = await new Promise(r => { inputResolveRef.current = r; });
          if (stopRef.current) break;
          setStatus('running');
          pushLog({ kind: 'notification', nodeId, msg: choice === 'pay' ? '✓ Покупка подтверждена' : '✗ Покупка пропущена' });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'randomNode': {
          const { roll, branch } = pickRandomBranch(node.data);
          pushLog({ kind: 'condition', nodeId, msg: `🎲 Выпало ${roll}: ${branch?.label || 'нет подходящего варианта'}` });
          nodeId = branch ? getNext(edges, nodes, nodeId, `random-${branch.id}`) : null;
          break;
        }

        case 'keyboardNode': {
          const simSession = { vars: runtimeVarsRef.current, systemVars, inventory, relations, achievementList, globalVars };
          const allButtons = node.data.buttons || [];
          const visibleButtons = allButtons.filter(b => evalButtonCondition(b, simSession));
          const callbackButtons = visibleButtons.filter(b => b.type !== 'url');
          const displayButtons = visibleButtons.map(b => ({ ...b, label: interpolate(b.label, templateVars()) }));
          pushMsg({ from: 'bot', type: 'keyboard', buttons: displayButtons });
          if (callbackButtons.length === 0) {
            // Only URL buttons — no waiting
            pushLog({ kind: 'keyboard', nodeId, msg: `URL-кнопки показаны (${displayButtons.length})` });
            nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
            break;
          }
          pushLog({ kind: 'keyboard', nodeId, msg: `Ожидание нажатия (${callbackButtons.length} вариантов)` });
          setStatus('waiting_input');
          const clickedId = await new Promise(r => { inputResolveRef.current = r; });
          if (stopRef.current) break;
          setStatus('running');
          const btn = displayButtons.find(b => b.id === clickedId);
          const nextEdge = edges.find(e =>
            e.source === nodeId &&
            (e.sourceHandle === `left-${clickedId}` || e.sourceHandle === `right-${clickedId}`) &&
            nodes.some(n => n.id === e.target && n.type !== 'commentNode')
          );
          pushLog({ kind: 'keyboard', nodeId, msg: `Выбрано: "${btn?.label}"` });
          nodeId = nextEdge?.target ?? null;
          break;
        }

        case 'branchingNode': {
          const branches = node.data.branches || [];
          const simSession = { vars: runtimeVarsRef.current, systemVars, inventory, relations, achievementList, globalVars };
          let chosen = null;
          for (const branch of branches) {
            const conds = branch.conditions || [];
            const matches = conds.length === 0 || conds.every(c => evalBranchCond(c, simSession));
            if (matches) { chosen = branch; break; }
          }
          if (chosen) {
            pushLog({ kind: 'condition', nodeId, msg: `→ "${chosen.label}"` });
            nodeId = getNext(edges, nodes, nodeId, `branch-${chosen.id}`);
          } else {
            pushLog({ kind: 'skip', nodeId, msg: 'Ни одна ветка не сработала' });
            nodeId = null;
          }
          break;
        }

        case 'applicationNode':
          pushMsg({ from: 'bot', type: 'notification', text: interpolate(node.data.title || 'Уведомление', templateVars()) });
          pushLog({ kind: 'notification', nodeId, msg: node.data.title || 'Уведомление' });
          await sleep(300);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'textInputNode': {
          pushMsg({ from: 'bot', type: 'text', text: interpolate(node.data.prompt || 'Введите ответ:', templateVars()) });
          pushLog({ kind: 'wait', nodeId, msg: `Ввод → ${node.data.varName || '?'}` });
          setStatus('waiting_input');
          const input = await new Promise(r => { inputResolveRef.current = r; });
          if (stopRef.current) break;
          setStatus('running');
          const varName = String(node.data.varName || '').trim();
          const val = node.data.varType === 'number' ? (+input || 0) : input;
          if (varName) {
            setRuntimeVars(v => {
              const next = { ...v, [varName]: { type: node.data.varType || 'text', value: val } };
              runtimeVarsRef.current = next;
              return next;
            });
          }
          pushLog({ kind: 'var', nodeId, msg: `${varName || '?'} = "${val}"` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'subscriptionCheckNode': {
          // In simulator always simulate as subscribed for testing convenience
          pushLog({ kind: 'notification', nodeId, msg: `📡 Симуляция: подписан на ${node.data.channelId || '?'}` });
          nodeId = getNext(edges, nodes, nodeId, 'subscribed');
          break;
        }

        case 'httpRequestNode': {
          pushLog({ kind: 'notification', nodeId, msg: `🌐 HTTP ${node.data.method || 'GET'} ${(node.data.url || '').slice(0, 40)} [симуляция]` });
          if (node.data.responseVar) {
            setRuntimeVars(v => ({ ...v, [node.data.responseVar]: { type: 'text', value: '(симуляция)' } }));
          }
          nodeId = getNext(edges, nodes, nodeId, 'success');
          break;
        }

        case 'loopNode': {
          loopCounters[nodeId] = (loopCounters[nodeId] || 0);
          const max = Math.max(1, +node.data.maxIterations || 10);
          if (loopCounters[nodeId] < max) {
            loopCounters[nodeId]++;
            pushLog({ kind: 'condition', nodeId, msg: `🔁 Итерация ${loopCounters[nodeId]}/${max}` });
            nodeId = getNext(edges, nodes, nodeId, 'body');
          } else {
            loopCounters[nodeId] = 0;
            pushLog({ kind: 'condition', nodeId, msg: `🔁 Цикл завершён` });
            nodeId = getNext(edges, nodes, nodeId, 'done');
          }
          break;
        }

        case 'breakLoopNode': {
          if (node.data.targetLoopId) loopCounters[node.data.targetLoopId] = Infinity;
          pushLog({ kind: 'notification', nodeId, msg: '⏹ Выход из цикла' });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'globalVariableNode': {
          for (const entry of node.data.entries || []) {
            if (!entry.varName) continue;
            const type = entry.varType || 'number';
            const current = globalVars[entry.varName] || { type, value: type === 'number' ? 0 : false };
            let value = entry.value ?? (type === 'number' ? 0 : false);
            if (entry.action === 'increment') value = (+current.value || 0) + (+entry.value || 1);
            if (entry.action === 'decrement') value = (+current.value || 0) - (+entry.value || 1);
            globalVars[entry.varName] = { type, value };
            pushLog({ kind: 'var', nodeId, msg: `🌐 ${entry.varName} = ${value}` });
          }
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'commentNode':
          nodeId = null;
          break;

        default:
          pushLog({ kind: 'skip', nodeId, msg: `Пропуск: ${node.type}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
      }

      if (!nodeId) { pushLog({ kind: 'done', msg: '✓ Конец сценария' }); break; }
      await sleep(30);
    }

    if (!stopRef.current && executionRef.current === executionId) { setStatus('done'); setCurNodeId(null); }
  }, [nodes, edges, initVars]);

  function stop() {
    executionRef.current++;
    stopRef.current = true;
    if (inputResolveRef.current) { inputResolveRef.current(''); inputResolveRef.current = null; }
    if (delayTickRef.current)    clearInterval(delayTickRef.current);
    if (delayResolveRef.current) delayResolveRef.current();
    setStatus('idle'); setCurNodeId(null); setDelayInfo(null);
  }

  function reset() { stop(); setChatMsgs([]); setLog([]); setRuntimeVars({}); }

  function runCommand(command) {
    stop();
    setTimeout(() => start(command.nodeId, { commandLabel: command.label }), 0);
  }

  return { chatMsgs, log, runtimeVars, patchVar, status, curNodeId, delayInfo, start, stop, reset, runCommand, sendUserMessage, clickButton, skipDelay };
}
