// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from './error-format.js';

export function vitDir(dir) {
  return join(dir || process.cwd(), '.vit');
}

export function readProjectConfig(dir) {
  const p = join(vitDir(dir), 'config.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (err) {
    console.warn(`warning: failed to read ${p}: ${errorMessage(err)}`);
    return {};
  }
}

export function readBeaconSet(dir) {
  const config = readProjectConfig(dir);
  const set = new Set();
  if (config.beacon) set.add(config.beacon);
  if (config.secondaryBeacon) set.add(config.secondaryBeacon);
  return set;
}

export function writeProjectConfig(obj, baseDir) {
  const dir = baseDir ? join(baseDir, '.vit') : vitDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(obj, null, 2) + '\n');
}

export function appendLog(filename, record, dir) {
  const d = vitDir(dir);
  mkdirSync(d, { recursive: true });
  appendFileSync(join(d, filename), JSON.stringify(record) + '\n');
}

export function readLog(filename, dir) {
  const p = join(vitDir(dir), filename);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn(`warning: skipping malformed line ${index + 1} in ${p}: ${errorMessage(err)}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`warning: failed to read ${p}: ${errorMessage(err)}`);
    return [];
  }
}

export function readFollowing(dir) {
  const p = join(vitDir(dir), 'following.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (err) {
    console.warn(`warning: failed to read ${p}: ${errorMessage(err)}`);
    return [];
  }
}

export function writeFollowing(list, dir) {
  const d = vitDir(dir);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'following.json'), JSON.stringify(list, null, 2) + '\n');
}
