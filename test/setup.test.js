// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit setup', () => {
  test('rejects when run inside a coding agent', () => {
    const result = run('setup', undefined, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must be run by a human');
  });

  test('checks for git and bun', () => {
    const result = run('setup', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.stdout).toContain('git: found');
    expect(result.stdout).toContain('bun: found');
  });

  test('reports login status', () => {
    const result = run('setup', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.stdout).toMatch(/login:/);
  });

  test('reports skill installation status', () => {
    const result = run('setup', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.stdout).toMatch(/skill:/);
  });
});
