// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit doctor', () => {
  let tmpHome;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function doctorEnv() {
    tmpHome = join(tmpdir(), '.test-doctor-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    return { HOME: tmpHome, XDG_CONFIG_HOME: join(tmpHome, '.config') };
  }

  test('reports beacon status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/beacon:/);
  });

  test('reports skill status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/skill:/);
  });

  test('reports bluesky status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/bluesky:/);
  });

  test('reports install type', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/install:/);
  });

  test('vit status is an alias for doctor', () => {
    const result = run('status', undefined, doctorEnv());
    expect(result.stdout).toMatch(/install:/);
  });
});
