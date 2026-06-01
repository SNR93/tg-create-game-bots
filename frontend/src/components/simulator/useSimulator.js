import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

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

function interpolate(text, vars) {
  // Keep {{varName}} as-is when variable is missing so users can spot the problem instantly
  return String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const variable = vars?.[name.trim()];
    return variable !== undefined ? String(variable.value ?? '') : match;
  });
}

function evalBranchCond(cond, vars) {
  const varData = vars[cond.varName];
  if (!varData) return false;
  const val    = varData.value;
  const target = cond.value;
  switch (cond.operator) {
    case '==': return String(val) === String(target) || val === target;
    case '!=': return String(val) !== String(target) && val !== target;
    case '>':  return +val >  +target;
    case '<':  return +val <  +target;
    case '>=': return +val >= +target;
    case '<=': return +val <= +target;
    default:   return false;
  }
}

const TYPE_LABEL = { startNode:'Начало истории', menuNode:'Глобальное меню', settingsNode:'Настройки', customCommandNode:'Своя команда', continueStoryNode:'Продолжить историю', invokeCommandNode:'Вызвать команду', messageChainNode:'Цепочка сообщений', simpleMessageNode:'Сообщение', mediaNode:'Медиа-подборка', inventoryNode:'Инвентарь', formulaNode:'Расчёт чисел', randomNode:'Случайный выбор', checkpointNode:'Контрольная точка', relationNode:'Отношения', achievementNode:'Достижение', promocodeNode:'Промокод', subscenarioNode:'Подсценарий', returnNode:'Возврат', purchaseNode:'Покупка Stars', delayNode:'Задержка', conditionNode:'Проверка текста', variableNode:'Переменные', applicationNode:'Уведомление' };

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
    setRuntimeVars(v => ({ ...v, [name]: { ...v[name], value } }));
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
    const callStack = [];

    // Find story root: backward-compat startNode, then first node with no incoming edges
    const hasIncoming = new Set(edges.filter(e => !e.data?.isComment).map(e => e.target));
    const entryTypes = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'commentNode', 'groupNode']);
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
          pushMsg({ from: 'bot', type: d.type === 'audio' ? 'voice' : (d.type || 'text'), text: interpolate(d.text, runtimeVarsRef.current), url: d.url, fileName: d.fileName, protected: d.protected, asVideoNote: d.asVideoNote });
          pushLog({ kind: 'msg', nodeId, msg: `Отправлено: ${d.type||'text'}` });
          await sleep(350);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;
        }

        case 'messageChainNode': {
          for (const msg of (node.data.messages || [])) {
            if (stopRef.current) break;
            if (msg.delay > 0) {
              setStatus('delay');
              pushLog({ kind: 'delay', nodeId, msg: `Задержка ${msg.delay} сек` });
              await doDelay(msg.delay);
              setStatus('running');
            }
            pushMsg({ from: 'bot', type: msg.type === 'audio' ? 'voice' : (msg.type || 'text'), text: interpolate(msg.text, runtimeVarsRef.current), url: msg.url, fileName: msg.fileName, protected: msg.protected, asVideoNote: msg.asVideoNote });
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
          const sec = node.data.seconds || 3;
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
              const cur = v[varName] || { type: varType, value: varType === 'number' ? 0 : false };
              let nv = value ?? (varType === 'number' ? 0 : false);
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

        case 'formulaNode':
          setRuntimeVars(previous => {
            const next = { ...previous };
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
          pushLog({ kind: 'notification', nodeId, msg: `🏆 ${interpolate(node.data.title || node.data.achievementKey || 'Достижение', runtimeVarsRef.current)}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

        case 'promocodeNode': {
          pushMsg({ from: 'bot', type: 'text', text: interpolate(node.data.prompt || 'Введите промокод:', runtimeVarsRef.current) });
          setStatus('waiting_input');
          const code = await new Promise(resolve => { inputResolveRef.current = resolve; });
          if (stopRef.current) break;
          setStatus('running');
          pushLog({ kind: 'notification', nodeId, msg: `🎟 Введён промокод: ${code}` });
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
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
          const branches = node.data.branches || [];
          const total = branches.reduce((sum, branch) => sum + Math.max(1, +branch.weight || 1), 0);
          let roll = Math.random() * total;
          const branch = branches.find(item => (roll -= Math.max(1, +item.weight || 1)) < 0);
          pushLog({ kind: 'condition', nodeId, msg: `🎲 ${branch?.label || 'Нет вариантов'}` });
          nodeId = branch ? getNext(edges, nodes, nodeId, `random-${branch.id}`) : null;
          break;
        }

        case 'keyboardNode': {
          const buttons = (node.data.buttons || []).map(button => ({ ...button, label: interpolate(button.label, runtimeVarsRef.current) }));
          pushMsg({ from: 'bot', type: 'keyboard', buttons });
          pushLog({ kind: 'keyboard', nodeId, msg: `Ожидание нажатия (${buttons.length} вариантов)` });
          setStatus('waiting_input');
          const clickedId = await new Promise(r => { inputResolveRef.current = r; });
          if (stopRef.current) break;
          setStatus('running');
          const btn = buttons.find(b => b.id === clickedId);
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
          let chosen = null;
          for (const branch of branches) {
            const conds = branch.conditions || [];
            // No conditions = else branch (always matches)
            const matches = conds.length === 0 || conds.every(c => evalBranchCond(c, runtimeVarsRef.current));
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
          pushMsg({ from: 'bot', type: 'notification', text: interpolate(node.data.title || 'Уведомление', runtimeVarsRef.current) });
          pushLog({ kind: 'notification', nodeId, msg: node.data.title || 'Уведомление' });
          await sleep(300);
          nodeId = getNext(edges, nodes, nodeId, 'continue') ?? getNext(edges, nodes, nodeId);
          break;

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
