// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const vitBin = join(import.meta.dir, '..', 'bin', 'vit.js');
const nonAgentEnv = { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '', OPENCODE: '' };

export function run(args, cwd, env, input) {
  const result = spawnSync(`bun ${vitBin} ${args}`, {
    shell: true,
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, ...nonAgentEnv, ...(env || {}) },
    input,
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status ?? 1,
  };
}
