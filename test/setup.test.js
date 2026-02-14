// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit setup', () => {
  test('rejects when run inside a coding agent', () => {
    const result = run('setup', undefined, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('cannot run inside claude code');
  });
});
