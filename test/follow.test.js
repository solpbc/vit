// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit follow', () => {
  test('errors when no handle argument is provided', () => {
    const result = run('follow');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test('errors when DID is invalid', () => {
    const result = run('follow someone.bsky.social --did did:plc:abc');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });
});

describe('vit unfollow', () => {
  test('errors when no handle argument is provided', () => {
    const result = run('unfollow');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test('errors when DID is invalid', () => {
    const result = run('unfollow someone.bsky.social --did did:plc:abc');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });
});

describe('vit following', () => {
  test('errors when DID is invalid', () => {
    const result = run('following --did did:plc:abc');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });
});
