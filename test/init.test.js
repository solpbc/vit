// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('vit init --beacon', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-tmp-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes beacon from HTTPS URL', () => {
    const result = run('init --beacon https://github.com/solpbc/vit.git', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('writes beacon from SSH URL', () => {
    const result = run('init --beacon git@github.com:solpbc/vit.git', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('creates .vit directory if missing', () => {
    expect(existsSync(join(tmpDir, '.vit'))).toBe(false);
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir);
    expect(existsSync(join(tmpDir, '.vit'))).toBe(true);
  });

  test('overwrites existing beacon silently', () => {
    run('init --beacon https://github.com/old/repo.git', tmpDir);
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir);

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('reads beacon from git remote with --beacon .', () => {
    // Set up a git repo with a remote origin
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/solpbc/vit.git', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init --beacon .', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');
  });

  test('errors when --beacon . has no git remote', () => {
    // tmpDir is not a git repo
    const result = run('init --beacon .', tmpDir);
    expect(result.exitCode).not.toBe(0);
  });

  test('reports beacon when no flag and beacon exists', () => {
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir);
    const result = run('init', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');
  });

  test('reports not set when no flag and .vit exists but no beacon', () => {
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });
    const result = run('init', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: not set');
  });

  test('reports .vit not found when no flag and no .vit dir', () => {
    const result = run('init', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('.vit directory not found');
  });

  test('errors on invalid git URL', () => {
    const result = run('init --beacon notaurl', tmpDir);
    expect(result.exitCode).not.toBe(0);
  });
});
