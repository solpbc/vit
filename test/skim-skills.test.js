// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

describe('vit skim --skills', () => {
  test('still requires beacon in default mode', () => {
    const result = run('skim --did did:plc:test123', '/tmp', agentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });

  test('still requires beacon with --caps flag', () => {
    const result = run('skim --caps --did did:plc:test123', '/tmp', agentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });

  test('does NOT require beacon with --skills flag', () => {
    const configHome = join(tmpdir(), '.test-skim-skills-' + Math.random().toString(36).slice(2));
    mkdirSync(configHome, { recursive: true });
    const result = run('skim --skills --did did:plc:test123', '/tmp', { ...agentEnv, XDG_CONFIG_HOME: configHome });
    expect(result.exitCode).not.toBe(0);
    // Should fail at auth, not at beacon check
    expect(result.stderr).not.toContain('no beacon set');
    rmSync(configHome, { recursive: true, force: true });
  });

  test('shows help mentioning --skills and --caps', () => {
    const result = run('skim --help');
    expect(result.stdout).toContain('--skills');
    expect(result.stdout).toContain('--caps');
  });
});
