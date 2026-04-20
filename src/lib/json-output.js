// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { collectCauses } from './error-format.js';

function errorMessage(input) {
  if (input instanceof Error) return input.message || String(input);
  return String(input);
}

export function jsonOk(data) {
  console.log(JSON.stringify({ ok: true, ...data }, null, 2));
}

export function jsonError(input, hintArg) {
  if (typeof input === 'string') {
    const obj = { ok: false, error: input };
    if (hintArg) obj.hint = hintArg;
    console.log(JSON.stringify(obj, null, 2));
    process.exitCode = 1;
    return;
  }

  const obj = {
    ok: false,
    error: errorMessage(input),
  };
  const causes = collectCauses(input);
  if (causes.length > 0) obj.causes = causes;

  const resolvedHint = typeof hintArg === 'string'
    ? hintArg
    : (typeof input?.hint === 'string' ? input.hint : undefined);
  if (resolvedHint) obj.hint = resolvedHint;

  console.log(JSON.stringify(obj, null, 2));
  process.exitCode = 1;
}
