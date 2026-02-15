// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit vouch', () => {
  test('shows help with <ref> argument', () => {
    const result = run('vouch --help');
    expect(result.stdout).toContain('<ref>');
  });

  test('fails with no arguments', () => {
    const result = run('vouch', '/tmp');
    expect(result.exitCode).not.toBe(0);
  });

  test('rejects invalid ref format', () => {
    const result = run('vouch not-valid', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid ref');
  });

  test('errors when no DID configured', () => {
    const configHome = join(tmpdir(), '.test-vouch-config-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const result = run('vouch fast-cache-invalidation', '/tmp', { XDG_CONFIG_HOME: configHome });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no DID configured');
    rmSync(configHome, { recursive: true, force: true });
  });

  test('errors when no beacon is set', () => {
    const result = run('vouch fast-cache-invalidation --did did:plc:test123', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });

  test('works from both agent and non-agent contexts', () => {
    const inAgent = run('vouch fast-cache-invalidation --did did:plc:test123', '/tmp', { CLAUDECODE: '1' });
    expect(inAgent.stderr).not.toContain('must be run by a human');
    expect(inAgent.stderr).not.toContain('should be run by a coding agent');

    const notAgent = run('vouch fast-cache-invalidation --did did:plc:test123', '/tmp', {
      CLAUDECODE: '',
      GEMINI_CLI: '',
      CODEX_CI: '',
    });
    expect(notAgent.stderr).not.toContain('must be run by a human');
    expect(notAgent.stderr).not.toContain('should be run by a coding agent');
  });
});
