// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

describe('vit remix', () => {
  test('rejects when run outside a coding agent', () => {
    const result = run('remix fast-cache-invalidation', '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('should be run by a coding agent');
  });

  test('fails with no arguments', () => {
    const result = run('remix', '/tmp', agentEnv);
    expect(result.exitCode).not.toBe(0);
  });

  test('rejects invalid ref format', () => {
    const result = run('remix not-valid', '/tmp', agentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid ref');
  });

  test('errors when no DID configured', () => {
    const configHome = join(tmpdir(), '.test-remix-config-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const result = run('remix fast-cache-invalidation', '/tmp', { ...agentEnv, XDG_CONFIG_HOME: configHome });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no DID configured');
    rmSync(configHome, { recursive: true, force: true });
  });

  test('errors when no beacon is set', () => {
    const result = run('remix fast-cache-invalidation --did did:plc:test123', '/tmp', agentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });

  // --- trust gate tests ---

  describe('trust gate', () => {
    test('untrusted ref without dangerous-accept: error includes hint', () => {
      const tmp = join(tmpdir(), '.test-remix-trust-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      writeFileSync(join(tmp, '.vit', 'config.json'), JSON.stringify({ beacon: 'vit:github.com/test/test' }));
      const result = run('remix fast-cache-invalidation --did did:plc:test123', tmp, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not trusted');
      expect(result.stderr).toContain('vit vet --dangerous-accept --confirm');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('untrusted ref with active dangerous-accept: bypasses trust gate', () => {
      const tmp = join(tmpdir(), '.test-remix-bypass-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      writeFileSync(join(tmp, '.vit', 'config.json'), JSON.stringify({ beacon: 'vit:github.com/test/test' }));
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2026-03-26T14:30:00.000Z' }));
      const result = run('remix fast-cache-invalidation --did did:plc:test123', tmp, agentEnv);
      // Should bypass trust check — will fail later at auth/network, NOT at trust
      expect(result.stderr).not.toContain('not trusted');
      rmSync(tmp, { recursive: true, force: true });
    });
  });
});
