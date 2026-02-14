// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NON_AGENT_ENV = { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' };

describe('vit adopt', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-adopt-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('shows help with <beacon> argument', () => {
    const result = run('adopt --help', tmpDir);
    expect(result.stdout).toContain('<beacon>');
    expect(result.stdout).toContain('[name]');
  });

  test('fails with no arguments', () => {
    const result = run('adopt', tmpDir);
    expect(result.exitCode).not.toBe(0);
  });

  test('fails with invalid beacon', () => {
    const result = run('adopt notaurl', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid git URL');
  });

  test('fails if directory already exists', () => {
    mkdirSync(join(tmpDir, 'hello-world'));
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  test('rejects when run inside a coding agent', () => {
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must be run by a human');
  });

  test('clones repo and shows guidance', () => {
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('vit:github.com/octocat/hello-world');
    expect(result.stdout).toContain('hello-world');
    expect(result.stdout).toContain('start your agent');
  }, 30000);

  test('clones into custom directory name', () => {
    const result = run('adopt https://github.com/octocat/Hello-World my-copy', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('my-copy');
  }, 30000);

  test('handles vit: prefixed beacon', () => {
    const result = run('adopt vit:github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('beacon: vit:github.com/octocat/hello-world');
  }, 30000);

  test('verbose flag shows step details', () => {
    const result = run('adopt -v https://github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[verbose]');
    expect(result.stdout).toContain('resolving beacon');
  }, 30000);

  test('second adopt to same dir fails', () => {
    run('adopt https://github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, NON_AGENT_ENV);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  }, 30000);
});
