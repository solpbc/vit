// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vitDir } from './vit-dir.js';

const ACCEPT_FILE = 'dangerous-accept';

/**
 * Check if dangerous-accept flag is active.
 * Returns { accepted: true } or { accepted: false }.
 * No TTL — once set, it's permanent until deleted.
 */
export function checkDangerousAccept(dir) {
  const p = join(vitDir(dir), ACCEPT_FILE);
  if (!existsSync(p)) return { accepted: false };
  try {
    JSON.parse(readFileSync(p, 'utf-8'));
    return { accepted: true };
  } catch {
    return { accepted: false };
  }
}

/**
 * Check if the vet gate should be bypassed.
 * Returns { bypass: true, reason } or { bypass: false }.
 *
 * Bypass condition: dangerous-accept flag is active.
 * Caller checks trusted.jsonl before calling this.
 */
export function shouldBypassVet(dir) {
  const accept = checkDangerousAccept(dir);
  if (accept.accepted) {
    return { bypass: true, reason: 'dangerous-accept' };
  }
  return { bypass: false };
}
