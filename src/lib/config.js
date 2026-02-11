// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { configDir, configPath } from './paths.js';

const vitJsonPath = configPath('vit.json');

export function loadConfig() {
  if (!existsSync(vitJsonPath)) return {};
  try {
    return JSON.parse(readFileSync(vitJsonPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveConfig(obj) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(vitJsonPath, JSON.stringify(obj, null, 2) + '\n');
}

export function getScalars(obj) {
  return Object.entries(obj).filter(
    ([, v]) => typeof v !== 'object' || v === null
  );
}
