// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { detectCodingAgent, requireAgent, requireNotAgent } from '../src/lib/agent.js';

describe('agent', () => {
  let originalClaudeCode;
  let originalGeminiCli;
  let originalCodexCi;

  beforeEach(() => {
    originalClaudeCode = process.env.CLAUDECODE;
    originalGeminiCli = process.env.GEMINI_CLI;
    originalCodexCi = process.env.CODEX_CI;
    delete process.env.CLAUDECODE;
    delete process.env.GEMINI_CLI;
    delete process.env.CODEX_CI;
  });

  afterEach(() => {
    if (originalClaudeCode === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = originalClaudeCode;

    if (originalGeminiCli === undefined) delete process.env.GEMINI_CLI;
    else process.env.GEMINI_CLI = originalGeminiCli;

    if (originalCodexCi === undefined) delete process.env.CODEX_CI;
    else process.env.CODEX_CI = originalCodexCi;
  });

  describe('detectCodingAgent', () => {
    test('returns null when no agent env vars are set', () => {
      expect(detectCodingAgent()).toBe(null);
    });

    test('returns claude code when CLAUDECODE=1', () => {
      process.env.CLAUDECODE = '1';
      expect(detectCodingAgent()).toEqual({ name: 'claude code', envVar: 'CLAUDECODE' });
    });

    test('returns gemini cli when GEMINI_CLI=1', () => {
      process.env.GEMINI_CLI = '1';
      expect(detectCodingAgent()).toEqual({ name: 'gemini cli', envVar: 'GEMINI_CLI' });
    });

    test('returns codex when CODEX_CI=1', () => {
      process.env.CODEX_CI = '1';
      expect(detectCodingAgent()).toEqual({ name: 'codex', envVar: 'CODEX_CI' });
    });

    test('returns null when env var is 0', () => {
      process.env.CLAUDECODE = '0';
      expect(detectCodingAgent()).toBe(null);
    });

    test('returns null when env var is empty', () => {
      process.env.CLAUDECODE = '';
      expect(detectCodingAgent()).toBe(null);
    });
  });

  describe('requireAgent', () => {
    test('returns ok true when agent detected', () => {
      process.env.CLAUDECODE = '1';
      expect(requireAgent()).toEqual({ ok: true, name: 'claude code', envVar: 'CLAUDECODE' });
    });

    test('returns ok false when no agent detected', () => {
      expect(requireAgent()).toEqual({ ok: false });
    });
  });

  describe('requireNotAgent', () => {
    test('returns ok true when no agent detected', () => {
      expect(requireNotAgent()).toEqual({ ok: true });
    });

    test('returns ok false when agent detected', () => {
      process.env.CLAUDECODE = '1';
      expect(requireNotAgent()).toEqual({ ok: false, name: 'claude code', envVar: 'CLAUDECODE' });
    });
  });
});
