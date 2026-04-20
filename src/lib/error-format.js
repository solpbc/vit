// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

const MAX_CAUSES = 10;

function isObjectLike(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function errorMessage(value) {
  if (value instanceof Error) return value.message || String(value);
  if (isObjectLike(value) && typeof value.message === 'string') return value.message;
  return String(value);
}

function stackLinesOf(value) {
  if (!(value instanceof Error) || typeof value.stack !== 'string' || value.stack === '') return [];
  return value.stack.split('\n').map(line => `    ${line}`);
}

function walkChain(err) {
  if (!(err instanceof Error)) {
    return [{ value: err, message: String(err), stackLines: [] }];
  }

  const levels = [];
  const seen = new Set();
  let current = err;
  let causeCount = 0;

  while (current !== undefined) {
    if (isObjectLike(current)) {
      if (seen.has(current)) break;
      seen.add(current);
    }

    levels.push({
      value: current,
      message: errorMessage(current),
      stackLines: stackLinesOf(current),
    });

    if (!isObjectLike(current) || !('cause' in current)) break;

    const next = current.cause;
    if (next === undefined) break;
    if (causeCount >= MAX_CAUSES) break;

    current = next;
    causeCount += 1;
  }

  return levels;
}

export function collectCauses(err) {
  if (!(err instanceof Error)) return [];
  return walkChain(err).slice(1).map(level => level.message);
}

export function formatError(err, { hint, verbose = false } = {}) {
  const levels = walkChain(err);
  const lines = [];

  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i];
    lines.push(i === 0 ? level.message : `  caused by: ${level.message}`);
    if (verbose && level.stackLines.length > 0) {
      lines.push(...level.stackLines);
    }
  }

  if (typeof hint === 'string' && hint) {
    lines.push(`hint: ${hint}`);
  }

  return lines.join('\n');
}
