// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { join } from 'node:path';
import { execSync } from 'node:child_process';

const vitBin = join(import.meta.dir, '..', 'bin', 'vit.js');
const nonAgentEnv = { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '', OPENCODE: '' };

export function run(args, cwd, env, input) {
  try {
    return {
      stdout: execSync(`bun ${vitBin} ${args}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...nonAgentEnv, ...(env || {}) },
        input,
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
