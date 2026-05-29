// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

describe('vit --version', () => {
  test('matches package.json under node and bun', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    const nodeOutput = execSync('node bin/vit.js --version', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
    const bunOutput = execSync('bun bin/vit.js --version', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();

    expect(nodeOutput).toBe(pkg.version);
    expect(bunOutput).toBe(pkg.version);
  });
});
