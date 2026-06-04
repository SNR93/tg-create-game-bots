/**
 * Pure utility functions for graph traversal and data manipulation.
 * No side effects, no I/O — safe to use in tests.
 */

function getNext(edges, nodes, source, sourceHandle) {
  const edge = edges.find(item =>
    !item.data?.isComment &&
    item.source === source &&
    (sourceHandle === undefined || item.sourceHandle === sourceHandle) &&
    nodes.some(node => node.id === item.target && node.type !== 'commentNode')
  );
  return edge?.target || null;
}

/**
 * Interpolate {{varName}} placeholders.
 * Missing variables keep their placeholder text so admins can spot the problem instantly.
 */
function interpolate(text, vars, onMissing) {
  return String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const key = name.trim();
    const variable = vars?.[key];
    if (variable !== undefined) return String(variable.value ?? '');
    if (onMissing) onMissing(key);
    return match;
  });
}

function telegramVariables(player, chatId) {
  const id = String(player?.telegram_user_id || player?.id || chatId || '');
  const username = String(player?.username || '').replace(/^@+/, '');
  const firstName = String(player?.first_name || '');
  const lastName = String(player?.last_name || '');
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return {
    'telegram.id': { type: 'text', value: id },
    'telegram.chat_id': { type: 'text', value: String(player?.chat_id || chatId || '') },
    'telegram.username': { type: 'text', value: username },
    'telegram.nickname': { type: 'text', value: username ? `@${username}` : '' },
    'telegram.first_name': { type: 'text', value: firstName },
    'telegram.last_name': { type: 'text', value: lastName },
    'telegram.full_name': { type: 'text', value: fullName },
    'telegram.mention': { type: 'text', value: username ? `@${username}` : (fullName || id) },
  };
}

/**
 * Evaluate a single branch condition against the full session state.
 * Supports sources: variable, inventory, relation, achievement, global.
 *
 * condition = { source, key, operator, value }
 * session   = { vars, telegramVars, inventory, relations, achievementList, globalVars }
 */
function branchMatches(condition, session) {
  const { source = 'variable', key, varName, operator, value } = condition;
  const resolvedKey = key || varName || '';
  if (!resolvedKey) return false;

  let actual;

  if (source === 'inventory') {
    actual = session.inventory?.[resolvedKey] ?? 0;
  } else if (source === 'relation') {
    actual = session.relations?.[resolvedKey] ?? 0;
  } else if (source === 'achievement') {
    const has = (session.achievementList || []).includes(resolvedKey);
    if (operator === 'has')     return has;
    if (operator === 'not_has') return !has;
    return has;
  } else if (source === 'global') {
    const gv = session.globalVars?.[resolvedKey];
    if (!gv) return false;
    actual = gv.value;
  } else {
    // default: player variable
    const variable = session.vars?.[resolvedKey] || session.telegramVars?.[resolvedKey];
    if (!variable) return false;
    actual = variable.value;
  }

  switch (operator) {
    case '==': return String(actual) === String(value) || actual == value;
    case '!=': return String(actual) !== String(value) && actual != value;
    case '>':  return +actual >  +value;
    case '<':  return +actual <  +value;
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

/**
 * Evaluate whether a keyboard button should be visible.
 * Returns true if no condition is configured. Multiple conditions use AND.
 */
function evaluateButtonCondition(buttonOrCondition, session) {
  const conditions = enabledButtonConditions(buttonOrCondition);
  if (conditions.length === 0) return true;
  return conditions.every(condition => branchMatches({ source: condition.source, key: condition.key, operator: condition.operator, value: condition.value }, session));
}

function inventoryMap(items) {
  return Object.fromEntries((items || []).map(item => [item.item_key, item.quantity]));
}

function relationMap(items) {
  return Object.fromEntries((items || []).map(item => [item.character_key, item.value]));
}

function cleanCommand(value) {
  return String(value || '').trim().replace(/^\/+/, '').toLowerCase();
}

const RESERVED_COMMANDS = new Set(['start', 'menu', 'settings', 'promo', 'starsshop', 'ref']);

function commandNames(node) {
  return [node.data.command, ...String(node.data.aliases || '').split(',')]
    .map(cleanCommand)
    .filter(command => /^[a-z0-9_]{1,32}$/.test(command) && !RESERVED_COMMANDS.has(command));
}

function parseCommand(text) {
  const match = String(text || '').match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+(.*))?$/i);
  return match ? { name: cleanCommand(match[1]), args: String(match[2] || '').trim() } : null;
}

function setCommandArgs(session, args) {
  for (const key of Object.keys(session.vars)) {
    if (key.startsWith('command.')) delete session.vars[key];
  }
  const parts = String(args || '').trim().split(/\s+/).filter(Boolean);
  session.vars['command.args'] = { type: 'text', value: String(args || '').trim() };
  parts.forEach((value, index) => {
    session.vars[`command.arg${index + 1}`] = { type: 'text', value };
  });
}

const ENTRY_TYPES = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'continueStoryNode', 'commentNode', 'groupNode']);

function findStoryRoot(bot) {
  const hasIncoming = new Set(bot.edges.filter(e => !e.data?.isComment).map(e => e.target));
  return bot.nodes.find(n => !ENTRY_TYPES.has(n.type) && !hasIncoming.has(n.id)) || null;
}

module.exports = {
  getNext, interpolate, branchMatches, evaluateButtonCondition,
  inventoryMap, relationMap, cleanCommand, commandNames,
  parseCommand, setCommandArgs, telegramVariables, RESERVED_COMMANDS, findStoryRoot,
};
