// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
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

  test('requires handle argument', () => {
    const result = run('login');
    expect(result.exitCode).not.toBe(0);
  });
});
