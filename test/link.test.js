// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit link', () => {
  test('--help shows usage', () => {
    const result = run('link --help');
    expect(result.stdout).toContain('Link');
    expect(result.exitCode).toBe(0);
  });

  test('creates symlink without error', () => {
    const result = run('link');
    expect(result.exitCode).toBe(0);
  });

  test('is idempotent', () => {
    run('link');
    const result = run('link');
    expect(result.exitCode).toBe(0);
  });
});
