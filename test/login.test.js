// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers.js';

describe('login', () => {
  test('--help shows --remote and --browser options', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--remote');
    expect(stdout).toContain('--browser');
  });

  test('--help shows --force option', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--force');
  });

  test('--help shows --app-password and --local options', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--app-password');
    expect(stdout).toContain('--local');
  });

  test('requires handle argument', () => {
    const result = run('login');
    expect(result.exitCode).not.toBe(0);
  });

  test('--local without .vit/ directory fails', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vit-test-'));
    try {
      const result = run('login testhandle --local', tmp);
      expect(result.exitCode).not.toBe(0);
      const output = (result.stdout || '') + ' ' + (result.stderr || '');
      expect(output).toContain('vit init');
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
