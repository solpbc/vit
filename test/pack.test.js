// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');
let workDir;

afterEach(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

test('vit/cap.js resolves from the packed package', () => {
  workDir = mkdtempSync(join(tmpdir(), 'vit-pack-'));
  const out = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', workDir],
    { cwd: repoRoot, encoding: 'utf-8' },
  );
  const tarball = JSON.parse(out)[0].filename;

  const consumerDir = join(workDir, 'consumer');
  const vitDir = join(consumerDir, 'node_modules', 'vit');
  mkdirSync(vitDir, { recursive: true });
  execFileSync('tar', [
    '-xzf',
    join(workDir, tarball),
    '-C',
    vitDir,
    '--strip-components=1',
  ]);
  symlinkSync(join(repoRoot, 'node_modules'), join(vitDir, 'node_modules'));

  const script = "const url = import.meta.resolve('vit/cap.js'); if (!url.includes('/consumer/node_modules/vit/')) { console.error('WRONG '+url); process.exit(2); } const m = await import('vit/cap.js'); if (typeof m.publishCap !== 'function') { console.error('NOEXPORT'); process.exit(3); } console.log('OK '+url);";
  const res = execFileSync('node', ['--input-type=module', '-e', script], {
    cwd: consumerDir,
    encoding: 'utf-8',
  });

  expect(res).toContain('OK');
}, 30000);
