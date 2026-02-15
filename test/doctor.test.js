// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit doctor', () => {
  test('reports setup status', () => {
    const result = run('doctor');
    expect(result.stdout).toMatch(/setup:/);
  });

  test('reports beacon status', () => {
    const result = run('doctor');
    expect(result.stdout).toMatch(/beacon:/);
  });

  test('reports skill status', () => {
    const result = run('doctor');
    expect(result.stdout).toMatch(/skill:/);
  });
});
