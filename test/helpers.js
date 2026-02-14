// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { join } from 'node:path';
import { execSync } from 'node:child_process';

const vitBin = join(import.meta.dir, '..', 'bin', 'vit.js');

export function run(args, cwd, env) {
  try {
    return {
      stdout: execSync(`bun ${vitBin} ${args}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env ? { ...process.env, ...env } : undefined,
      }).trim(),
      exitCode: 0,
    };
  } catch (err) {
    return {
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || '').trim(),
      exitCode: err.status,
    };
  }
}
