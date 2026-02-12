// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit beacon', () => {
  test('probes a public repo without .vit/config.json beacon (unlit)', () => {
    const result = run('beacon https://github.com/octocat/Hello-World.git');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: unlit');
  }, 30000);

  test('errors on invalid URL', () => {
    const result = run('beacon notaurl');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  }, 30000);

  test('errors on nonexistent repo', () => {
    const result = run('beacon https://github.com/nonexistent-user-abc/repo404.git');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  }, 30000);
});
