// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeVitDir(base, beacon) {
  const vitDir = join(base, '.vit');
  mkdirSync(vitDir, { recursive: true });
  writeFileSync(join(vitDir, 'config.json'), JSON.stringify({ beacon }));
  return base;
}

describe('vit inbox', () => {
  test('errors when no beacon set', () => {
    const tmp = join(tmpdir(), '.test-inbox-nobeacon-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run('inbox', tmp);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('no beacon set');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('--json errors when no beacon set', () => {
    const tmp = join(tmpdir(), '.test-inbox-nobeacon-json-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run('inbox --json', tmp);
    expect(r.exitCode).not.toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('no beacon set');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('--json returns caps array when beacon set', () => {
    const tmp = join(tmpdir(), '.test-inbox-json-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/solpbc/vit');
    const r = run('inbox --json', tmp);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.caps)).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('--json with --kind filters caps', () => {
    const tmp = join(tmpdir(), '.test-inbox-kind-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/solpbc/vit');
    const r = run('inbox --kind request --json', tmp);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.caps)).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('gracefully degrades when explore API unavailable', () => {
    const tmp = join(tmpdir(), '.test-inbox-unavail-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/solpbc/vit');
    const r = run('inbox --explore-url http://localhost:1', tmp);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('unavailable');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('gracefully degrades when explore API unavailable --json', () => {
    const tmp = join(tmpdir(), '.test-inbox-unavail-json-' + Math.random().toString(36).slice(2));
    makeVitDir(tmp, 'vit:github.com/solpbc/vit');
    const r = run('inbox --explore-url http://localhost:1 --json', tmp);
    expect(r.exitCode).not.toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('unavailable');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('shows help', () => {
    const r = run('inbox --help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('inbox');
    expect(r.stdout).toContain('--kind');
    expect(r.stdout).toContain('--sort');
  });
});
