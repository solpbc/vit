// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { execFileSync } from 'node:child_process';

/**
 * Find the full path of an executable (cross-runtime replacement for Bun.which).
 * Returns the path string or null if not found.
 */
export function which(cmd) {
  try {
    const bin = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(bin, [cmd], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n')[0];
  } catch {
    return null;
  }
}
