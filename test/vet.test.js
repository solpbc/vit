// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit vet', () => {
  test('shows help with <ref> argument', () => {
    const result = run('vet --help');
    expect(result.stdout).toContain('<ref>');
  });

  test('rejects when run inside a coding agent', () => {
    const result = run('vet fast-cache-invalidation', undefined, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must be run by a human');
    expect(result.stderr).toContain('vit vet fast-cache-invalidation');
    expect(result.stderr).toContain('--trust');
  });

  test('rejects when run inside gemini', () => {
    const result = run('vet fast-cache-invalidation', undefined, { CLAUDECODE: '', GEMINI_CLI: '1', CODEX_CI: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must be run by a human');
  });

  test('rejects invalid ref format', () => {
    const result = run('vet not-valid', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid ref');
  });

  test('fails with no arguments', () => {
    const result = run('vet');
    expect(result.exitCode).not.toBe(0);
  });
});
