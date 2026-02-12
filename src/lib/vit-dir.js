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

export function writeProjectConfig(obj) {
  const dir = vitDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(obj, null, 2) + '\n');
}

export function appendLog(filename, record) {
  const dir = vitDir();
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, filename), JSON.stringify(record) + '\n');
}
