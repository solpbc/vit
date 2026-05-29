// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

function runPostinstall(home) {
  try {
    return {
      stdout: execSync('node src/postinstall.js', {
        cwd: repoRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
      }),
      exitCode: 0,
    };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

describe('postinstall', () => {
  let cleanupPaths = [];

  afterEach(() => {
    for (const path of cleanupPaths) {
      rmSync(path, { recursive: true, force: true });
    }
    cleanupPaths = [];
  });

  test('exits zero and stays quiet when install fails', () => {
    const homeFile = join(tmpdir(), '.test-postinstall-home-' + Math.random().toString(36).slice(2));
    writeFileSync(homeFile, 'not a directory\n');
    cleanupPaths.push(homeFile);

    const result = runPostinstall(homeFile);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('installed');
  });

  test('installs using-vit skill from a writable home', () => {
    const home = join(tmpdir(), '.test-postinstall-home-' + Math.random().toString(36).slice(2));
    mkdirSync(home, { recursive: true });
    cleanupPaths.push(home);

    const result = runPostinstall(home);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('vit: using-vit skill installed');
    expect(existsSync(join(home, '.claude', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
  });
});
