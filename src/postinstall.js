// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  const skillDir = join(currentDir, '..', 'skills', 'vit');
  const result = spawnSync(
    'npx',
    ['--yes', 'skills', 'add', skillDir, '-g', '-a', 'claude-code', '-y'],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    }
  );

  if (result.status === 0) {
    console.log('vit: skill installed (using-vit)');
  }
} catch {
  process.exit(0);
}
