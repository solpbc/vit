// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit hack', () => {
  test('--help shows usage', () => {
    const result = run('hack --help');
    expect(result.stdout).toContain('Fork');
    expect(result.exitCode).toBe(0);
  });

  test('--help shows --from option', () => {
    const result = run('hack --help');
    expect(result.stdout).toContain('--from');
  });
});
