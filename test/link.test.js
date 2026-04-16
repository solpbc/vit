// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit link', () => {
  let tmpHome;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  test('--help shows usage', () => {
    const result = run('link --help');
    expect(result.stdout).toContain('Link');
    expect(result.exitCode).toBe(0);
  });

  test('creates symlink without error', () => {
    tmpHome = join(tmpdir(), '.test-link-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    const result = run('link', undefined, { HOME: tmpHome });
    expect(result.exitCode).toBe(0);
    const linkPath = join(tmpHome, '.local', 'bin', 'vit');
    expect(existsSync(linkPath)).toBe(true);
  });

  test('is idempotent', () => {
    tmpHome = join(tmpdir(), '.test-link-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    const env = { HOME: tmpHome };
    run('link', undefined, env);
    const result = run('link', undefined, env);
    expect(result.exitCode).toBe(0);
  });
});
