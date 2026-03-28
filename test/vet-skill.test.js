// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit vet (skill refs)', () => {
  test('accepts skill ref format', () => {
    // Should not fail on ref format validation
    const result = run('vet skill-agent-test', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    // Should fail at DID, not ref validation
    expect(result.stderr).not.toContain('invalid');
  });

  test('rejects when run inside a coding agent (skill ref)', () => {
    const result = run('vet skill-agent-test', undefined, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('vit vet is for operator review');
    expect(result.stderr).toContain('vit vet skill-agent-test');
    expect(result.stderr).toContain('--trust --confirm');
  });

  test('rejects invalid skill ref', () => {
    const result = run('vet skill-Bad-Name', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid skill ref');
  });

  test('does NOT require beacon for skill vet', () => {
    // Skill vet should not need a beacon
    const result = run('vet skill-test --did did:plc:test123', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain('no beacon set');
  });
});
