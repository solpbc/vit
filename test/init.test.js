// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

describe('vit init', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-tmp-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes beacon from HTTPS URL', () => {
    const result = run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('writes beacon from SSH URL', () => {
    const result = run('init --beacon git@github.com:solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('creates .vit directory if missing', () => {
    expect(existsSync(join(tmpDir, '.vit'))).toBe(false);
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });
    expect(existsSync(join(tmpDir, '.vit'))).toBe(true);
  });

  test('overwrites existing beacon silently', () => {
    run('init --beacon https://github.com/old/repo.git', tmpDir, { CLAUDECODE: '1' });
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });

    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    expect(JSON.parse(content).beacon).toBe('vit:github.com/solpbc/vit');
  });

  test('reads beacon from git remote with --beacon .', () => {
    // Set up a git repo with a remote origin
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/solpbc/vit.git', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init --beacon .', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');
  });

  test('errors when --beacon . has no git remote', () => {
    // tmpDir is not a git repo
    const result = run('init --beacon .', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).not.toBe(0);
  });

  test('reports beacon when no flag and beacon exists', () => {
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });
    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('beacon: vit:github.com/solpbc/vit');
    expect(result.stdout).toContain('hint: to change the beacon, run: vit init --beacon <git-url>');
  });

  test('reports no beacon when .vit exists but directory is not a git repo', () => {
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });
    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: no beacon');
    expect(result.stdout).toContain('git: false');
    expect(result.stdout).toContain('hint: run: vit init --beacon <canonical-git-url>');
  });

  test('reports .vit not found when no flag and no .vit dir', () => {
    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: not initialized');
    expect(result.stdout).toContain('git: false');
    expect(result.stdout).toContain('hint: run vit init from inside a git repository');
  });

  test('guides agent in fork repo with upstream and origin remotes', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/agent/vit.git', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add upstream https://github.com/solpbc/vit.git', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: not initialized');
    expect(result.stdout).toContain('git: true');
    expect(result.stdout).toContain('origin=');
    expect(result.stdout).toContain('upstream=');
    expect(result.stdout).toContain('hint: detected upstream remote');
    expect(result.stdout).toContain('vit init --beacon https://github.com/solpbc/vit.git');
  });

  test('guides agent in repo with only origin remote', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/solpbc/vit.git', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: not initialized');
    expect(result.stdout).toContain('git: true');
    expect(result.stdout).toContain('origin=');
    expect(result.stdout).toContain('vit init --beacon https://github.com/solpbc/vit.git');
  });

  test('guides agent in git repo with no remotes', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: not initialized');
    expect(result.stdout).toContain('git: true');
    expect(result.stdout).toContain('remotes: none');
    expect(result.stdout).toContain('hint: no git remotes found');
  });

  test('guides agent in git repo with .vit but no beacon', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });

    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status: no beacon');
    expect(result.stdout).toContain('git: true');
    expect(result.stdout).toContain('remotes: none');
    expect(result.stdout).toContain('hint: no git remotes found');
  });

  test('--beacon . prefers upstream over origin in fork', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/agent/fork.git', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git remote add upstream https://github.com/solpbc/vit.git', { cwd: tmpDir, stdio: 'pipe' });

    const result = run('init --beacon .', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('beacon: vit:github.com/solpbc/vit');
  });

  test('shows guidance for already initialized repo', () => {
    run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '1' });
    const result = run('init', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('beacon: vit:github.com/solpbc/vit');
    expect(result.stdout).toContain('hint: to change the beacon');
  });

  test('errors on invalid git URL', () => {
    const result = run('init --beacon notaurl', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).not.toBe(0);
  });

  test('rejects when run outside a coding agent', () => {
    const result = run('init --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('should be run by a coding agent');
  });
});
