// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit skim', () => {
  test('errors when DID is invalid', () => {
    const result = run('skim --did did:plc:abc');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test('errors when no beacon is set', () => {
    const result = run('skim', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });
});
