// SPDX-License-Identifier: MIT
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

  test('reports bluesky status', () => {
    const result = run('doctor');
    expect(result.stdout).toMatch(/bluesky:/);
  });

  test('reports install type', () => {
    const result = run('doctor');
    expect(result.stdout).toMatch(/install:/);
  });

  test('vit status is an alias for doctor', () => {
    const result = run('status');
    expect(result.stdout).toMatch(/setup:/);
  });
});
