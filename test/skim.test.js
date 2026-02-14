// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit skim', () => {
  test('rejects when run outside a coding agent', () => {
    const result = run('skim', '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('should be run by a coding agent');
  });

  test('errors when no DID configured', () => {
    const configHome = join(tmpdir(), '.test-skim-config-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const result = run('skim', '/tmp', { CLAUDECODE: '1', XDG_CONFIG_HOME: configHome });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no DID configured');
    rmSync(configHome, { recursive: true, force: true });
  });

  test('errors when no beacon is set', () => {
    const result = run('skim --did did:plc:test123', '/tmp', { CLAUDECODE: '1' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });
});
