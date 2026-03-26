// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit vouch (skill refs)', () => {
  test('accepts skill ref format', () => {
    // Should not fail on ref format validation
    const result = run('vouch skill-agent-test --did did:plc:test123', '/tmp');
    expect(result.exitCode).not.toBe(0);
    // Should fail at trusted check, not ref validation
    expect(result.stderr).not.toContain('invalid');
    expect(result.stderr).toContain('not yet vetted');
  });

  test('rejects invalid skill ref', () => {
    const result = run('vouch skill-Bad-Name --did did:plc:test123', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid skill ref');
  });

  test('does NOT require beacon for skill vouches', () => {
    // Skill vouch should check trusted, not beacon
    const result = run('vouch skill-test --did did:plc:test123', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain('no beacon set');
    expect(result.stderr).toContain('not yet vetted');
  });

  test('still requires beacon for cap vouches', () => {
    const result = run('vouch fast-cache-invalidation --did did:plc:test123', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no beacon set');
  });
});
