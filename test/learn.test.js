// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

describe('vit learn', () => {
  test('rejects when run outside a coding agent', () => {
    const r = run('learn skill-test', '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('should be run by a coding agent');
  });

  test('rejects non-skill ref format', () => {
    const r = run('learn fast-cache-invalidation', '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('invalid skill ref');
  });

  test('rejects invalid skill name in ref', () => {
    const r = run('learn skill-Bad-Name', '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('invalid skill ref');
  });

  test('rejects skill ref with consecutive hyphens', () => {
    const r = run('learn skill-bad--name', '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('invalid skill ref');
  });

  test('fails when no arguments provided', () => {
    const r = run('learn', '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
  });

  test('requires vet for --user install', () => {
    const tmp = join(tmpdir(), '.test-learn-user-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --user --did did:plc:test123', tmp, agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('not yet vetted');
    expect(r.stderr).toContain('user-wide install requires vetting');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('requires vet for project-level install without dangerous-accept', () => {
    const tmp = join(tmpdir(), '.test-learn-proj-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('not yet vetted');
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- trust gate tests ---

  describe('trust gate', () => {
    test('CLAUDE_SKIP_PERMISSIONS env var no longer bypasses vet', () => {
      const tmp = join(tmpdir(), '.test-learn-noskip-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const r = run('learn skill-test --did did:plc:test123', tmp, { ...agentEnv, CLAUDE_SKIP_PERMISSIONS: '1' });
      expect(r.exitCode).not.toBe(0);
      // Should STILL fail at vet check — env var no longer works
      expect(r.stderr).toContain('not yet vetted');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('dangerous-accept bypasses vet for project-level install', () => {
      const tmp = join(tmpdir(), '.test-learn-da-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2026-03-26T14:30:00.000Z' }));
      const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
      // Should bypass vet check — will fail later at auth, NOT at vet
      expect(r.stderr).not.toContain('not yet vetted');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('dangerous-accept does NOT bypass vet for --user install', () => {
      const tmp = join(tmpdir(), '.test-learn-da-user-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2026-03-26T14:30:00.000Z' }));
      const r = run('learn skill-test --user --did did:plc:test123', tmp, agentEnv);
      expect(r.exitCode).not.toBe(0);
      // Should STILL fail at vet check for --user
      expect(r.stderr).toContain('not yet vetted');
      expect(r.stderr).toContain('user-wide install requires vetting');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('error includes dangerous-accept hint when agent detected', () => {
      const tmp = join(tmpdir(), '.test-learn-hint-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('vit vet --dangerous-accept --confirm');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('vet check happens before network call', () => {
      const tmp = join(tmpdir(), '.test-learn-trust-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('not yet vetted');
      expect(r.stderr).toContain('vit vet skill-test');
      rmSync(tmp, { recursive: true, force: true });
    });
  });
});
