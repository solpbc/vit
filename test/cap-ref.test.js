// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { hashTo3Words, resolveRef, REF_PATTERN } from '../src/lib/cap-ref.js';

describe('hashTo3Words', () => {
  test('returns consistent output for same input', () => {
    const a = hashTo3Words('bafyreib1234567890abcdef');
    const b = hashTo3Words('bafyreib1234567890abcdef');
    expect(a).toBe(b);
  });

  test('output matches REF_PATTERN', () => {
    const ref = hashTo3Words('bafyreib1234567890abcdef');
    expect(REF_PATTERN.test(ref)).toBe(true);
  });

  test('different inputs produce different outputs', () => {
    const a = hashTo3Words('cid-one');
    const b = hashTo3Words('cid-two');
    expect(a).not.toBe(b);
  });

  test('uses full 11 bits for first word index', () => {
    expect(hashTo3Words('probe-0')).toBe('risk-furnace-affair');
  });
});

describe('resolveRef', () => {
  test('returns record.ref when valid', () => {
    const ref = resolveRef({ ref: 'fast-cache-invalidation' }, 'some-cid');
    expect(ref).toBe('fast-cache-invalidation');
  });

  test('returns derived ref when record.ref is missing', () => {
    const ref = resolveRef({}, 'some-cid');
    expect(REF_PATTERN.test(ref)).toBe(true);
    expect(ref).toBe(hashTo3Words('some-cid'));
  });

  test('returns derived ref when record.ref is empty string', () => {
    const ref = resolveRef({ ref: '' }, 'some-cid');
    expect(REF_PATTERN.test(ref)).toBe(true);
  });

  test('returns derived ref when record.ref is malformed', () => {
    const ref = resolveRef({ ref: 'Bad-Format' }, 'some-cid');
    expect(REF_PATTERN.test(ref)).toBe(true);
    expect(ref).toBe(hashTo3Words('some-cid'));
  });

  test('returns derived ref when record is null', () => {
    const ref = resolveRef(null, 'some-cid');
    expect(REF_PATTERN.test(ref)).toBe(true);
  });
});
