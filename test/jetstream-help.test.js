// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { run } from './helpers.js';

describe('jetstream help', () => {
  test('firehose help shows --jetstream', () => {
    const result = run('firehose --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--jetstream <url>');
  });

  test('scan help shows --jetstream', () => {
    const result = run('scan --help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--jetstream <url>');
  });
});
