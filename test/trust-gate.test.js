// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('trust-gate', () => {
  let tmp;

  beforeEach(() => {
    tmp = join(tmpdir(), '.test-trust-gate-' + Math.random().toString(36).slice(2));
    mkdirSync(join(tmp, '.vit'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // Fresh import each test to avoid cached module state
  async function loadModule() {
    // Dynamic import with cache-busting
    const mod = await import('../src/lib/trust-gate.js');
    return mod;
  }

  describe('checkDangerousAccept', () => {
    test('returns accepted false when no file exists', async () => {
      const { checkDangerousAccept } = await loadModule();
      expect(checkDangerousAccept(tmp)).toEqual({ accepted: false });
    });

    test('returns accepted true when file exists with valid JSON', async () => {
      const { checkDangerousAccept } = await loadModule();
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2026-03-26T14:30:00.000Z' }));
      expect(checkDangerousAccept(tmp)).toEqual({ accepted: true });
    });

    test('returns accepted false when file is malformed JSON', async () => {
      const { checkDangerousAccept } = await loadModule();
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), 'not json');
      expect(checkDangerousAccept(tmp)).toEqual({ accepted: false });
    });

    test('no TTL — old timestamps still accepted', async () => {
      const { checkDangerousAccept } = await loadModule();
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2020-01-01T00:00:00.000Z' }));
      expect(checkDangerousAccept(tmp)).toEqual({ accepted: true });
    });
  });

  describe('shouldBypassVet', () => {
    test('returns bypass true with reason when flag active', async () => {
      const { shouldBypassVet } = await loadModule();
      writeFileSync(join(tmp, '.vit', 'dangerous-accept'), JSON.stringify({ acceptedAt: '2026-03-26T14:30:00.000Z' }));
      expect(shouldBypassVet(tmp)).toEqual({ bypass: true, reason: 'dangerous-accept' });
    });

    test('returns bypass false when flag absent', async () => {
      const { shouldBypassVet } = await loadModule();
      expect(shouldBypassVet(tmp)).toEqual({ bypass: false });
    });
  });
});
