// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsonError } from '../src/lib/json-output.js';

const agentEnv = { CLAUDECODE: '1' };

function parseJson(stdout) {
  return JSON.parse(stdout);
}

function captureJsonError(input, hintArg) {
  const lines = [];
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  console.log = (line) => lines.push(line);
  process.exitCode = 0;

  try {
    jsonError(input, hintArg);
    return {
      exitCode: process.exitCode,
      parsed: JSON.parse(lines.join('')),
    };
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
}

describe('--json flag', () => {
  let tmpDir;
  let tmpHome;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-json-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmpDir, '.vit'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function doctorEnv() {
    tmpHome = join(tmpdir(), '.test-json-doctor-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    return { HOME: tmpHome, XDG_CONFIG_HOME: join(tmpHome, '.config') };
  }

  describe('init --json', () => {
    test('reports status as JSON when not initialized', () => {
      const r = run('init --json', tmpDir, agentEnv);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.status).toBe('no beacon');
    });

    test('reports beacon as JSON when set', () => {
      run('init --beacon https://github.com/solpbc/vit.git', tmpDir, agentEnv);
      const r = run('init --json', tmpDir, agentEnv);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.beacon).toContain('github.com/solpbc/vit');
    });

    test('creates beacon and returns JSON', () => {
      const r = run('init --json --beacon https://github.com/solpbc/vit.git', tmpDir, agentEnv);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.beacon).toContain('github.com/solpbc/vit');
    });

    test('rejects non-agent with JSON error', () => {
      const r = run('init --json --beacon https://github.com/solpbc/vit.git', tmpDir, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
      expect(r.exitCode).toBe(1);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('agent required');
    });
  });

  describe('doctor --json', () => {
    test('returns health report as JSON', () => {
      const r = run('doctor --json', undefined, doctorEnv());
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j).toHaveProperty('install');
      expect(j).toHaveProperty('beacon');
      expect(j).toHaveProperty('bluesky');
    });

    test('status --json also works', () => {
      const r = run('status --json', undefined, doctorEnv());
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
    });
  });

  describe('following --json', () => {
    test('returns empty list as JSON', () => {
      const r = run('following --json', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.following).toEqual([]);
    });

    test('returns list as JSON', () => {
      const list = [
        { handle: 'alice.bsky.social', did: 'did:plc:alice', followedAt: '2026-01-01T00:00:00Z' },
      ];
      writeFileSync(join(tmpDir, '.vit', 'following.json'), JSON.stringify(list));
      const r = run('following --json', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.following).toHaveLength(1);
      expect(j.following[0].handle).toBe('alice.bsky.social');
    });
  });

  describe('unfollow --json', () => {
    test('returns error when not following', () => {
      writeFileSync(join(tmpDir, '.vit', 'following.json'), '[]');
      const r = run('unfollow nobody.bsky.social --json', tmpDir);
      expect(r.exitCode).toBe(1);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('not following');
    });

    test('returns success JSON on unfollow', () => {
      const list = [{ handle: 'alice.bsky.social', did: 'did:plc:alice', followedAt: '2026-01-01T00:00:00Z' }];
      writeFileSync(join(tmpDir, '.vit', 'following.json'), JSON.stringify(list));
      const r = run('unfollow alice.bsky.social --json', tmpDir);
      expect(r.exitCode).toBe(0);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(true);
      expect(j.handle).toBe('alice.bsky.social');
    });
  });

  describe('follow --json', () => {
    test('returns error when no DID configured', () => {
      const configHome = join(tmpdir(), '.test-json-follow-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const r = run('follow someone.bsky.social --json', tmpDir, {
        CLAUDECODE: '',
        GEMINI_CLI: '',
        CODEX_CI: '',
        XDG_CONFIG_HOME: configHome,
      });
      expect(r.exitCode).toBe(1);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('no DID configured');
      rmSync(configHome, { recursive: true, force: true });
    });
  });

  describe('ship --json', () => {
    test('missing --title returns JSON error', () => {
      const r = run('ship --json --description "desc" --ref "one-two-three"');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('--title');
    });

    test('missing --description returns JSON error', () => {
      const r = run('ship --json --title "Hi" --ref "one-two-three"');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('--description');
    });

    test('missing --ref returns JSON error', () => {
      const r = run('ship --json --title "Hi" --description "desc"');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('--ref');
    });

    test('non-agent returns JSON error', () => {
      const r = run('ship --json --title "Hi" --description "desc" --ref "one-two-three"', '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' }, 'body');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('agent required');
    });

    test('empty body returns JSON error', () => {
      const r = run('ship --json --title "Hi" --description "desc" --ref "one-two-three" --did "did:plc:abc"', undefined, agentEnv, '');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('body is required');
    });

    test('invalid ref returns JSON error', () => {
      const r = run('ship --json --title "Hi" --description "desc" --ref "Bad-Ref" --did "did:plc:abc"', undefined, agentEnv, 'body');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('three lowercase words');
    });

    test('invalid kind returns JSON error', () => {
      const r = run('ship --json --title "Hi" --description "desc" --ref "one-two-three" --kind "invalid" --did "did:plc:abc"', undefined, agentEnv, 'body');
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('--kind');
    });
  });

  describe('vet --json', () => {
    test('missing ref returns JSON error', () => {
      const r = run('vet --json', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('ref argument is required');
    });

    test('invalid ref returns JSON error', () => {
      const r = run('vet BADREF --json', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('invalid ref');
    });
  });

  describe('vouch --json', () => {
    test('invalid ref returns JSON error', () => {
      const r = run('vouch BADREF --json', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('invalid ref');
    });
  });

  describe('remix --json', () => {
    test('invalid ref returns JSON error', () => {
      const r = run('remix BADREF --json', tmpDir, agentEnv);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('invalid ref');
    });

    test('non-agent returns JSON error', () => {
      const r = run('remix one-two-three --json', tmpDir, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('agent required');
    });
  });

  describe('learn --json', () => {
    test('invalid ref returns JSON error', () => {
      const r = run('learn badref --json', tmpDir, agentEnv);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('invalid skill ref');
    });

    test('non-agent returns JSON error', () => {
      const r = run('learn skill-test --json', tmpDir, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('agent required');
    });
  });

  describe('scan --json', () => {
    test('invalid --days returns JSON error', () => {
      const r = run('scan --json --days 0', tmpDir);
      const j = parseJson(r.stdout);
      expect(j.ok).toBe(false);
      expect(j.error).toContain('--days must be a positive integer');
    });
  });

  describe('jsonError throwable input', () => {
    test('includes a causes array for nested causes', () => {
      const root = new Error('top level');
      const leaf = new Error('leaf');
      root.cause = leaf;

      const { parsed, exitCode } = captureJsonError(root);
      expect(exitCode).toBe(1);
      expect(parsed).toEqual({
        ok: false,
        error: 'top level',
        causes: ['leaf'],
      });
    });

    test('omits causes for flat errors', () => {
      class XRPCError extends Error {}
      const err = new XRPCError('Invalid identifier or password');

      const { parsed, exitCode } = captureJsonError(err);
      expect(exitCode).toBe(1);
      expect(parsed).toEqual({
        ok: false,
        error: 'Invalid identifier or password',
      });
      expect(parsed).not.toHaveProperty('causes');
    });
  });
});
