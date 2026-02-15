// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function vitDir() {
  return join(process.cwd(), '.vit');
}

export function readProjectConfig() {
  const p = join(vitDir(), 'config.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeProjectConfig(obj, baseDir) {
  const dir = baseDir ? join(baseDir, '.vit') : vitDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(obj, null, 2) + '\n');
}

export function appendLog(filename, record) {
  const dir = vitDir();
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, filename), JSON.stringify(record) + '\n');
}

export function readLog(filename) {
  const p = join(vitDir(), filename);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function readFollowing() {
  const p = join(vitDir(), 'following.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return [];
  }
}

export function writeFollowing(list) {
  const dir = vitDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'following.json'), JSON.stringify(list, null, 2) + '\n');
}
