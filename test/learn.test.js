// SPDX-License-Identifier: AGPL-3.0-only
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

  test('requires vet for project-level install without skip-perms', () => {
    const tmp = join(tmpdir(), '.test-learn-proj-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('not yet vetted');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('errors when no DID configured (with skip-perms for project-level)', () => {
    // Use skip-perms to bypass vet, then hit DID check
    const configHome = join(tmpdir(), '.test-learn-config-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const r = run('learn skill-test', '/tmp', { ...agentEnv, XDG_CONFIG_HOME: configHome, CLAUDE_SKIP_PERMISSIONS: '1' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('no DID configured');
    rmSync(configHome, { recursive: true, force: true });
  });

  test('trust gate: vet check happens before network call', () => {
    // Even with a valid DID, should fail at vet check
    const tmp = join(tmpdir(), '.test-learn-trust-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --did did:plc:test123', tmp, agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('not yet vetted');
    expect(r.stderr).toContain('vit vet skill-test');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('trust gate: skip-perms bypasses vet for project-level', () => {
    // With skip-perms, should pass vet and fail at auth
    const tmp = join(tmpdir(), '.test-learn-skip-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --did did:plc:test123', tmp, { ...agentEnv, CLAUDE_SKIP_PERMISSIONS: '1' });
    expect(r.exitCode).not.toBe(0);
    // Should NOT fail at vet check
    expect(r.stderr).not.toContain('not yet vetted');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('trust gate: skip-perms does NOT bypass vet for --user', () => {
    const tmp = join(tmpdir(), '.test-learn-skip-user-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
    const r = run('learn skill-test --user --did did:plc:test123', tmp, { ...agentEnv, CLAUDE_SKIP_PERMISSIONS: '1' });
    expect(r.exitCode).not.toBe(0);
    // Should STILL fail at vet check for --user
    expect(r.stderr).toContain('not yet vetted');
    expect(r.stderr).toContain('user-wide install requires vetting');
    rmSync(tmp, { recursive: true, force: true });
  });
});
