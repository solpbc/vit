// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

export function jsonOk(data) {
  console.log(JSON.stringify({ ok: true, ...data }, null, 2));
}

export function jsonError(error, hint) {
  const obj = { ok: false, error };
  if (hint) obj.hint = hint;
  console.log(JSON.stringify(obj, null, 2));
  process.exitCode = 1;
}
