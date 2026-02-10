// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  const vars = {};
  let content;
  if (!existsSync(envPath)) {
    return vars;
  }
  try {
    content = readFileSync(envPath, 'utf-8');
  } catch {
    return vars;
  }
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

export function saveToEnv(vars) {
  const envPath = join(process.cwd(), '.env');
  let lines = [];
  if (existsSync(envPath)) {
    try {
      lines = readFileSync(envPath, 'utf-8').split('\n');
    } catch {}
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const updated = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && m[1] in vars) {
      lines[i] = `${m[1]}=${vars[m[1]]}`;
      updated.add(m[1]);
    }
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!updated.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }
  writeFileSync(envPath, lines.join('\n') + '\n');
}
