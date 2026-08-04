// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit adopt', () => {
  let tmpDir;
  let shimDir;
  let homeDir;
  let logPath;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-adopt-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpDir, { recursive: true });
    shimDir = join(tmpDir, 'shim');
    homeDir = join(tmpDir, 'home');
    logPath = join(tmpDir, 'commands.log');
    mkdirSync(shimDir);
    mkdirSync(join(homeDir, 'config'), { recursive: true });
    mkdirSync(join(homeDir, 'gh'), { recursive: true });

    for (const tool of ['gh', 'git']) {
      const script = [
        '#!/bin/sh',
        `log_file=${JSON.stringify(logPath)}`,
        `printf '${tool}' >> "$log_file"`,
        'for a in "$@"; do',
        '  printf " %s" "$a" >> "$log_file"',
        '  last="$a"',
        'done',
        'printf "\\n" >> "$log_file"',
        'mkdir -p "$last"',
        'exit 0',
        '',
      ].join('\n');
      const shimPath = join(shimDir, tool);
      writeFileSync(shimPath, script);
      chmodSync(shimPath, 0o755);
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function adoptEnv() {
    return {
      PATH: shimDir + ':' + process.env.PATH,
      HOME: homeDir,
      XDG_CONFIG_HOME: join(homeDir, 'config'),
      GH_CONFIG_DIR: join(homeDir, 'gh'),
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
      HTTPS_PROXY: 'http://127.0.0.1:1',
      HTTP_PROXY: 'http://127.0.0.1:1',
      https_proxy: 'http://127.0.0.1:1',
      http_proxy: 'http://127.0.0.1:1',
      NO_PROXY: '',
      no_proxy: '',
    };
  }

  function expectLog(...lines) {
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, 'utf-8')).toBe(lines.join('\n') + '\n');
  }

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
    const result = run('adopt notaurl', tmpDir, adoptEnv());
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid beacon from vit adopt <beacon>');
  });

  test('fails if directory already exists', () => {
    mkdirSync(join(tmpDir, 'hello-world'));
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, adoptEnv());
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('already exists');
    expect(existsSync(logPath)).toBe(false);
  });

  test('rejects when run inside a coding agent', () => {
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, { ...adoptEnv(), CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('must be run by a human');
  });

  test('clones repo and shows guidance', () => {
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, adoptEnv());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('vit:github.com/octocat/hello-world');
    expect(result.stdout).toContain('hello-world');
    expect(result.stdout).toContain('start your agent');
    expectLog('gh repo fork https://github.com/octocat/hello-world --clone -- hello-world');
  });

  test('clones into custom directory name', () => {
    const result = run('adopt https://github.com/octocat/Hello-World my-copy', tmpDir, adoptEnv());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('my-copy');
    expectLog('gh repo fork https://github.com/octocat/hello-world --clone -- my-copy');
  });

  test('handles vit: prefixed beacon', () => {
    const result = run('adopt vit:github.com/octocat/Hello-World', tmpDir, adoptEnv());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('beacon: vit:github.com/octocat/hello-world');
    expectLog('gh repo fork https://github.com/octocat/hello-world --clone -- hello-world');
  });

  test('verbose flag shows step details', () => {
    const result = run('adopt -v https://github.com/octocat/Hello-World', tmpDir, adoptEnv());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[verbose]');
    expect(result.stdout).toContain('resolving beacon');
    expectLog('gh repo fork https://github.com/octocat/hello-world --clone -- hello-world');
  });

  test('second adopt to same dir fails', () => {
    const first = run('adopt https://github.com/octocat/Hello-World', tmpDir, adoptEnv());
    const result = run('adopt https://github.com/octocat/Hello-World', tmpDir, adoptEnv());
    expect(first.exitCode).toBe(0);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('already exists');
    expectLog('gh repo fork https://github.com/octocat/hello-world --clone -- hello-world');
  });

  test('clones non-GitHub repo', () => {
    const result = run('adopt https://git.example.com/octocat/hello-world', tmpDir, adoptEnv());
    expect(result.exitCode).toBe(0);
    expectLog('git clone https://git.example.com/octocat/hello-world hello-world');
  });
});
