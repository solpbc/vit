// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit ship', () => {
  test('fails when --title is missing', () => {
    const r = run('ship "hello" --description "desc" --ref "one-two-three"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--title/i);
  });

  test('fails when --description is missing', () => {
    const r = run('ship "hello" --title "Hi" --ref "one-two-three"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--description/i);
  });

  test('fails when --ref is missing', () => {
    const r = run('ship "hello" --title "Hi" --description "desc"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/--ref/i);
  });

  test('rejects ref with uppercase letters', () => {
    const r = run('ship "hello" --title "Hi" --description "desc" --ref "Bad-Ref-Here"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('rejects ref with wrong segment count', () => {
    const r = run('ship "hello" --title "Hi" --description "desc" --ref "only-two"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('rejects ref with digits', () => {
    const r = run('ship "hello" --title "Hi" --description "desc" --ref "has-num-3bers"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/three lowercase words/i);
  });

  test('accepts valid ref format (fails at auth, not validation)', () => {
    const r = run('ship "hello" --title "Hi" --description "desc" --ref "one-two-three" --did "did:plc:abc"');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).not.toMatch(/three lowercase words/i);
  });
});
