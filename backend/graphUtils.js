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
 * Missing variables keep their placeholder text ({{varName}}) so the admin can
 * immediately see which variable is absent instead of getting a silent empty string.
 * @param {string} text
 * @param {Object} vars  - player variable map { name: { value, type } }
 * @param {Function} [onMissing] - called with the variable name when not found
 */
function interpolate(text, vars, onMissing) {
  return String(text || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name) => {
    const key = name.trim();
    const variable = vars?.[key];
    if (variable !== undefined) return String(variable.value ?? '');
    if (onMissing) onMissing(key);
    return match; // keep {{varName}} visible instead of empty string
  });
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

const RESERVED_COMMANDS = new Set(['start', 'settings', 'promo', 'shop', 'ref']);

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

function branchMatches(condition, vars) {
  const variable = vars[condition.varName];
  if (!variable) return false;
  const value = variable.value;
  const target = condition.value;
  switch (condition.operator) {
    case '==': return String(value) === String(target) || value === target;
    case '!=': return String(value) !== String(target) && value !== target;
    case '>':  return +value > +target;
    case '<':  return +value < +target;
    case '>=': return +value >= +target;
    case '<=': return +value <= +target;
    default:   return false;
  }
}

function inputMatches(data, input) {
  const type = data.conditionType || 'Текст содержит';
  const value = data.caseSensitive ? (data.condition || '') : (data.condition || '').toLowerCase();
  const text = data.caseSensitive ? input : input.toLowerCase();
  if (type === 'Текст равен')       return text === value;
  if (type === 'Текст содержит')    return text.includes(value);
  if (type === 'Начинается с')      return text.startsWith(value);
  if (type === 'Заканчивается на')  return text.endsWith(value);
  if (type === 'Любой ввод')        return true;
  return false;
}

const ENTRY_TYPES = new Set(['menuNode', 'settingsNode', 'customCommandNode', 'commentNode', 'groupNode']);

/**
 * Find the story root node for a new player session.
 * - Legacy bots: returns the startNode for backward compatibility.
 * - New bots without startNode: returns the first story node that has no
 *   incoming work-edges and is not a command/structural entry type.
 */
function findStoryRoot(bot) {
  const startNode = bot.nodes.find(n => n.type === 'startNode');
  if (startNode) return startNode;
  const hasIncoming = new Set(bot.edges.filter(e => !e.data?.isComment).map(e => e.target));
  return bot.nodes.find(n => !ENTRY_TYPES.has(n.type) && !hasIncoming.has(n.id)) || null;
}

module.exports = {
  getNext, interpolate, inventoryMap, relationMap,
  cleanCommand, commandNames, parseCommand, setCommandArgs,
  branchMatches, inputMatches, RESERVED_COMMANDS, findStoryRoot,
};
