// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { collectCauses, formatError } from '../src/lib/error-format.js';

describe('error-format', () => {
  test('formats a flat Error', () => {
    const err = new Error('top level');

    expect(collectCauses(err)).toEqual([]);
    expect(formatError(err)).toBe('top level');
  });

  test('formats nested causes', () => {
    const root = new Error('top level');
    const middle = new Error('middle');
    const leaf = new Error('leaf');
    root.cause = middle;
    middle.cause = leaf;

    expect(collectCauses(root)).toEqual(['middle', 'leaf']);
    expect(formatError(root)).toBe([
      'top level',
      '  caused by: middle',
      '  caused by: leaf',
    ].join('\n'));
  });

  test('formats a non-Error throwable as a flat value', () => {
    expect(collectCauses('boom')).toEqual([]);
    expect(formatError('boom')).toBe('boom');
  });

  test('formats a non-Error cause', () => {
    const err = new Error('top level');
    err.cause = 'socket closed';

    expect(collectCauses(err)).toEqual(['socket closed']);
    expect(formatError(err)).toBe([
      'top level',
      '  caused by: socket closed',
    ].join('\n'));
  });

  test('stops on circular causes', () => {
    const root = new Error('top level');
    const middle = new Error('middle');
    root.cause = middle;
    middle.cause = root;

    expect(collectCauses(root)).toEqual(['middle']);
    expect(formatError(root)).toBe([
      'top level',
      '  caused by: middle',
    ].join('\n'));
  });

  test('caps the cause list at 10 levels', () => {
    const root = new Error('root');
    let current = root;
    for (let i = 1; i <= 12; i += 1) {
      const next = new Error(`cause ${i}`);
      current.cause = next;
      current = next;
    }

    expect(collectCauses(root)).toHaveLength(10);
    expect(collectCauses(root)[0]).toBe('cause 1');
    expect(collectCauses(root)[9]).toBe('cause 10');
  });

  test('includes indented stack traces in verbose mode', () => {
    const root = new Error('top level');
    const leaf = new Error('leaf');
    root.stack = 'Error: top level\nat top';
    leaf.stack = 'Error: leaf\nat leaf';
    root.cause = leaf;

    expect(formatError(root, { verbose: true })).toBe([
      'top level',
      '    Error: top level',
      '    at top',
      '  caused by: leaf',
      '    Error: leaf',
      '    at leaf',
    ].join('\n'));
  });
});
