// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { sandboxArgs } from '../src/lib/sandbox.js';

describe('sandboxArgs', () => {
  const prompt = 'analyze this cap';
  const systemPrompt = 'you are a security reviewer';

  describe('claude', () => {
    test('returns claude cmd with zero-tool sandbox', () => {
      const result = sandboxArgs('claude', { prompt });
      expect(result.cmd).toBe('claude');
      expect(result.args).toContain('-p');
      expect(result.args).toContain('--tools');
      expect(result.args).toContain('');
      expect(result.args).toContain('--output-format');
      expect(result.args).toContain('json');
    });

    test('unsets CLAUDECODE env to avoid nested session error', () => {
      const result = sandboxArgs('claude', { prompt });
      expect(result.env).toEqual({ CLAUDECODE: '' });
    });

    test('uses --system-prompt flag', () => {
      const result = sandboxArgs('claude', { prompt, systemPrompt });
      const idx = result.args.indexOf('--system-prompt');
      expect(idx).not.toBe(-1);
      expect(result.args[idx + 1]).toBe(systemPrompt);
    });

    test('defaults model to haiku', () => {
      const result = sandboxArgs('claude', { prompt });
      const idx = result.args.indexOf('--model');
      expect(idx).not.toBe(-1);
      expect(result.args[idx + 1]).toBe('haiku');
    });

    test('accepts custom model', () => {
      const result = sandboxArgs('claude', { prompt, model: 'sonnet' });
      const idx = result.args.indexOf('--model');
      expect(result.args[idx + 1]).toBe('sonnet');
    });

    test('prompt is last arg', () => {
      const result = sandboxArgs('claude', { prompt });
      expect(result.args[result.args.length - 1]).toBe(prompt);
    });
  });

  describe('codex', () => {
    test('returns codex cmd with read-only sandbox', () => {
      const result = sandboxArgs('codex', { prompt });
      expect(result.cmd).toBe('codex');
      expect(result.args[0]).toBe('exec');
      expect(result.args).toContain('-s');
      expect(result.args).toContain('read-only');
    });

    test('has empty env', () => {
      const result = sandboxArgs('codex', { prompt });
      expect(result.env).toEqual({});
    });

    test('prepends system prompt to prompt (no separate flag)', () => {
      const result = sandboxArgs('codex', { prompt, systemPrompt });
      const combined = result.args[result.args.length - 1];
      expect(combined).toBe(`${systemPrompt}\n\n${prompt}`);
    });

    test('uses prompt alone when no system prompt', () => {
      const result = sandboxArgs('codex', { prompt });
      expect(result.args[result.args.length - 1]).toBe(prompt);
    });

    test('omits model flag when not specified', () => {
      const result = sandboxArgs('codex', { prompt });
      expect(result.args).not.toContain('-m');
    });

    test('includes model flag when specified', () => {
      const result = sandboxArgs('codex', { prompt, model: 'o3' });
      const idx = result.args.indexOf('-m');
      expect(idx).not.toBe(-1);
      expect(result.args[idx + 1]).toBe('o3');
    });
  });

  describe('gemini', () => {
    test('returns gemini cmd with sandbox and no extensions', () => {
      const result = sandboxArgs('gemini', { prompt });
      expect(result.cmd).toBe('gemini');
      expect(result.args).toContain('-s');
      expect(result.args).toContain('-e');
      expect(result.args).toContain('none');
      expect(result.args).toContain('--output-format');
      expect(result.args).toContain('json');
    });

    test('uses -p flag for non-interactive mode', () => {
      const result = sandboxArgs('gemini', { prompt });
      expect(result.args[0]).toBe('-p');
    });

    test('has empty env', () => {
      const result = sandboxArgs('gemini', { prompt });
      expect(result.env).toEqual({});
    });

    test('prepends system prompt to prompt (no separate flag)', () => {
      const result = sandboxArgs('gemini', { prompt, systemPrompt });
      expect(result.args[1]).toBe(`${systemPrompt}\n\n${prompt}`);
    });

    test('omits model flag when not specified', () => {
      const result = sandboxArgs('gemini', { prompt });
      expect(result.args).not.toContain('-m');
    });

    test('includes model flag when specified', () => {
      const result = sandboxArgs('gemini', { prompt, model: 'gemini-2.5-pro' });
      const idx = result.args.indexOf('-m');
      expect(idx).not.toBe(-1);
      expect(result.args[idx + 1]).toBe('gemini-2.5-pro');
    });
  });

  describe('errors', () => {
    test('throws on unknown agent', () => {
      expect(() => sandboxArgs('grok', { prompt })).toThrow('Unknown agent: grok');
    });

    test('throws when prompt is missing', () => {
      expect(() => sandboxArgs('claude', {})).toThrow('prompt is required');
    });

    test('throws when opts is empty', () => {
      expect(() => sandboxArgs('claude')).toThrow('prompt is required');
    });
  });
});
