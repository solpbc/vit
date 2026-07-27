// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { expect, test } from 'bun:test';
import { join } from 'node:path';

// Run the real suite in a subprocess because Bun's mock.module() is process-global
// and persists across test files; inlining it here contaminates unrelated suites.
test('canonical remote beacon behavior passes in an isolated process', async () => {
  const suite = join(
    import.meta.dir,
    '.fixtures',
    'canonical-beacon-remote-suite-260727.test.js',
  );
  const proc = Bun.spawn(['bun', 'test', suite], {
    cwd: join(import.meta.dir, '..'),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
}, 30_000);
