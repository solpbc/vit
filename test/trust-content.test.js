// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { expect, test } from 'bun:test';
import { join } from 'node:path';

// Module mocks are process-global in Bun. Keep this suite isolated.
test('content-bound trust passes through every command', async () => {
  const proc = Bun.spawn(['bun', 'test', join(import.meta.dir, '.fixtures/trust-content-suite.test.js')], {
    stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30_000);
