// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit follow', () => {
  test('errors when no handle argument is provided', () => {
    const result = run('follow');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test('errors when no DID configured', () => {
    const configHome = join(tmpdir(), '.test-follow-config-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const result = run('follow someone.bsky.social', '/tmp', {
      CLAUDECODE: '',
      GEMINI_CLI: '',
      CODEX_CI: '',
      XDG_CONFIG_HOME: configHome,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no DID configured');
    rmSync(configHome, { recursive: true, force: true });
  });
});

describe('vit unfollow', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-follow-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('errors when no handle argument is provided', () => {
    const result = run('unfollow');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test('errors when handle not in following list', () => {
    writeFileSync(join(tmpDir, '.vit', 'following.json'), '[]');
    const result = run('unfollow nobody.bsky.social', tmpDir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not following');
  });

  test('removes entry from following list', () => {
    const list = [{ handle: 'alice.bsky.social', did: 'did:plc:alice', followedAt: '2026-01-01T00:00:00Z' }];
    writeFileSync(join(tmpDir, '.vit', 'following.json'), JSON.stringify(list));
    const result = run('unfollow alice.bsky.social', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('unfollowed alice.bsky.social');
  });
});

describe('vit following', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-following-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('lists entries from following.json', () => {
    const list = [
      { handle: 'alice.bsky.social', did: 'did:plc:alice', followedAt: '2026-01-01T00:00:00Z' },
      { handle: 'bob.bsky.social', did: 'did:plc:bob', followedAt: '2026-01-02T00:00:00Z' },
    ];
    writeFileSync(join(tmpDir, '.vit', 'following.json'), JSON.stringify(list));
    const result = run('following', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('alice.bsky.social');
    expect(result.stdout).toContain('bob.bsky.social');
  });

  test('shows message when no followings', () => {
    const result = run('following', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no followings');
  });
});
