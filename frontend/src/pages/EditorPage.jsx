import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, BackgroundVariant, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import StartNode        from '../components/nodes/StartNode';
import ApplicationNode  from '../components/nodes/ApplicationNode';
import MessageChainNode from '../components/nodes/MessageChainNode';
import ConditionNode    from '../components/nodes/ConditionNode';
import DelayNode         from '../components/nodes/DelayNode';
import SimpleMessageNode from '../components/nodes/SimpleMessageNode';
import VariableNode      from '../components/nodes/VariableNode';
import KeyboardNode      from '../components/nodes/KeyboardNode';
import BranchingNode    from '../components/nodes/BranchingNode';
import CommentNode      from '../components/nodes/CommentNode';
import MediaNode        from '../components/nodes/MediaNode';
import GroupNode        from '../components/nodes/GroupNode';
import { CommandEntryNode, ContinueStoryNode } from '../components/nodes/CommandEntryNode';
import { AchievementNode, AchievementsViewNode, BreakLoopNode, CheckpointNode, CodexNode, EditCodexNode, EditMessageNode, FormulaNode, GlobalVariableNode, HttpRequestNode, InventoryNode, InventoryViewNode, InvokeCommandNode, LocationNode, LoopNode, PollNode, PromocodeNode, PurchaseNode, RandomNode, RelationNode, ReputationStatusNode, ResetProgressNode, ReturnNode, StarsShopNode, StickerNode, SubscenarioNode, SubscriptionCheckNode, TextInputNode, UnlockCodexNode } from '../components/nodes/GameplayNodes';
import { NodeDebugContext, withNodeDebug } from '../components/nodes/DebuggableNode';
import { SYSTEM_PLACEHOLDER_VARIABLES, isSystemPlaceholderName, validateScenarioText } from '../telegramLimits';
import { getNodeMeta } from '../components/nodes/nodeCatalog';

import NodePanel    from '../components/panels/NodePanel';
import ContextMenu  from '../components/panels/ContextMenu';
import HistoryPanel from '../components/panels/HistoryPanel';
import CompareView  from '../components/panels/CompareView';
import AdminPanel   from '../components/panels/AdminPanel';
import HelpModal    from '../components/panels/HelpModal';
import LoreModal    from '../components/panels/LoreModal';
import TelegramBackupModal from '../components/panels/TelegramBackupModal';
import NodeInspector from '../components/inspector/NodeInspector';
import Simulator    from '../components/simulator/Simulator';

import {
  getBot, saveBot, downloadBot,
  getTelegramStatus, startTelegramBot, stopTelegramBot,
  getBotMyRole,
} from '../api';

// ── Node type registry ──────────────────────────────────────────────
const nodeTypes = {
  startNode:         withNodeDebug(StartNode),
  applicationNode:   withNodeDebug(ApplicationNode),   // kept for backward compat
  messageChainNode:  withNodeDebug(MessageChainNode),
  conditionNode:     withNodeDebug(ConditionNode),     // kept for backward compat
  delayNode:         withNodeDebug(DelayNode),
  simpleMessageNode: withNodeDebug(SimpleMessageNode),
  variableNode:      withNodeDebug(VariableNode),
  keyboardNode:      withNodeDebug(KeyboardNode),
  branchingNode:     withNodeDebug(BranchingNode),
  commentNode:       CommentNode,
  mediaNode:         withNodeDebug(MediaNode),
  inventoryNode:     withNodeDebug(InventoryNode),
  inventoryViewNode: withNodeDebug(InventoryViewNode),
  formulaNode:       withNodeDebug(FormulaNode),
  randomNode:        withNodeDebug(RandomNode),
  checkpointNode:    withNodeDebug(CheckpointNode),
  resetProgressNode: withNodeDebug(ResetProgressNode),
  menuNode:          withNodeDebug(CommandEntryNode),
  settingsNode:      withNodeDebug(CommandEntryNode),
  customCommandNode: withNodeDebug(CommandEntryNode),
  continueStoryNode: withNodeDebug(ContinueStoryNode),
  relationNode:      withNodeDebug(RelationNode),
  achievementNode:   withNodeDebug(AchievementNode),
  achievementsViewNode: withNodeDebug(AchievementsViewNode),
  promocodeNode:     withNodeDebug(PromocodeNode),
  subscenarioNode:   withNodeDebug(SubscenarioNode),
  returnNode:        withNodeDebug(ReturnNode),
  purchaseNode:      withNodeDebug(PurchaseNode),
  starsShopNode:     withNodeDebug(StarsShopNode),
  editCodexNode:     withNodeDebug(EditCodexNode),
  unlockCodexNode:   withNodeDebug(UnlockCodexNode),
  invokeCommandNode:      withNodeDebug(InvokeCommandNode),
  textInputNode:          withNodeDebug(TextInputNode),
  editMessageNode:        withNodeDebug(EditMessageNode),
  pollNode:               withNodeDebug(PollNode),
  stickerNode:            withNodeDebug(StickerNode),
  locationNode:           withNodeDebug(LocationNode),
  subscriptionCheckNode:  withNodeDebug(SubscriptionCheckNode),
  httpRequestNode:        withNodeDebug(HttpRequestNode),
  loopNode:               withNodeDebug(LoopNode),
  breakLoopNode:          withNodeDebug(BreakLoopNode),
  globalVariableNode:     withNodeDebug(GlobalVariableNode),
  codexNode:              withNodeDebug(CodexNode),
  reputationStatusNode:  withNodeDebug(ReputationStatusNode),
  groupNode:         GroupNode,
};

const EDGE_DEFAULTS = {
  animated: false,
  style: { stroke: '#38bdf8', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8', width: 14, height: 14 },
};

const COMMENT_EDGE_DEFAULTS = {
  animated: false,
  style: { stroke: '#f6ad55', strokeWidth: 2, strokeDasharray: '6 4' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#f6ad55', width: 14, height: 14 },
  data: { isComment: true },
};

function makeDefaultData(type) {
  switch (type) {
    case 'applicationNode':  return { title: 'Заявка' };
    case 'messageChainNode': return { title: 'Цепочка сообщений', messages: [{ id: uuidv4(), type: 'text', text: '', url: '', fileName: '', delay: 0, protected: false, asVideoNote: false }] };
    case 'conditionNode':    return { condition: 'Текст содержит...', conditionType: 'Текст содержит' };
    case 'delayNode':        return { amount: 3, unit: 'seconds' };
    case 'simpleMessageNode':return { type: 'text', text: '', url: '', fileName: '', protected: false, asVideoNote: false };
    case 'variableNode':     return { entries: [] };
    case 'keyboardNode':     return { title: 'Клавиатура', buttons: [{ id: uuidv4(), label: 'Вариант 1' }, { id: uuidv4(), label: 'Вариант 2' }] };
    case 'branchingNode':   return { title: 'Ветвление', branches: [{ id: uuidv4(), label: 'Ветка 1', conditions: [] }, { id: uuidv4(), label: 'Иначе', conditions: [] }] };
    case 'commentNode':     return { title: 'Комментарий', text: '' };
    case 'mediaNode':       return { title: 'Медиа', items: [], asAlbum: false };
    case 'inventoryNode':   return { title: 'Изменить инвентарь', entries: [] };
    case 'inventoryViewNode': return { title: 'Инвентарь', header: 'Ваш инвентарь:', itemFormat: '{{item}} x{{amount}}', emptyText: 'Инвентарь пуст.' };
    case 'formulaNode':     return { title: 'Формула', entries: [] };
    case 'randomNode':      return { title: 'Случайность', rangeMin: 1, rangeMax: 10, branches: [{ id: uuidv4(), label: 'Вариант 1', from: 1, to: 5 }, { id: uuidv4(), label: 'Вариант 2', from: 6, to: 10 }] };
    case 'checkpointNode':  return { title: 'Чекпоинт' };
    case 'resetProgressNode': return { title: 'Сброс прогресса', preserveVars: [] };
    case 'menuNode':        return { title: 'Глобальное меню' };
    case 'settingsNode':    return { title: 'Настройки' };
    case 'customCommandNode': return { title: 'Команда', command: '', description: '', aliases: '', showInMenu: true };
    case 'continueStoryNode': return { title: 'Продолжить историю' };
    case 'relationNode':    return { title: 'Отношения', entries: [] };
    case 'achievementNode': return { title: 'Выдать достижение', achievementKey: '', imageUrl: '', notify: true };
    case 'achievementsViewNode': return { title: 'Достижения', template: 'Достижения: {{achievements.unlocked}} / {{achievements.total}}\n{{achievements.list}}' };
    case 'promocodeNode':   return { title: 'Промокод', prompt: 'Введите промокод:' };
    case 'subscenarioNode': return { title: 'Подсценарий', targetNodeId: '' };
    case 'returnNode':      return { title: 'Возврат' };
    case 'purchaseNode':          return { title: 'Покупка', productKey: '' };
    case 'invokeCommandNode':     return { title: 'Вызвать команду', targetNodeId: '', targetTitle: '' };
    case 'textInputNode':         return { title: 'Ввод текста', prompt: 'Введите ответ:', varName: '', varType: 'text' };
    case 'editMessageNode':        return { title: 'Изменить сообщение', text: '' };
    case 'pollNode':               return { title: 'Опрос или тест', question: '', options: ['Вариант 1', 'Вариант 2'], quiz: false, correctOption: 0 };
    case 'stickerNode':            return { title: 'Стикер', sticker: '' };
    case 'locationNode':           return { title: 'Геолокация', latitude: 0, longitude: 0 };
    case 'subscriptionCheckNode': return { title: 'Проверка подписки', channelId: '', prompt: '' };
    case 'httpRequestNode':       return { title: 'HTTP-запрос', url: '', method: 'GET', headers: '{}', body: '', responsePath: '', responseVar: '', requestTimeout: 5000 };
    case 'loopNode':              return { title: 'Цикл', maxIterations: 10 };
    case 'breakLoopNode':         return { title: 'Выход из цикла', targetLoopId: '' };
    case 'globalVariableNode':    return { title: 'Глобальные переменные', entries: [] };
    case 'codexNode':             return { title: 'Кодекс', codexKey: '', text: '', showOnUnlock: true };
    default: return {};
  }
}

function isCommentEdge(edge, nodes) {
  const sourceNode = nodes.find(node => node.id === edge.source);
  const targetNode = nodes.find(node => node.id === edge.target);
  return !!edge.data?.isComment || sourceNode?.type === 'commentNode' || targetNode?.type === 'commentNode';
}

function edgeDefaults(edge, nodes) {
  return isCommentEdge(edge, nodes) ? COMMENT_EDGE_DEFAULTS : EDGE_DEFAULTS;
}

function normalizeEdge(edge, nodes) {
  const defaults = edgeDefaults(edge, nodes);
  const commentEdge = isCommentEdge(edge, nodes);
  const mergedStyle = commentEdge
    ? { ...edge.style, ...defaults.style }
    : { ...defaults.style, ...edge.style };
  delete mergedStyle.strokeDasharray; // strip selection-time dash — displayedEdges adds it when needed
  return {
    ...defaults,
    ...edge,
    animated: false,  // always reset — displayedEdges adds it for selected nodes
    style: mergedStyle,
    data: commentEdge ? { ...edge.data, ...defaults.data } : { ...defaults.data, ...edge.data },
    markerEnd: commentEdge ? { ...edge.markerEnd, ...defaults.markerEnd } : { ...defaults.markerEnd, ...edge.markerEnd },
  };
}

function sourceSlotKey(source, sourceHandle) {
  const handle = sourceHandle ?? '';
  if (handle === 'continue' || handle === 'continue-left') return `${source}\u0000continue`;
  if (typeof handle === 'string') {
    if (handle.startsWith('left-')) return `${source}\u0000button:${handle.slice(5)}`;
    if (handle.startsWith('right-')) return `${source}\u0000button:${handle.slice(6)}`;
    if (handle.startsWith('branch-left-')) return `${source}\u0000branch:${handle.slice(12)}`;
    if (handle.startsWith('branch-')) return `${source}\u0000branch:${handle.slice(7)}`;
  }
  return `${source}\u0000${handle}`;
}

function canConnectFrom(edges, nodes, source, sourceHandle) {
  const key = sourceSlotKey(source, sourceHandle);
  return !edges.some(e =>
    sourceSlotKey(e.source, e.sourceHandle) === key
  );
}

function targetSlotKey(target, targetHandle) {
  return `${target}\u0000${targetHandle || 'in'}`;
}

function hasConnectionTo(edges, target, targetHandle) {
  const key = targetSlotKey(target, targetHandle);
  return edges.some(edge => targetSlotKey(edge.target, edge.targetHandle) === key);
}

function removeDuplicateConnections(edges, nodes) {
  const seen = new Set();
  const nodeIds = new Set(nodes.map(n => n.id));

  return edges.filter(edge => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
    if (nodes.find(node => node.id === edge.target)?.type === 'commentNode') return false;

    const key = sourceSlotKey(edge.source, edge.sourceHandle);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

const VARIABLE_FIELD_NAMES = new Set(['varName', 'responseVar', 'key', 'targetVar', 'sourceVar']);

function replaceVariablePlaceholder(text, oldName, newName) {
  return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => (
    name.trim() === oldName ? `{{${newName}}}` : match
  ));
}

function renameVariableValue(value, oldName, newName, key = '') {
  if (typeof value === 'string') {
    if (VARIABLE_FIELD_NAMES.has(key) && value === oldName) return newName;
    return replaceVariablePlaceholder(value, oldName, newName);
  }
  if (Array.isArray(value)) {
    return value.map(item => typeof item === 'string' && item === oldName ? newName : renameVariableValue(item, oldName, newName));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      renameVariableValue(childValue, oldName, newName, childKey),
    ]));
  }
  return value;
}

function nodeSize(node) {
  return {
    width: node.measured?.width || node.width || Number.parseFloat(node.style?.width) || 240,
    height: node.measured?.height || node.height || Number.parseFloat(node.style?.height) || 120,
  };
}

function absolutePosition(node, nodeMap) {
  const position = { x: node.position.x, y: node.position.y };
  const visited = new Set();
  let current = node;
  while (current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    position.x += parent.position.x;
    position.y += parent.position.y;
    current = parent;
  }
  return position;
}

function pointInsideNode(point, node, nodeMap) {
  const position = absolutePosition(node, nodeMap);
  const size = nodeSize(node);
  return point.x >= position.x && point.x <= position.x + size.width &&
    point.y >= position.y && point.y <= position.y + size.height;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function estimatedNodeSize(type) {
  return type === 'groupNode' ? { width: 320, height: 220 } : { width: 260, height: 130 };
}

function makeNodeRects(existingNodes) {
  const nodeMap = new Map(existingNodes.map(item => [item.id, item]));
  return existingNodes.map(node => ({ id: node.id, ...absolutePosition(node, nodeMap), ...nodeSize(node) }));
}

function inflateRect(rect, padding) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectDistance(a, b) {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function connectionSide(sourceHandle) {
  const handle = String(sourceHandle || '').toLowerCase();
  if (handle.startsWith('left-') || handle.includes('left')) return 'left';
  if (handle.startsWith('right-') || handle.includes('right')) return 'right';
  return 'right';
}

function sidePenalty(candidateRect, sourceRect, preferredSide) {
  const candidateCenterX = candidateRect.x + candidateRect.width / 2;
  const candidateCenterY = candidateRect.y + candidateRect.height / 2;
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const dx = candidateCenterX - sourceCenterX;
  const dy = candidateCenterY - sourceCenterY;
  const side =
    Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'top' : 'bottom');
  if (side === preferredSide) return 0;
  if ((preferredSide === 'left' || preferredSide === 'right') && (side === 'top' || side === 'bottom')) return 12;
  return 28;
}

function findFreePosition(position, type, existingNodes) {
  const size = estimatedNodeSize(type);
  const existing = makeNodeRects(existingNodes);
  let candidate = { ...position };
  for (let attempt = 0; attempt < 80; attempt++) {
    const rect = { ...candidate, ...size };
    if (!existing.some(item => rectsOverlap(rect, item))) return candidate;
    candidate = { x: position.x + 34 * (attempt + 1), y: position.y + 26 * (attempt + 1) };
  }
  return candidate;
}

function findNearestFreePositionNearNode(sourceNode, type, existingNodes, sourceHandle) {
  if (!sourceNode) return null;
  const size = estimatedNodeSize(type);
  const existing = makeNodeRects(existingNodes);
  const sourceRect = existing.find(item => item.id === sourceNode.id);
  if (!sourceRect) return null;

  const preferredSide = connectionSide(sourceHandle);
  const gap = 54;
  const scanStep = 46;
  const scanLimit = 920;
  const collisionPadding = 14;
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const candidates = [];
  const seen = new Set();

  function addCandidate(x, y) {
    const candidate = { x: Math.round(x), y: Math.round(y) };
    const key = `${candidate.x}:${candidate.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  const sideOrder = preferredSide === 'left'
    ? ['left', 'right', 'bottom', 'top']
    : ['right', 'left', 'bottom', 'top'];

  for (let ring = 0; ring <= 16; ring++) {
    const offsets = ring === 0 ? [0] : [ring * scanStep, -ring * scanStep];
    for (const side of sideOrder) {
      for (const offset of offsets) {
        if (side === 'right') addCandidate(sourceRect.x + sourceRect.width + gap, sourceCenterY - size.height / 2 + offset);
        else if (side === 'left') addCandidate(sourceRect.x - size.width - gap, sourceCenterY - size.height / 2 + offset);
        else if (side === 'bottom') addCandidate(sourceCenterX - size.width / 2 + offset, sourceRect.y + sourceRect.height + gap);
        else addCandidate(sourceCenterX - size.width / 2 + offset, sourceRect.y - size.height - gap);
      }
    }
  }

  for (let dx = -scanLimit; dx <= scanLimit; dx += scanStep) {
    for (let dy = -scanLimit; dy <= scanLimit; dy += scanStep) {
      addCandidate(sourceCenterX - size.width / 2 + dx, sourceCenterY - size.height / 2 + dy);
    }
  }

  candidates.sort((a, b) => {
    const rectA = { ...a, ...size };
    const rectB = { ...b, ...size };
    const scoreA = rectDistance(rectA, sourceRect) * 100 + sidePenalty(rectA, sourceRect, preferredSide);
    const scoreB = rectDistance(rectB, sourceRect) * 100 + sidePenalty(rectB, sourceRect, preferredSide);
    return scoreA - scoreB;
  });

  for (const candidate of candidates) {
    const rect = { ...candidate, ...size };
    if (!existing.some(item => rectsOverlap(rect, inflateRect(item, collisionPadding)))) return candidate;
  }

  return findFreePosition(
    { x: sourceRect.x + sourceRect.width + gap, y: sourceCenterY - size.height / 2 },
    type,
    existingNodes,
  );
}

function stripSearchHighlight(style) {
  if (!style?.outline) return style;
  const { outline, outlineOffset, ...rest } = style;
  return rest;
}

// ── Derive botVariables from all variableNodes ──────────────────────
function extractVars(nodes) {
  const vars = {};
  const names = new Set();
  Object.keys(vars).forEach(name => names.add(name.toLowerCase()));
  function add(name, type = 'boolean') {
    const trimmed = name?.trim();
    const normalizedName = trimmed?.toLowerCase();
    if (!normalizedName || isSystemPlaceholderName(trimmed) || names.has(normalizedName)) return;
    vars[trimmed] = { type, defaultValue: type === 'number' ? 0 : (type === 'boolean' ? false : '') };
    names.add(normalizedName);
  }
  nodes.filter(n => n.type === 'variableNode').forEach(n => {
    (n.data.entries || []).forEach(e => add(e.varName, e.varType || 'boolean'));
  });
  nodes.filter(n => n.type === 'textInputNode').forEach(n => add(n.data.varName, n.data.varType || 'text'));
  nodes.filter(n => n.type === 'httpRequestNode').forEach(n => add(n.data.responseVar, 'text'));
  nodes.filter(n => n.type === 'globalVariableNode').forEach(n => (n.data.entries || []).forEach(e => add(e.varName, e.varType || 'number')));
  return vars;
}

function codexVariableName(data = {}) {
  const key = String(data.codexKey || data.key || '').trim().replace(/^codex\./i, '');
  return key ? `codex.${key}` : '';
}

function extractCodexVars(nodes) {
  const vars = {};
  for (const node of (nodes || [])) {
    if (node.type !== 'codexNode') continue;
    const entries = node.data?.entries?.length > 0
      ? node.data.entries
      : node.data?.codexKey ? [{ codexKey: node.data.codexKey }] : [];
    for (const e of entries) {
      const key = String(e.codexKey || '').trim().replace(/^codex\./i, '');
      if (key) vars[`codex.${key}`] = { type: 'boolean', defaultValue: false };
    }
  }
  return vars;
}

function extractAchievementVars(nodes) {
  const vars = { 'achievements.list': { type: 'text', defaultValue: '' } };
  for (const node of (nodes || [])) {
    if (node.type !== 'achievementNode' || !node.data?.achievementKey) continue;
    vars[`achievements.text.${node.data.achievementKey}`] = { type: 'text', defaultValue: '' };
  }
  return vars;
}

function scenarioPathToNode(nodes, edges, targetNodeId) {
  if (!targetNodeId) return [];
  const outgoing = new Map();
  edges.filter(edge => !edge.data?.isComment).forEach(edge => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  });
  nodes.filter(node => node.type === 'subscenarioNode' && node.data.targetNodeId).forEach(node => {
    if (!outgoing.has(node.id)) outgoing.set(node.id, []);
    outgoing.get(node.id).push(node.data.targetNodeId);
  });
  const roots = [
    ...nodes.filter(node => node.type === 'startNode'),
    ...nodes.filter(node => ['menuNode', 'settingsNode', 'customCommandNode'].includes(node.type)),
  ];

  function find(nodeId, path, visited) {
    if (visited.has(nodeId)) return null;
    const nextPath = [...path, nodeId];
    if (nodeId === targetNodeId) return nextPath;
    const nextVisited = new Set(visited).add(nodeId);
    for (const nextId of outgoing.get(nodeId) || []) {
      const found = find(nextId, nextPath, nextVisited);
      if (found) return found;
    }
    return null;
  }

  for (const root of roots) {
    const found = find(root.id, [], new Set());
    if (found) return found;
  }
  return [];
}

function applyVariableEntries(vars, entries) {
  for (const entry of entries || []) {
    const name = entry.varName?.trim();
    if (!name) continue;
    const type = entry.varType || 'boolean';
    const initialValue = type === 'number' ? 0 : (type === 'text' ? '' : false);
    const current = vars[name] || { type, defaultValue: initialValue };
    let value = entry.value ?? initialValue;
    if (entry.action === 'increment') value = (+current.defaultValue || 0) + (+entry.value || 1);
    if (entry.action === 'decrement') value = (+current.defaultValue || 0) - (+entry.value || 1);
    vars[name] = { type, defaultValue: value };
  }
}

function declareVariable(vars, name, type = 'text') {
  const trimmed = name?.trim();
  if (!trimmed || vars[trimmed]) return;
  vars[trimmed] = { type, defaultValue: type === 'number' ? 0 : (type === 'boolean' ? false : '') };
}

function varsBeforeNode(nodes, edges, targetNodeId) {
  const path = scenarioPathToNode(nodes, edges, targetNodeId);
  const vars = { ...extractCodexVars(nodes) };
  path.slice(0, -1).forEach(nodeId => {
    const node = nodes.find(item => item.id === nodeId);
    if (node?.type === 'variableNode') applyVariableEntries(vars, node.data.entries);
    if (node?.type === 'textInputNode') declareVariable(vars, node.data.varName, node.data.varType || 'text');
    if (node?.type === 'httpRequestNode') declareVariable(vars, node.data.responseVar, 'text');
    if (node?.type === 'globalVariableNode') (node.data.entries || []).forEach(entry => declareVariable(vars, entry.varName, entry.varType || 'number'));
  });
  return vars;
}

function validateScenario(nodes, edges) {
  const issues = validateScenarioText(nodes);
  const workEdges = edges.filter(edge => !edge.data?.isComment);
  const starts = nodes.filter(node => node.type === 'startNode');
  if (starts.length > 1) issues.push(`Ошибка: нода «Начало истории» может быть не более одной, найдено ${starts.length}.`);
  const menus = nodes.filter(node => node.type === 'menuNode');
  const settings = nodes.filter(node => node.type === 'settingsNode');
  const customCommands = nodes.filter(node => node.type === 'customCommandNode');
  if (menus.length > 1) issues.push(`Ошибка: нода «Главное меню» может быть только одна, найдено ${menus.length}.`);
  if (settings.length > 1) issues.push(`Ошибка: нода «Настройки» может быть только одна, найдено ${settings.length}.`);

  const reachable = new Set();
  // startNode is optional — new bots use menuNode as sole entry point
  const incoming = new Set(workEdges.map(edge => edge.target));
  const storyRoot = nodes.find(node => !['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode', 'commentNode', 'groupNode'].includes(node.type) && !incoming.has(node.id));
  const queue = [...starts, menus[0], settings[0], ...customCommands, storyRoot].filter(Boolean).map(node => node.id);
  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    workEdges.filter(edge => edge.source === id).forEach(edge => queue.push(edge.target));
    const node = nodes.find(item => item.id === id);
    if (node?.type === 'subscenarioNode' && node.data.targetNodeId) queue.push(node.data.targetNodeId);
  }
  nodes.filter(node => node.type !== 'commentNode' && node.type !== 'continueStoryNode' && node.type !== 'groupNode' && !reachable.has(node.id))
    .forEach(node => issues.push(`Предупреждение: нода ${node.data.nodeId || node.id} недостижима от старта или командного меню.`));

  const variables = extractVars(nodes);
  const reservedCommands = new Set(['start', 'menu', 'settings', 'promo', 'shop', 'ref']);
  const seenCommands = new Set(reservedCommands);
  for (const node of nodes) {
    if (node.type === 'customCommandNode') {
      const commands = [node.data.command, ...String(node.data.aliases || '').split(',')].map(value => String(value || '').trim().replace(/^\/+/, '').toLowerCase()).filter(Boolean);
      if (!commands.length) issues.push(`Ошибка: у ноды команды ${node.data.nodeId || node.id} не указано имя.`);
      for (const command of commands) {
        if (!/^[a-z0-9_]{1,32}$/.test(command)) issues.push(`Ошибка: команда /${command} должна содержать только латинские буквы, цифры и _.`);
        else if (seenCommands.has(command)) issues.push(`Ошибка: команда /${command} уже занята.`);
        seenCommands.add(command);
      }
    }
    if (node.type === 'simpleMessageNode' && node.data.type !== 'text' && !node.data.url) {
      issues.push(`Ошибка: в сообщении ${node.data.nodeId || node.id} не выбран файл.`);
    }
    if (node.type === 'mediaNode') {
      if (!(node.data.items || []).length) issues.push(`Предупреждение: медиа-нода ${node.data.nodeId || node.id} пустая.`);
      (node.data.items || []).filter(item => !item.url).forEach(() => issues.push(`Ошибка: в медиа-ноде ${node.data.nodeId || node.id} есть файл без URL.`));
    }
    if (node.type === 'randomNode') {
      (node.data.branches || []).forEach(branch => {
        if (!workEdges.some(edge => edge.source === node.id && edge.sourceHandle === `random-${branch.id}`)) {
          issues.push(`Ошибка: вариант «${branch.label}» ноды случайности ${node.data.nodeId || node.id} не подключен.`);
        }
      });
    }
    if (node.type === 'formulaNode') {
      (node.data.entries || []).forEach(entry => {
        if (!variables[entry.varName] || variables[entry.varName].type !== 'number') {
          issues.push(`Ошибка: формула ${node.data.nodeId || node.id} использует нечисловую переменную «${entry.varName || '?'}».`);
        }
      });
    }
    if (node.type === 'subscenarioNode' && !nodes.some(item => item.id === node.data.targetNodeId)) {
      issues.push(`Ошибка: у подсценария ${node.data.nodeId || node.id} не выбрана существующая точка входа.`);
    }
    if (node.type === 'achievementNode' && !node.data.achievementKey) {
      issues.push(`Ошибка: у достижения ${node.data.nodeId || node.id} не указан ключ.`);
    }
    if (node.type === 'purchaseNode' && !node.data.productKey) {
      issues.push(`Ошибка: у покупки ${node.data.nodeId || node.id} не указан ключ товара.`);
    }
  }
  return issues;
}

export default function EditorPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [bot, setBot]         = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [botName, setBotName] = useState('');
  const [showHistory, setShowHistory]   = useState(false);
  const [snapshots, setSnapshots]       = useState([]);
  const [contextMenu, setContextMenu]   = useState(null);
  const [compareSnap, setCompareSnap]   = useState(null);
  const [inspectorNodeId, setInspectorNodeId] = useState(null);
  const [showSimulator, setShowSimulator]     = useState(false);
  const [simulatorStartNodeId, setSimulatorStartNodeId] = useState(null);
  const [telegramStatus, setTelegramStatus]   = useState({ running: false, tokenConfigured: false, logs: [] });
  const [telegramBusy, setTelegramBusy]       = useState(false);
  const [showTelegramLogs, setShowTelegramLogs] = useState(false);
  const [showTelegramStart, setShowTelegramStart] = useState(false);
  const [showAdmin, setShowAdmin]                 = useState(false);
  const [searchQuery, setSearchQuery]             = useState('');
  const [showSearch, setShowSearch]               = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState(null);
  const [nodesExpanded, setNodesExpanded]         = useState(true);
  const [autoSaveStatus, setAutoSaveStatus]       = useState(null); // null | 'saved' | 'error'
  const [autoSaveEnabled, setAutoSaveEnabled]     = useState(true);
  const [autoSaveMinutes, setAutoSaveMinutes]     = useState('10');
  const [showSettings, setShowSettings]           = useState(false);
  const [showHelp, setShowHelp]                   = useState(false);
  const [showLore, setShowLore]                   = useState(false);
  const [showTelegramBackup, setShowTelegramBackup] = useState(false);
  const [botLore, setBotLore]                     = useState({ text: '' });
  const [telegramToken, setTelegramToken]     = useState('');
  const [telegramError, setTelegramError]     = useState('');

  const rfRef = useRef(null);

  // Stable refs
  const snapshotsRef = useRef(snapshots);
  const botNameRef   = useRef(botName);
  const botLoreRef   = useRef(botLore);
  const nodesRef     = useRef(nodes);
  const edgesRef     = useRef(edges);
  const copiedSelectionRef = useRef(null);
  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);
  useEffect(() => { botNameRef.current   = botName;   }, [botName]);
  useEffect(() => { botLoreRef.current   = botLore;   }, [botLore]);
  useEffect(() => { nodesRef.current     = nodes;     }, [nodes]);
  useEffect(() => { edgesRef.current     = edges;     }, [edges]);

  // ── Undo ────────────────────────────────────────────────────────
  const undoStack      = useRef([]);
  const undoIdx        = useRef(-1);
  const skipHistoryRef = useRef(false);
  const initializedRef = useRef(false);
  const debounceRef    = useRef(null);

  const [myRole, setMyRole] = useState('owner'); // optimistic — restrict after load
  const canEdit = myRole === 'editor' || myRole === 'owner';
  const isOwner = myRole === 'owner';

  useEffect(() => {
    getBotMyRole(id).then(res => setMyRole(res.role || 'viewer')).catch(() => setMyRole('viewer'));
    getBot(id).then(data => {
      setBot(data);
      setBotName(data.name);
      setBotLore(data.lore || { text: '' });
      const ns = (data.nodes || []).map(node => ({ ...node, data: { ...node.data, __expanded: true } }));
      const es = removeDuplicateConnections((data.edges || []).map(edge => normalizeEdge(edge, ns)), ns);
      setNodes(ns);
      setEdges(es);
      setSnapshots(data.snapshots || []);
      skipHistoryRef.current = true;
      setTimeout(() => {
        undoStack.current = [{ nodes: deepCopy(ns), edges: deepCopy(es) }];
        undoIdx.current   = 0;
        initializedRef.current = true;
      }, 150);
    });
  }, [id]);

  useEffect(() => {
    let active = true;
    async function refreshTelegramStatus() {
      try {
        const status = await getTelegramStatus(id);
        if (active) setTelegramStatus(status);
      } catch {
        // The editor remains usable while the backend is restarting.
      }
    }
    refreshTelegramStatus();
    const timer = setInterval(refreshTelegramStatus, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    if (!initializedRef.current) return;
    clearTimeout(debounceRef.current);
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    debounceRef.current = setTimeout(() => {
      const snap = { nodes: deepCopy(nodesRef.current), edges: deepCopy(edgesRef.current) };
      undoStack.current = undoStack.current.slice(0, undoIdx.current + 1);
      undoStack.current.push(snap);
      if (undoStack.current.length > 80) undoStack.current.shift();
      else undoIdx.current = undoStack.current.length - 1;
    }, 600);
  }, [nodes, edges]);

  // Autosave on the configured minute interval.
  useEffect(() => {
    if (!bot || !autoSaveEnabled || !canEdit) return;
    const minutes = Math.max(1, Number(autoSaveMinutes) || 5);
    const timer = setInterval(async () => {
      if (!initializedRef.current) return;
      try {
        await saveBot(id, { nodes: nodesRef.current, edges: edgesRef.current.map(edge => normalizeEdge(edge, nodesRef.current)), name: botNameRef.current, snapshots: snapshotsRef.current, lore: botLoreRef.current });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch { setAutoSaveStatus('error'); setTimeout(() => setAutoSaveStatus(null), 3000); }
    }, minutes * 60 * 1000);
    return () => clearInterval(timer);
  }, [autoSaveEnabled, autoSaveMinutes, bot, id]);

  // Ctrl+F search
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowSearch(v => !v); }
      if (e.key === 'Escape') setShowSearch(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function undo() {
    if (undoIdx.current <= 0) return;
    undoIdx.current--;
    const st = undoStack.current[undoIdx.current];
    skipHistoryRef.current = true;
    const ns = deepCopy(st.nodes);
    setNodes(ns); setEdges(removeDuplicateConnections(deepCopy(st.edges), ns));
  }
  function redo() {
    if (undoIdx.current >= undoStack.current.length - 1) return;
    undoIdx.current++;
    const st = undoStack.current[undoIdx.current];
    skipHistoryRef.current = true;
    const ns = deepCopy(st.nodes);
    setNodes(ns); setEdges(removeDuplicateConnections(deepCopy(st.edges), ns));
  }

  // ── Connections ────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    setEdges(eds =>
      canConnectFrom(eds, nodesRef.current, params.source, params.sourceHandle)
        ? addEdge(normalizeEdge(params, nodesRef.current), eds)
        : eds
    );
    pendingConnRef.current = null;
  }, []);

  const pendingConnRef = useRef(null);

  const onConnectStart = useCallback((event, params) => {
    const target = event?.target;
    const handleType = params.handleType || (target?.classList?.contains('react-flow__handle-target') ? 'target' : 'source');
    const occupied = handleType === 'target'
      ? hasConnectionTo(edgesRef.current, params.nodeId, params.handleId)
      : !canConnectFrom(edgesRef.current, nodesRef.current, params.nodeId, params.handleId);
    pendingConnRef.current = {
      source: params.nodeId,
      sourceHandle: params.handleId,
      handleType,
      commentOnly: occupied,
    };
  }, []);

  const isValidConnection = useCallback((params) =>
    canConnectFrom(edgesRef.current, nodesRef.current, params.source, params.sourceHandle)
  , []);

  // KEY FIX: do NOT use onPaneClick to close contextMenu — it fires after onConnectEnd
  const onConnectEnd = useCallback((event) => {
    if (!pendingConnRef.current) return;
    const target = event.target;
    if (target?.closest?.('.react-flow__node') || target?.closest?.('.react-flow__handle')) {
      pendingConnRef.current = null; return;
    }
    const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
    const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
    if (!rfRef.current || clientX == null) { pendingConnRef.current = null; return; }
    const conn = pendingConnRef.current;
    pendingConnRef.current = null;
    setContextMenu({
      x: clientX, y: clientY,
      flowPos: rfRef.current.screenToFlowPosition({ x: clientX, y: clientY }),
      pendingConnection: conn,
      allowedTypes: conn.commentOnly ? ['commentNode'] : null,
    });
  }, []);

  function onPaneContextMenu(event) {
    event.preventDefault();
    if (!rfRef.current) return;
    setContextMenu({
      x: event.clientX, y: event.clientY,
      flowPos: rfRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      pendingConnection: null,
    });
  }

  // ── Node helpers ───────────────────────────────────────────────
  function addNode(type, name, position, pendingConn) {
    if (pendingConn?.commentOnly && type !== 'commentNode') return;
    if ((type === 'menuNode' || type === 'settingsNode') && nodesRef.current.some(node => node.type === type)) {
      alert(type === 'menuNode' ? 'Главное меню уже добавлено.' : 'Настройки уже добавлены.');
      return;
    }
    const pendingSourceNode = pendingConn?.source
      ? nodesRef.current.find(node => node.id === pendingConn.source)
      : null;
    const attachNewComment = type === 'commentNode' && !!pendingSourceNode;

    if (
      pendingConn?.source &&
      !attachNewComment &&
      !canConnectFrom(edgesRef.current, nodesRef.current, pendingConn.source, pendingConn.sourceHandle)
    ) return;

    const nodeId = uuidv4();
    const data   = { ...makeDefaultData(type), nodeId: nodeId.slice(0, 7) };
    if (name?.trim()) {
      if ('title' in data) data.title = name.trim();
      else if (type === 'variableNode') data.varName = name.trim();
    }
    const safePosition = pendingSourceNode
      ? findNearestFreePositionNearNode(pendingSourceNode, type, nodesRef.current, pendingConn.sourceHandle) || findFreePosition(position || { x: 300, y: 200 }, type, nodesRef.current)
      : findFreePosition(position || { x: 300, y: 200 }, type, nodesRef.current);
    const newNode = { id: nodeId, type, position: safePosition, data: { ...data, __expanded: nodesExpanded }, selected: true };
    setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newNode));
    if (pendingConn?.source) {
      const edge = attachNewComment
        ? { id: uuidv4(), source: nodeId, sourceHandle: 'comment', target: pendingConn.source }
        : { id: uuidv4(), source: pendingConn.source, sourceHandle: pendingConn.sourceHandle ?? null, target: nodeId };
      setEdges(eds =>
        canConnectFrom(eds, [...nodesRef.current, newNode], edge.source, edge.sourceHandle)
          ? [...eds, normalizeEdge(edge, [...nodesRef.current, newNode])]
          : eds
      );
    }
  }

  function handleAddNodeFromPanel(type) {
    if (!canEdit) return;
    const center = rfRef.current
      ? rfRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 300, y: 200 };
    addNode(type, '', { x: center.x + (Math.random() - 0.5) * 140, y: center.y + (Math.random() - 0.5) * 140 }, null);
  }

  function handleContextMenuSelect(type, name) {
    if (contextMenu) addNode(type, name, contextMenu.flowPos, contextMenu.pendingConnection);
  }

  const preToggleHeightsRef = useRef(null);

  function toggleNodesExpanded() {
    const rf = rfRef.current;
    const preNodes = rf ? rf.getNodes() : nodesRef.current;
    preToggleHeightsRef.current = preNodes.map(n => ({
      id: n.id,
      y: n.position.y,
      height: n.measured?.height || 0,
      parentId: n.parentId,
    }));

    setNodesExpanded(value => {
      const next = !value;
      setNodes(nds => nds.map(node => ({ ...node, data: { ...node.data, __expanded: next } })));
      return next;
    });

    // After ReactFlow remeasures nodes, shift Y positions to preserve gaps
    setTimeout(() => {
      const rf2 = rfRef.current;
      const preData = preToggleHeightsRef.current;
      if (!rf2 || !preData) return;
      preToggleHeightsRef.current = null;

      const postNodes = rf2.getNodes();
      const postHeights = new Map(postNodes.map(n => [n.id, n.measured?.height || 0]));

      const sorted = [...preData]
        .filter(d => !d.parentId)
        .sort((a, b) => a.y - b.y);

      let cumulativeDelta = 0;
      const adjustments = new Map();
      for (const pre of sorted) {
        adjustments.set(pre.id, cumulativeDelta);
        const postH = postHeights.get(pre.id) || pre.height;
        cumulativeDelta += (postH - pre.height);
      }

      if ([...adjustments.values()].some(d => Math.abs(d) > 0.5)) {
        const preNodeMap = new Map((nodesRef.current || []).map(node => [node.id, node]));
        const commentAdjustments = new Map();
        for (const edge of edgesRef.current || []) {
          const sourceNode = preNodeMap.get(edge.source);
          const targetNode = preNodeMap.get(edge.target);
          if (!edge.data?.isComment && sourceNode?.type !== 'commentNode' && targetNode?.type !== 'commentNode') continue;
          const commentId = sourceNode?.type === 'commentNode' ? edge.source : targetNode?.type === 'commentNode' ? edge.target : null;
          const anchorId = commentId === edge.source ? edge.target : edge.source;
          const delta = adjustments.get(anchorId);
          if (commentId && delta) commentAdjustments.set(commentId, delta);
        }
        skipHistoryRef.current = true;
        setNodes(nds => nds.map(n => {
          const d = n.type === 'commentNode'
            ? (commentAdjustments.get(n.id) ?? adjustments.get(n.id))
            : adjustments.get(n.id);
          if (!d) return n;
          return { ...n, position: { x: n.position.x, y: n.position.y + d } };
        }));
      }
    }, 250);
  }

  function createGroupFromSelection() {
    setNodes(nds => {
      const selected = nds.filter(node => node.selected && node.type !== 'groupNode');
      if (selected.length < 2) return nds;

      const nodeMap = new Map(nds.map(node => [node.id, node]));
      const positions = selected.map(node => ({ node, position: absolutePosition(node, nodeMap), size: nodeSize(node) }));
      const minX = Math.min(...positions.map(item => item.position.x));
      const minY = Math.min(...positions.map(item => item.position.y));
      const maxX = Math.max(...positions.map(item => item.position.x + item.size.width));
      const maxY = Math.max(...positions.map(item => item.position.y + item.size.height));
      const groupId = uuidv4();
      const groupPosition = { x: minX - 28, y: minY - 48 };
      const selectedIds = new Set(selected.map(node => node.id));
      const group = {
        id: groupId,
        type: 'groupNode',
        position: groupPosition,
        data: { nodeId: groupId.slice(0, 7), title: 'Группа', color: '#3b82f6' },
        style: { width: Math.max(260, maxX - minX + 56), height: Math.max(180, maxY - minY + 76) },
        zIndex: -1,
        selected: true,
      };
      const updated = nds.map(node => {
        if (!selectedIds.has(node.id)) return { ...node, selected: false };
        const absolute = absolutePosition(node, nodeMap);
        return {
          ...node,
          parentId: groupId,
          extent: undefined,
          position: { x: absolute.x - groupPosition.x, y: absolute.y - groupPosition.y },
          zIndex: 1,
          selected: false,
        };
      });
      return [group, ...updated];
    });
  }

  function handleDeleteSelected() {
    const selectedNodeIds = new Set(nodesRef.current.filter(n => n.selected).map(n => n.id));
    setNodes(nds => {
      const nodeMap = new Map(nds.map(node => [node.id, node]));
      const selectedGroupIds = new Set(nds.filter(node => selectedNodeIds.has(node.id) && node.type === 'groupNode').map(node => node.id));
      return nds
        .filter(node => !selectedNodeIds.has(node.id))
        .map(node => selectedGroupIds.has(node.parentId)
          ? { ...node, parentId: undefined, extent: undefined, position: absolutePosition(node, nodeMap), zIndex: 0 }
          : node);
    });
    setEdges(eds => eds.filter(e =>
      !e.selected &&
      !selectedNodeIds.has(e.source) &&
      !selectedNodeIds.has(e.target)
    ));
  }

  const onEdgeDoubleClick = useCallback((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    setEdges(eds => eds.filter(e => e.id !== edge.id));
  }, []);

  const onNodeClick = useCallback((event, node) => {
    if (event.ctrlKey || event.metaKey) return;
    setInspectorNodeId(node.id);
  }, []);

  const onNodeDragStop = useCallback((event, draggedNode) => {
    if (draggedNode.type === 'groupNode') return;
    setNodes(nds => {
      const nodeMap = new Map(nds.map(node => [node.id, node]));
      const node = nodeMap.get(draggedNode.id);
      if (!node) return nds;
      const absolute = absolutePosition(node, nodeMap);
      const size = nodeSize(node);
      const center = { x: absolute.x + size.width / 2, y: absolute.y + size.height / 2 };
      const target = [...nds].reverse().find(item => item.type === 'groupNode' && pointInsideNode(center, item, nodeMap));
      if (target?.id === node.parentId) return nds;

      return nds.map(item => {
        if (item.id !== node.id) return item;
        if (!target) return { ...item, parentId: undefined, extent: undefined, position: absolute, zIndex: 0 };
        const groupPosition = absolutePosition(target, nodeMap);
        return {
          ...item,
          parentId: target.id,
          extent: undefined,
          position: { x: absolute.x - groupPosition.x, y: absolute.y - groupPosition.y },
          zIndex: 1,
        };
      });
    });
  }, []);

  // Sync inspector whenever the selected node changes.
  // This covers cases where onNodeClick doesn't fire
  // (e.g. click lands on a handle instead of the node body).
  const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  useEffect(() => {
    if (selectedNodeId) setInspectorNodeId(selectedNodeId);
    else setInspectorNodeId(null);
  }, [selectedNodeId]);

  function updateNodeData(nodeId, patch) {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  function renameVariableEverywhere(oldName, newName) {
    const from = String(oldName || '').trim();
    const to = String(newName || '').trim();
    if (!from || !to || from === to) return;
    if (isSystemPlaceholderName(to)) {
      alert('Это имя зарезервировано системным плейсхолдером.');
      return;
    }
    const existing = Object.keys(extractVars(nodesRef.current)).filter(name => name !== from);
    if (existing.some(name => name.toLowerCase() === to.toLowerCase())) {
      alert(`Переменная «${to}» уже существует.`);
      return;
    }
    setNodes(nds => nds.map(node => ({
      ...node,
      data: renameVariableValue(node.data || {}, from, to),
    })));
  }

  function updateNode(nodeId, patch) {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, ...patch } : n));
  }

  // ── Save / history ─────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      const flow = rfRef.current ? rfRef.current.toObject() : { nodes: nodesRef.current, edges: edgesRef.current };
      const newSnap = { timestamp: new Date().toISOString(), label: null, nodes: deepCopy(flow.nodes), edges: deepCopy(flow.edges) };
      const newSnaps = [...snapshotsRef.current, newSnap].slice(-50);
      await saveBot(id, { name: botNameRef.current, nodes: flow.nodes, edges: flow.edges, snapshots: newSnaps, lore: botLoreRef.current });
      setSnapshots(newSnaps);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      alert(`Не удалось сохранить сценарий:\n${error.message}`);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadJson() {
    try {
      await downloadBot(id, botNameRef.current);
    } catch (error) {
      alert(error.message);
    }
  }

  async function saveSnapshots(nextSnapshots) {
    const flow = rfRef.current ? rfRef.current.toObject() : { nodes: nodesRef.current, edges: edgesRef.current };
    await saveBot(id, { name: botNameRef.current, nodes: flow.nodes, edges: flow.edges, snapshots: nextSnapshots, lore: botLoreRef.current });
    setSnapshots(nextSnapshots);
  }

  function openTelegramStart() {
    setTelegramToken(telegramStatus.token || '');
    setTelegramError('');
    setShowTelegramStart(true);
  }

  async function handleTelegramStart(event) {
    event.preventDefault();
    const token = telegramToken.trim();
    if (!telegramStatus.tokenConfigured && !token) {
      setTelegramError('Введите Telegram-токен перед запуском.');
      return;
    }
    setTelegramBusy(true);
    setTelegramError('');
    try {
      await handleSave();
      setTelegramStatus(await startTelegramBot(id, token));
      setShowTelegramStart(false);
      setTelegramToken('');
    } catch (e) {
      setTelegramError(e.message);
    } finally {
      setTelegramBusy(false);
    }
  }

  async function handleTelegramStop() {
    if (!confirm('Остановить Telegram-бота?')) return;
    setTelegramBusy(true);
    try {
      setTelegramStatus(await stopTelegramBot(id));
    } catch (e) {
      alert(e.message);
    } finally {
      setTelegramBusy(false);
    }
  }

  function handleRestoreSnapshot(snap) {
    if (!confirm('Восстановить этот снапшот? Текущие несохраненные изменения на холсте будут заменены.')) return;
    skipHistoryRef.current = true;
    const ns = deepCopy(snap.nodes);
    setNodes(ns);
    setEdges(removeDuplicateConnections(deepCopy(snap.edges).map(edge => normalizeEdge(edge, ns)), ns));
    setShowHistory(false);
  }

  async function handleCommentSnapshot(snap) {
    const comment = prompt('Комментарий к снапшоту:', snap.comment || '');
    if (comment === null) return;
    const nextSnapshots = snapshotsRef.current.map(item =>
      item.timestamp === snap.timestamp ? { ...item, comment: comment.trim() } : item
    );
    try {
      await saveSnapshots(nextSnapshots);
    } catch (error) {
      alert(`Не удалось сохранить комментарий:\n${error.message}`);
    }
  }

  async function handleDeleteSnapshot(snap) {
    if (!confirm('Удалить этот снапшот? Действие нельзя отменить.')) return;
    const nextSnapshots = snapshotsRef.current.filter(item => item.timestamp !== snap.timestamp);
    try {
      await saveSnapshots(nextSnapshots);
    } catch (error) {
      alert(`Не удалось удалить снапшот:\n${error.message}`);
    }
  }

  function copySelectedNodes() {
    const selected = nodesRef.current.filter(node => node.selected && node.type !== 'groupNode');
    if (!selected.length) return false;
    const selectedIds = new Set(selected.map(node => node.id));
    const nodeMap = new Map(nodesRef.current.map(node => [node.id, node]));
    copiedSelectionRef.current = {
      nodes: selected.map(node => ({
        ...deepCopy(node),
        position: absolutePosition(node, nodeMap),
        parentId: undefined,
        extent: undefined,
        selected: false,
      })),
      edges: edgesRef.current.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target)).map(edge => deepCopy(edge)),
    };
    return true;
  }

  function pasteCopiedNodes() {
    const copied = copiedSelectionRef.current;
    if (!copied?.nodes?.length) return false;
    const center = rfRef.current
      ? rfRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 300, y: 200 };
    const minX = Math.min(...copied.nodes.map(node => node.position.x));
    const minY = Math.min(...copied.nodes.map(node => node.position.y));
    const idMap = new Map();
    const pasted = [];
    copied.nodes.forEach((node, index) => {
      const nextId = uuidv4();
      idMap.set(node.id, nextId);
      const preferred = { x: center.x + node.position.x - minX + index * 6, y: center.y + node.position.y - minY + index * 6 };
      pasted.push({
        ...deepCopy(node),
        id: nextId,
        position: findFreePosition(preferred, node.type, [...nodesRef.current, ...pasted]),
        data: { ...deepCopy(node.data || {}), nodeId: nextId.slice(0, 7), __expanded: nodesExpanded },
        selected: true,
      });
    });
    const pastedEdges = copied.edges
      .filter(edge => idMap.has(edge.source) && idMap.has(edge.target))
      .map(edge => normalizeEdge({ ...deepCopy(edge), id: uuidv4(), source: idMap.get(edge.source), target: idMap.get(edge.target), selected: false }, [...nodesRef.current, ...pasted]));
    setNodes(nds => nds.map(node => ({ ...node, selected: false })).concat(pasted));
    setEdges(eds => removeDuplicateConnections([...eds, ...pastedEdges], [...nodesRef.current, ...pasted]));
    return true;
  }

  // ── Keyboard (e.code = layout-independent) ─────────────────────
  useEffect(() => {
    function onKey(e) {
      const inInput = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA';
      if (e.ctrlKey || e.metaKey) {
        if (!canEdit) { if (e.code === 'KeyS') e.preventDefault(); return; }
        if (!inInput && e.code === 'KeyC') { if (copySelectedNodes()) e.preventDefault(); return; }
        if (!inInput && e.code === 'KeyV') { if (pasteCopiedNodes()) e.preventDefault(); return; }
        if (e.code === 'KeyZ' && !e.shiftKey)                           { e.preventDefault(); undo();       return; }
        if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))     { e.preventDefault(); redo();       return; }
        if (e.code === 'KeyS')                                           { e.preventDefault(); handleSave(); return; }
      }
      if (canEdit && !inInput && (e.key === 'Delete' || e.key === 'Backspace')) handleDeleteSelected();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!bot) return <div style={s.loading}>Загрузка...</div>;

  const inspectorNode = selectedNodeIds.length === 1 && inspectorNodeId ? (nodes.find(n => n.id === inspectorNodeId) ?? null) : null;
  const allBotVariables = { ...extractVars(nodes), ...extractCodexVars(nodes), ...extractAchievementVars(nodes) };
  const placeholderVariables = { ...SYSTEM_PLACEHOLDER_VARIABLES, ...allBotVariables };
  const botVariables = inspectorNode ? varsBeforeNode(nodes, edges, inspectorNode.id) : allBotVariables;
  const simulatorVariables = simulatorStartNodeId ? varsBeforeNode(nodes, edges, simulatorStartNodeId) : {};
  const displayedNodes = highlightedNodeId
    ? nodes.map(node => node.id === highlightedNodeId
      ? { ...node, className: `${node.className || ''} node-search-highlight`.trim() }
      : { ...node, className: (node.className || '').replace(/\bnode-search-highlight\b/g, '').trim() || undefined })
    : nodes;
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const displayedEdges = edges.map(edge => {
    const normalized = normalizeEdge(edge, nodes);
    const selectedLink = selectedNodeIdSet.has(normalized.source) || selectedNodeIdSet.has(normalized.target);
    if (!selectedLink) return normalized;
    return {
      ...normalized,
      animated: true,
      style: { ...(normalized.style || {}), strokeDasharray: '6 4' },
    };
  });
  const openSimulator = (startNodeId = null) => {
    setSimulatorStartNodeId(startNodeId);
    setShowSimulator(true);
  };
  const handleValidate = () => {
    const issues = validateScenario(nodes, edges);
    alert(issues.length ? `Проверка сценария:\n\n${issues.join('\n')}` : 'Проверка пройдена: проблем не найдено.');
  };

  return (
    <div style={s.page}>
      {/* Topbar */}
      <div style={s.topbar}>
        <button style={s.backBtn} onClick={() => navigate('/')}>← Боты</button>
        <input style={s.nameInput} value={botName} onChange={e => setBotName(e.target.value)} onKeyDown={e => e.stopPropagation()} />
        <div style={s.actions}>
          {canEdit && <button style={s.btnHelp} onClick={toggleNodesExpanded}>
            {nodesExpanded ? 'Свернуть ноды' : 'Развернуть ноды'}
          </button>}
          <button style={s.btnHelp} onClick={() => setShowLore(true)}>Лор</button>
          <button style={s.btnHelp} onClick={() => setShowSearch(v => !v)} title="Поиск нод (Ctrl+F)">Поиск 🔍</button>
          <button style={s.btnTest} onClick={() => openSimulator()}>🧪 Тест</button>
          <button style={s.btnValidate} onClick={handleValidate}>Проверить</button>
          {isOwner ? (
            telegramStatus.running ? (
              <button style={s.btnTelegramStop} onClick={handleTelegramStop} disabled={telegramBusy}>
                {telegramBusy ? '...' : '■ Остановить Telegram-бота'}
              </button>
            ) : (
              <button style={s.btnTelegramStart} onClick={openTelegramStart} disabled={telegramBusy}>
                {telegramBusy ? '...' : '▶ Создать Telegram-бота'}
              </button>
            )
          ) : (
            <button style={{ ...s.btnTelegramStart, opacity: 0.45, cursor: 'not-allowed' }}
              onClick={() => alert('Управление Telegram-ботом доступно только владельцу проекта.')}>
              Telegram
            </button>
          )}
          {isOwner && <button style={s.btnTelegramLogs} onClick={() => setShowTelegramLogs(true)}>
            Логи Telegram
          </button>}
          {canEdit && <button style={{ ...s.btnHistory, background: showHistory ? '#2a2d3e' : 'transparent' }} onClick={() => setShowHistory(v => !v)}>
            📋 История {snapshots.length > 0 && <span style={s.badge}>{snapshots.length}</span>}
          </button>}
          {canEdit && <button style={s.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? '...' : saved ? '✓ Готово' : 'Сохранить'}
          </button>}
          {!canEdit && <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', padding: '0 6px' }}>👁 Только просмотр</span>}
          <div style={s.settingsWrap}>
            {canEdit && <button style={s.btnSettings} title="Настройки" onClick={() => setShowSettings(value => !value)}>⚙</button>}
            {showSettings && (
              <div style={s.settingsMenu}>
                <button style={s.settingsItem} onClick={() => { setShowAdmin(true); setShowSettings(false); }}>Админ</button>
                {user?.login === 'SNR93' && (
                  <button style={s.settingsItem} onClick={() => { setShowTelegramBackup(true); setShowSettings(false); }}>Telegram бэкап</button>
                )}
                <button style={s.settingsItem} onClick={handleDownloadJson}>JSON</button>
                <label style={s.autoSaveControl}>
                  <span>Автосохранение</span>
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={e => setAutoSaveEnabled(e.target.checked)}
                    style={s.autoSaveCheckbox}
                  />
                </label>
                {autoSaveEnabled && (
                  <div style={s.autoSavePanel}>
                    <span style={s.autoSaveLabel}>Минуты</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={autoSaveMinutes}
                      onChange={e => setAutoSaveMinutes(e.target.value)}
                      onBlur={() => {
                        if (!Number(autoSaveMinutes) || Number(autoSaveMinutes) < 1) setAutoSaveMinutes('10');
                      }}
                      onKeyDown={e => e.stopPropagation()}
                      style={s.autoSaveInput}
                    />
                    {autoSaveStatus && (
                      <span style={{ ...s.autoSaveStatus, color: autoSaveStatus === 'saved' ? '#22c55e' : '#ef4444' }}>
                        {autoSaveStatus === 'saved' ? 'Сохранено' : 'Ошибка'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button style={s.btnHelp} onClick={() => setShowHelp(true)}>? Справка</button>
        </div>
      </div>

      {/* Search overlay */}
      {showSearch && (
        <div style={{ position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: '#1a1c2a', border: '1px solid #3b82f6', borderRadius: 10, padding: 12, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          <input autoFocus style={{ width: '100%', boxSizing: 'border-box', background: '#12131a', border: '1px solid #3a3f55', borderRadius: 6, color: '#e2e8f0', fontSize: 13, padding: '7px 10px', outline: 'none' }}
            placeholder="Поиск по названию, тексту, ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setShowSearch(false); e.stopPropagation(); }} />
          <div style={{ maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
            {(() => {
              const q = searchQuery.toLowerCase().trim();
              if (!q) return <div style={{ color: '#4a5568', fontSize: 12, padding: '4px 0' }}>Введите запрос. Ищет по названию, тексту, кнопкам, переменным.</div>;
              function nodeText(n) {
                const d = n.data || {};
                const parts = [
                  d.title, d.text, d.nodeId, n.id,
                  ...(d.messages || []).map(m => m.text),
                  ...(d.buttons || []).map(b => b.label),
                  ...(d.branches || []).map(b => b.label),
                  ...(d.entries || []).map(e => e.varName || e.itemKey || e.reputationTarget || e.characterKey || e.codexKey || ''),
                  ...(d.entries || []).flatMap(e => (e.levels || []).map(l => l.label)),
                  d.prompt, d.template, d.formula, d.command,
                ];
                return parts.filter(Boolean).join(' ').toLowerCase();
              }
              const results = nodes.filter(n => nodeText(n).includes(q));
              if (!results.length) return <div style={{ color: '#4a5568', fontSize: 12, padding: '4px 0' }}>Ничего не найдено</div>;
              return results.slice(0, 30).map(n => {
                const meta = getNodeMeta(n.type);
                const label = meta?.label || n.type;
                const title = n.data?.title || '';
                return (
                  <div key={n.id}
                    style={{ padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#252a42'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                      setHighlightedNodeId(n.id);
                      setShowSearch(false);
                      const w = n.measured?.width || 240;
                      const h = n.measured?.height || 120;
                      rfRef.current?.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1.1, duration: 500 });
                    }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{meta?.icon || '▪'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || label}</div>
                      {title && <div style={{ color: '#718096', fontSize: 11 }}>{label}</div>}
                    </div>
                    {n.data?.nodeId && <span style={{ color: '#4a5568', fontSize: 10, flexShrink: 0 }}>#{n.data.nodeId}</span>}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Workspace */}
      <div style={s.workspace}>
        <NodePanel onAddNode={handleAddNodeFromPanel} />
        <div style={s.canvas}>
          <NodeDebugContext.Provider value={openSimulator}>
            <ReactFlow
              nodes={displayedNodes} edges={displayedEdges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={canEdit ? onConnect : undefined}
              onConnectStart={canEdit ? onConnectStart : undefined}
              onConnectEnd={canEdit ? onConnectEnd : undefined}
              isValidConnection={isValidConnection}
              onEdgeDoubleClick={canEdit ? onEdgeDoubleClick : undefined}
              onNodeClick={onNodeClick}
              onNodeDragStop={canEdit ? onNodeDragStop : undefined}
              onPaneContextMenu={canEdit ? onPaneContextMenu : undefined}
              nodeTypes={nodeTypes}
              onInit={inst => { rfRef.current = inst; }}
              defaultEdgeOptions={EDGE_DEFAULTS}
              proOptions={{ hideAttribution: true }}
              fitView deleteKeyCode={null}
              nodesDraggable={canEdit}
              nodesConnectable={canEdit}
              selectionKeyCode="Control" multiSelectionKeyCode="Control"
              selectionMode="partial"
              style={{ background: '#12131a' }}
            >
              <Background variant={BackgroundVariant.Dots} color="#2a2d3e" gap={24} size={1} />
              <Controls style={{ background: '#1e2030', border: '1px solid #2d3458' }} />
              <MiniMap pannable zoomable style={{ background: '#1a1c2a', border: '1px solid #2d3458' }} nodeColor="#3a3f55" maskColor="rgba(18,19,26,0.75)" />
            </ReactFlow>
          </NodeDebugContext.Provider>

          {selectedNodeIds.filter(nodeId => nodes.find(node => node.id === nodeId)?.type !== 'groupNode').length > 1 && (
            <button style={s.groupButton} onClick={createGroupFromSelection}>▣ Группа</button>
          )}

          {showHistory && !compareSnap && (
            <HistoryPanel snapshots={snapshots}
              onRestore={handleRestoreSnapshot}
              onCompare={snap => { setCompareSnap(snap); setShowHistory(false); }}
              onComment={handleCommentSnapshot}
              onDelete={handleDeleteSnapshot}
              onClose={() => setShowHistory(false)} />
          )}
          {compareSnap && (
            <CompareView snapshot={compareSnap} currentNodes={nodes} currentEdges={edges} onClose={() => setCompareSnap(null)} />
          )}
          {inspectorNode && !compareSnap && (
            <NodeInspector node={inspectorNode} onUpdate={updateNodeData} onUpdateNode={updateNode} onRenameVariable={renameVariableEverywhere} onClose={() => setInspectorNodeId(null)} botVariables={botVariables} allBotVariables={allBotVariables} placeholderVariables={placeholderVariables} botId={id} nodes={nodes} />
          )}
        </div>
      </div>

      {/* Context menu — closed only by its own outside-click handler */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y}
          allowedTypes={contextMenu.allowedTypes}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)} />
      )}

      {/* Simulator */}
      {showSimulator && (
        <Simulator nodes={nodes} edges={edges} botVariables={simulatorVariables} botName={botName}
          initialNodeId={simulatorStartNodeId}
          onClose={() => { setShowSimulator(false); setSimulatorStartNodeId(null); }} />
      )}

      {showTelegramStart && (
        <div style={s.telegramOverlay} onMouseDown={() => !telegramBusy && setShowTelegramStart(false)}>
          <form style={s.telegramModal} onSubmit={handleTelegramStart} onMouseDown={e => e.stopPropagation()}>
            <div style={s.telegramIcon}>✈</div>
            <div style={s.telegramTitle}>Запустить Telegram-бота?</div>
            <div style={s.telegramText}>
              Сценарий будет сохранён и запущен в Telegram. После запуска отправьте вашему боту команду <code style={s.telegramCode}>/start</code>.
            </div>

            <label style={s.telegramLabel}>
              Telegram-токен
              <input
                type="text"
                style={s.telegramInput}
                value={telegramToken}
                placeholder="123456789:AA..."
                autoComplete="off"
                onChange={e => { setTelegramToken(e.target.value); setTelegramError(''); }}
                onKeyDown={e => e.stopPropagation()}
              />
            </label>
            {telegramStatus.tokenConfigured && (
              <div style={s.telegramSaved}>Показан сохранённый токен. Его можно заменить перед запуском.</div>
            )}
            {telegramError && <div style={s.telegramError}>{telegramError}</div>}

            <div style={s.telegramHelp}>
              <div style={s.telegramHelpTitle}>Как получить токен</div>
              <div>1. Откройте <a style={s.telegramLink} href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> в Telegram.</div>
              <div>2. Отправьте команду <code style={s.telegramCode}>/newbot</code> и задайте имя бота.</div>
              <div>3. Скопируйте выданный токен и вставьте его в поле выше.</div>
            </div>

            <div style={s.telegramActions}>
              <button type="button" style={s.telegramCancel} onClick={() => setShowTelegramStart(false)} disabled={telegramBusy}>
                Отмена
              </button>
              <button type="submit" style={s.telegramConfirm} disabled={telegramBusy}>
                {telegramBusy ? 'Запуск...' : '▶ Сохранить и запустить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showTelegramLogs && (
        <div style={s.logOverlay} onMouseDown={() => setShowTelegramLogs(false)}>
          <div style={s.logModal} onMouseDown={e => e.stopPropagation()}>
            <div style={s.logHeader}>
              <div>
                <div style={s.logTitle}>Логи Telegram-бота</div>
                <div style={s.logStatus}>
                  {telegramStatus.running
                    ? `Запущен${telegramStatus.botUsername ? `: @${telegramStatus.botUsername}` : ''}`
                    : 'Остановлен'}
                </div>
              </div>
              <button style={s.logClose} onClick={() => setShowTelegramLogs(false)}>×</button>
            </div>
            <div style={s.logBody}>
              {(telegramStatus.logs || []).length === 0 && <div style={s.logEmpty}>Лог пока пуст.</div>}
              {(telegramStatus.logs || []).map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} style={s.logRow}>
                  <span style={s.logTime}>{new Date(entry.timestamp).toLocaleString('ru')}</span>
                  <span style={{ ...s.logLevel, color: entry.level === 'error' ? '#fc8181' : '#68d391' }}>
                    {entry.level}
                  </span>
                  <span style={s.logMessage}>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAdmin && <AdminPanel botId={id} onClose={() => setShowAdmin(false)} />}
      {showTelegramBackup && <TelegramBackupModal onClose={() => setShowTelegramBackup(false)} />}
      {showLore && <LoreModal lore={botLore} onChange={setBotLore} onClose={() => setShowLore(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <div style={s.hint}>
        ПКМ / тяни связь в пустоту — добавить · двойной клик по связи — разорвать · Ctrl+S — сохранить · Ctrl+Z/Y — undo/redo · Del — удалить
      </div>
    </div>
  );
}

const s = {
  page:      { height: '100vh', display: 'flex', flexDirection: 'column', background: '#12131a' },
  loading:   { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#718096', fontSize: 18 },
  topbar:    { display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 52, background: '#1a1c2a', borderBottom: '1px solid #2d3458', flexShrink: 0 },
  backBtn:   { background: 'transparent', border: '1px solid #2d3458', borderRadius: 6, color: '#a0aec0', fontSize: 13, padding: '5px 12px', cursor: 'pointer' },
  nameInput: { flex: 1, maxWidth: 320, background: '#12131a', border: '1px solid #2d3458', borderRadius: 6, color: '#e2e8f0', fontSize: 15, fontWeight: 600, padding: '5px 10px', outline: 'none' },
  actions:   { display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' },
  btnTest:   { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  btnValidate: { background: '#1e2030', color: '#68d391', border: '1px solid #276749', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  btnTelegramStart: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btnTelegramStop: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btnTelegramLogs: { background: '#1e2030', color: '#a0aec0', border: '1px solid #2d3458', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  btnAdmin: { background: '#1e2030', color: '#f6ad55', border: '1px solid #744210', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  btnHistory:{ border: '1px solid #2d3458', borderRadius: 6, color: '#a0aec0', fontSize: 13, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  badge:     { background: '#3b82f6', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 5px', fontWeight: 700 },
  btnSave:   { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  autoSaveControl: { display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: 12, whiteSpace: 'nowrap' },
  autoSaveCheckbox: { width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' },
  autoSavePanel: { display: 'flex', alignItems: 'center', gap: 6, background: '#12131a', border: '1px solid #2d3458', borderRadius: 6, padding: '4px 6px' },
  autoSaveLabel: { color: '#94a3b8', fontSize: 11 },
  autoSaveInput: { width: 54, background: '#1e2030', border: '1px solid #2d3458', borderRadius: 5, color: '#e2e8f0', fontSize: 12, padding: '3px 6px', outline: 'none' },
  autoSaveStatus: { fontSize: 11, whiteSpace: 'nowrap' },
  settingsWrap: { position: 'relative' },
  btnSettings: { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1e2030', color: '#cbd5e1', border: '1px solid #2d3458', borderRadius: 6, fontSize: 16, cursor: 'pointer' },
  settingsMenu: { position: 'absolute', top: 38, right: 0, zIndex: 350, width: 230, background: '#1a1c2a', border: '1px solid #2d3458', borderRadius: 8, padding: 8, boxShadow: '0 10px 28px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 8 },
  settingsItem: { width: '100%', textAlign: 'left', background: '#1e2030', color: '#cbd5e1', border: '1px solid #2d3458', borderRadius: 6, padding: '7px 9px', fontSize: 12, cursor: 'pointer' },
  btnDownload: { background: '#1e2030', color: '#a0aec0', border: '1px solid #2d3458', borderRadius: 6, padding: '6px 14px', fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' },
  btnHelp: { background: '#1e2030', color: '#c4b5fd', border: '1px solid #4c3f78', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' },
  workspace: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvas:    { flex: 1, height: '100%', position: 'relative' },
  groupButton: { position: 'absolute', top: 12, left: 12, zIndex: 15, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.35)' },
  hint:      { textAlign: 'center', fontSize: 11, color: '#4a5568', padding: '4px', background: '#1a1c2a', borderTop: '1px solid #2d3458', flexShrink: 0 },
  telegramOverlay: { position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  telegramModal: { width: 'min(520px, 94vw)', background: '#1a1c2a', border: '1px solid #2d3458', borderRadius: 14, padding: 22, boxShadow: '0 18px 52px rgba(0,0,0,0.65)' },
  telegramIcon: { width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#229ED9', color: '#fff', fontSize: 25, marginBottom: 14 },
  telegramTitle: { color: '#e2e8f0', fontSize: 20, fontWeight: 700 },
  telegramText: { color: '#a0aec0', fontSize: 13, lineHeight: 1.6, marginTop: 8 },
  telegramLabel: { display: 'block', color: '#cbd5e0', fontSize: 12, fontWeight: 700, marginTop: 18 },
  telegramInput: { width: '100%', boxSizing: 'border-box', marginTop: 7, background: '#12131a', border: '1px solid #3a3f55', borderRadius: 7, color: '#e2e8f0', fontSize: 14, padding: '9px 11px', outline: 'none' },
  telegramSaved: { color: '#68d391', fontSize: 11, marginTop: 7 },
  telegramError: { color: '#fc8181', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, fontSize: 12, lineHeight: 1.5, padding: '8px 10px', marginTop: 9 },
  telegramHelp: { color: '#a0aec0', background: '#12131a', border: '1px solid #2d3458', borderRadius: 8, fontSize: 12, lineHeight: 1.7, padding: '10px 12px', marginTop: 16 },
  telegramHelpTitle: { color: '#e2e8f0', fontWeight: 700, marginBottom: 3 },
  telegramLink: { color: '#38bdf8', textDecoration: 'none' },
  telegramCode: { color: '#f6ad55', background: '#1e2030', borderRadius: 4, padding: '1px 4px' },
  telegramActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  telegramCancel: { background: '#2a2d3e', color: '#a0aec0', border: '1px solid #3a3f55', borderRadius: 7, padding: '8px 14px', fontSize: 13 },
  telegramConfirm: { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 700 },
  logOverlay: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logModal: { width: 'min(820px, 90vw)', height: 'min(620px, 82vh)', background: '#1a1c2a', border: '1px solid #2d3458', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.55)' },
  logHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #2d3458', background: '#1e2030' },
  logTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: 700 },
  logStatus: { color: '#718096', fontSize: 12, marginTop: 3 },
  logClose: { background: 'transparent', border: 'none', color: '#718096', fontSize: 22, cursor: 'pointer' },
  logBody: { flex: 1, overflowY: 'auto', padding: 12, fontFamily: 'monospace', fontSize: 12 },
  logEmpty: { color: '#4a5568', textAlign: 'center', paddingTop: 40 },
  logRow: { display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid rgba(45,52,88,0.45)' },
  logTime: { color: '#718096', flexShrink: 0 },
  logLevel: { width: 42, flexShrink: 0 },
  logMessage: { color: '#cbd5e0', wordBreak: 'break-word' },
};
