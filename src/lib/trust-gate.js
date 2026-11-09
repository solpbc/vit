// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vitDir } from './vit-dir.js';

const ACCEPT_FILE = 'dangerous-accept';

// A ref is a discovery label. Authorization belongs to the reviewed record.
export function requireTrustedRecord(ref, record, trusted) {
  if (typeof record.uri === 'string' && record.uri.length > 0 &&
      typeof record.cid === 'string' && record.cid.length > 0 &&
      trusted.some(entry => entry.ref === ref && entry.uri === record.uri && entry.cid === record.cid)) {
    return;
  }
  throw new Error(`'${ref}' is not vetted at this URI and CID. review it again with 'vit vet ${ref}', then trust it with 'vit vet ${ref} --trust'.`);
}

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
