/**
 * Codex developer notes:
 * Общие функции случайного выбора и нормализации весов.
 * Используются для игровых нод, где результат должен быть предсказуемо ограничен входными настройками.
 * Файл намеренно маленький, чтобы случайность не размазывалась по runtime.
 * Комментарии написаны по-русски и предназначены только для поддержки кода; они не должны менять поведение приложения.
 */

function integerOr(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function normalizeRandomConfig(data = {}) {
  const sourceBranches = data.branches || [];
  const explicitRanges = data.rangeMin !== undefined || data.rangeMax !== undefined ||
    sourceBranches.some(branch => branch.from !== undefined || branch.to !== undefined);

  if (!explicitRanges) {
    let cursor = 1;
    const branches = sourceBranches.map(branch => {
      const from = cursor;
      cursor += Math.max(1, Math.floor(+branch.weight || 1));
      return { ...branch, from, to: cursor - 1 };
    });
    return { rangeMin: 1, rangeMax: Math.max(1, cursor - 1), branches, legacy: true };
  }

  const rangeMin = integerOr(data.rangeMin, 1);
  const rangeMax = integerOr(data.rangeMax, 10);
  let cursor = rangeMin;
  const branches = sourceBranches.map(branch => {
    const from = integerOr(branch.from, cursor);
    const to = integerOr(branch.to, from);
    cursor = to + 1;
    return { ...branch, from, to };
  });
  return { rangeMin, rangeMax, branches, legacy: false };
}

function randomConfigErrors(data = {}) {
  const config = normalizeRandomConfig(data);
  if (config.legacy) return [];

  const errors = [];
  if (!Number.isInteger(Number(data.rangeMin)) || !Number.isInteger(Number(data.rangeMax))) {
    errors.push('Границы случайного числа должны быть целыми числами.');
  }
  if (config.rangeMin > config.rangeMax) errors.push('Минимальное случайное число не может быть больше максимального.');

  const sorted = [...config.branches].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const branch of config.branches) {
    if (!Number.isInteger(Number(branch.from)) || !Number.isInteger(Number(branch.to))) {
      errors.push(`У варианта «${branch.label || '?'}» границы должны быть целыми числами.`);
      continue;
    }
    if (branch.from > branch.to) errors.push(`У варианта «${branch.label || '?'}» начало диапазона больше конца.`);
    if (branch.from < config.rangeMin || branch.to > config.rangeMax) {
      errors.push(`Вариант «${branch.label || '?'}» выходит за общий диапазон ${config.rangeMin}..${config.rangeMax}.`);
    }
  }

  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].from <= sorted[index - 1].to) {
      errors.push(`Диапазоны вариантов «${sorted[index - 1].label || '?'}» и «${sorted[index].label || '?'}» пересекаются.`);
    }
  }

  let expected = config.rangeMin;
  for (const branch of sorted) {
    if (branch.from > expected) errors.push(`Не распределены числа ${expected}..${branch.from - 1}.`);
    expected = Math.max(expected, branch.to + 1);
  }
  if (expected <= config.rangeMax) errors.push(`Не распределены числа ${expected}..${config.rangeMax}.`);
  return [...new Set(errors)];
}

function pickRandomBranch(data = {}, random = Math.random) {
  const config = normalizeRandomConfig(data);
  const roll = Math.floor(random() * (config.rangeMax - config.rangeMin + 1)) + config.rangeMin;
  return { roll, branch: config.branches.find(item => roll >= item.from && roll <= item.to) || null };
}

module.exports = { normalizeRandomConfig, pickRandomBranch, randomConfigErrors };
