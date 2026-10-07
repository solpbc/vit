// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { detectCodingAgent, requireAgent, requireNotAgent } from '../src/lib/agent.js';

describe('agent', () => {
  const agentEnvVars = ['CLAUDECODE', 'GEMINI_CLI', 'CODEX_CI', 'OPENCODE', 'AI_AGENT', 'PI_CODING_AGENT'];
  let originalEnv;

  beforeEach(() => {
    originalEnv = Object.fromEntries(agentEnvVars.map(key => [key, process.env[key]]));
    for (const key of agentEnvVars) delete process.env[key];
  });

  afterEach(() => {
    for (const key of agentEnvVars) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
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

    test('returns opencode when OPENCODE=1', () => {
      process.env.OPENCODE = '1';
      expect(detectCodingAgent()).toEqual({ name: 'opencode', envVar: 'OPENCODE' });
    });

    test('returns null when env var is 0', () => {
      process.env.CLAUDECODE = '0';
      expect(detectCodingAgent()).toBe(null);
    });

    test('returns null when env var is empty', () => {
      process.env.CLAUDECODE = '';
      expect(detectCodingAgent()).toBe(null);
    });

    test('returns null when OPENCODE is not 1', () => {
      process.env.OPENCODE = 'true';
      expect(detectCodingAgent()).toBe(null);
    });
  });

  describe('Pi markers', () => {
    for (const [envVar, value] of [['AI_AGENT', 'pi'], ['PI_CODING_AGENT', 'true']]) {
      test(`${envVar}=${value} permits agent work and refuses human-only work`, () => {
        process.env[envVar] = value;
        expect(detectCodingAgent()).toEqual({ name: 'pi', envVar });
        expect(requireAgent()).toEqual({ ok: true, name: 'pi', envVar });
        expect(requireNotAgent()).toEqual({ ok: false, name: 'pi', envVar });
      });
    }

    test('recognises both Pi markers together', () => {
      process.env.AI_AGENT = 'pi';
      process.env.PI_CODING_AGENT = 'true';
      expect(detectCodingAgent()).toEqual({ name: 'pi', envVar: 'AI_AGENT' });
    });

    for (const [envVar, values] of [
      ['AI_AGENT', ['', 'other-agent', 'Pi', 'true', '1']],
      ['PI_CODING_AGENT', ['', 'false', '0', '1', 'TRUE']],
    ]) {
      for (const value of values) {
        test(`does not recognise ${envVar}=${JSON.stringify(value)}`, () => {
          process.env[envVar] = value;
          expect(detectCodingAgent()).toBe(null);
        });
      }
    }

    test('preserves existing agent precedence in inherited Pi environments', () => {
      process.env.CODEX_CI = '1';
      process.env.AI_AGENT = 'pi';
      process.env.PI_CODING_AGENT = 'true';
      expect(detectCodingAgent()).toEqual({ name: 'codex', envVar: 'CODEX_CI' });
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
