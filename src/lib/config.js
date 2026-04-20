// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, configPath } from './paths.js';
import { errorMessage } from './error-format.js';

const vitJsonPath = configPath('vit.json');

export function loadConfig() {
  if (!existsSync(vitJsonPath)) return {};
  try {
    return JSON.parse(readFileSync(vitJsonPath, 'utf-8'));
  } catch (err) {
    console.warn(`warning: failed to read ${vitJsonPath}: ${errorMessage(err)}`);
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
  if (opts?.did) return opts.did;
  const localLogin = join(process.cwd(), '.vit', 'login.json');
  try {
    if (existsSync(localLogin)) {
      const local = JSON.parse(readFileSync(localLogin, 'utf-8'));
      if (local.did) return local.did;
    }
  } catch (err) {
    console.warn(`warning: failed to read ${localLogin}: ${errorMessage(err)}`);
  }
  const did = loadConfig().did;
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
