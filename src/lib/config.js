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
  const now = Math.floor(Date.now() / 1000);
  if (!obj.created_at) obj.created_at = now;
  obj.updated_at = now;
  mkdirSync(configDir, { recursive: true });
  writeFileSync(vitJsonPath, JSON.stringify(obj, null, 2) + '\n');
}

export function requireDid(opts) {
  const did = opts?.did || loadConfig().did;
  if (!did) {
    console.error("no DID configured. run 'vit login <handle>' first or pass --did.");
    process.exitCode = 1;
  }
  return did;
}

export function getScalars(obj) {
  return Object.entries(obj).filter(
    ([, v]) => typeof v !== 'object' || v === null
  );
}
