// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

describe('vit ship', () => {
  test('rejects when run outside a coding agent', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three"', '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' }, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('should be run by a coding agent');
  });

  test('fails when --title is missing', () => {
    const r = run('ship --description "desc" --ref "one-two-three"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--title/i);
  });

  test('fails when --description is missing', () => {
    const r = run('ship --title "Hi" --ref "one-two-three"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--description/i);
  });

  test('fails when --ref is missing', () => {
    const r = run('ship --title "Hi" --description "desc"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--ref/i);
  });

  test('fails when stdin body is empty', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three" --did "did:plc:abc"', undefined, agentEnv, '');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/body is required/i);
  });

  test('rejects ref with uppercase letters', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "Bad-Ref-Here" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('rejects ref with wrong segment count', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "only-two" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('rejects ref with digits', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "has-num-3bers" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('rejects --recap with invalid ref format', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three" --recap "BAD" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--recap must be exactly three lowercase words/i);
  });

  test('rejects --kind with invalid value', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three" --kind "invalid" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--kind must be one of/i);
  });

  test('--help shows --kind and --recap', () => {
    const r = run('ship --help');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('--kind <kind>');
    expect(r.stdout).toContain('--recap <ref>');
  });

  test('accepts valid ref format (fails at auth, not validation)', () => {
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three" --did "did:plc:abc"', undefined, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).not.toMatch(/three lowercase words/i);
    expect(r.stderr).not.toMatch(/body is required/i);
  });

  test('errors when no beacon set', () => {
    const tmp = join(tmpdir(), '.test-ship-beacon-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run('ship --title "Hi" --description "desc" --ref "one-two-three" --did "did:plc:abc"', tmp, agentEnv, 'body text');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('no beacon set');
    rmSync(tmp, { recursive: true, force: true });
  });
});
