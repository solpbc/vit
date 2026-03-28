// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const noAgentEnv = { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' };
const agentEnv = { CLAUDECODE: '1' };

describe('vit vet', () => {
  test('shows help with [ref] argument', () => {
    const result = run('vet --help');
    expect(result.stdout).toContain('[ref]');
  });

  test('rejects invalid ref format (human)', () => {
    const result = run('vet not-valid', undefined, noAgentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('invalid ref');
  });

  test('errors when no ref and no --dangerous-accept', () => {
    const result = run('vet', undefined, noAgentEnv);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('ref argument is required');
  });

  // --- dangerous-accept tests ---

  describe('--dangerous-accept', () => {
    test('without --confirm: prints warning, does NOT write flag', () => {
      const tmp = join(tmpdir(), '.test-vet-da-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const result = run('vet --dangerous-accept', tmp, noAgentEnv);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('WARNING');
      expect(result.stdout).toContain('--dangerous-accept --confirm');
      expect(existsSync(join(tmp, '.vit', 'dangerous-accept'))).toBe(false);
      rmSync(tmp, { recursive: true, force: true });
    });

    test('with --confirm: writes flag file and .gitignore', () => {
      const tmp = join(tmpdir(), '.test-vet-da-confirm-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const result = run('vet --dangerous-accept --confirm', tmp, noAgentEnv);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('dangerous-accept enabled');
      expect(existsSync(join(tmp, '.vit', 'dangerous-accept'))).toBe(true);
      const flagContent = JSON.parse(readFileSync(join(tmp, '.vit', 'dangerous-accept'), 'utf-8').trim());
      expect(flagContent.acceptedAt).toBeTruthy();
      const gitignore = readFileSync(join(tmp, '.vit', '.gitignore'), 'utf-8');
      expect(gitignore).toContain('dangerous-accept');
      rmSync(tmp, { recursive: true, force: true });
    });

    test('blocked when agent detected', () => {
      const tmp = join(tmpdir(), '.test-vet-da-agent-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const result = run('vet --dangerous-accept', tmp, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('human-only');
      expect(existsSync(join(tmp, '.vit', 'dangerous-accept'))).toBe(false);
      rmSync(tmp, { recursive: true, force: true });
    });

    test('blocked with --confirm when agent detected', () => {
      const tmp = join(tmpdir(), '.test-vet-da-agent-c-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      const result = run('vet --dangerous-accept --confirm', tmp, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('human-only');
      expect(existsSync(join(tmp, '.vit', 'dangerous-accept'))).toBe(false);
      rmSync(tmp, { recursive: true, force: true });
    });

    test('running twice does not duplicate .gitignore entry', () => {
      const tmp = join(tmpdir(), '.test-vet-da-twice-' + Math.random().toString(36).slice(2));
      mkdirSync(join(tmp, '.vit'), { recursive: true });
      run('vet --dangerous-accept --confirm', tmp, noAgentEnv);
      run('vet --dangerous-accept --confirm', tmp, noAgentEnv);
      const gitignore = readFileSync(join(tmp, '.vit', '.gitignore'), 'utf-8');
      const matches = gitignore.match(/dangerous-accept/g);
      expect(matches.length).toBe(1);
      rmSync(tmp, { recursive: true, force: true });
    });
  });

  // --- agent gate tests ---

  describe('agent gate', () => {
    test('agent without flags: error with sandboxed sub-agent hint', () => {
      const result = run('vet fast-cache-invalidation', undefined, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('vit vet is for operator review');
      expect(result.stderr).toContain('--trust --confirm');
      expect(result.stderr).toContain('sandboxed sub-agent');
    });

    test('agent with --trust but no --confirm: error', () => {
      const result = run('vet fast-cache-invalidation --trust', undefined, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('vit vet is for operator review');
      expect(result.stderr).toContain('--trust --confirm');
    });

    test('agent with --confirm but no --trust: error', () => {
      const result = run('vet fast-cache-invalidation --confirm', undefined, agentEnv);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('vit vet is for operator review');
    });

    test('agent with --trust --confirm: passes agent gate (fails at DID)', () => {
      // Should pass agent gate but fail later at DID check
      const configHome = join(tmpdir(), '.test-vet-tc-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --trust --confirm', undefined, { ...agentEnv, XDG_CONFIG_HOME: configHome });
      // Should NOT contain the agent gate error
      expect(result.stderr).not.toContain('vit vet is for operator review');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('human with --trust --confirm: passes (--confirm harmless for humans)', () => {
      const configHome = join(tmpdir(), '.test-vet-tc-human-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --trust --confirm', undefined, { ...noAgentEnv, XDG_CONFIG_HOME: configHome });
      // Should NOT contain the agent gate error
      expect(result.stderr).not.toContain('vit vet is for operator review');
      rmSync(configHome, { recursive: true, force: true });
    });
  });

  describe('--sandbox', () => {
    test('--sandbox without agent outside agent env: error with hint', () => {
      const result = run('vet fast-cache-invalidation --sandbox', undefined, noAgentEnv);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('could not detect agent');
      expect(result.stderr).toContain('--sandbox claude');
    });

    test('--sandbox bogus: error about unknown agent', () => {
      const result = run('vet fast-cache-invalidation --sandbox bogus', undefined, noAgentEnv);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('unknown sandbox agent');
    });

    test('--sandbox claude accepted (passes validation, fails at DID)', () => {
      const configHome = join(tmpdir(), '.test-vet-sb-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --sandbox claude', undefined, { ...noAgentEnv, XDG_CONFIG_HOME: configHome });
      // Should NOT contain validation errors for sandbox agent
      expect(result.stderr).not.toContain('unknown sandbox agent');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('--sandbox codex accepted', () => {
      const configHome = join(tmpdir(), '.test-vet-sb-codex-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --sandbox codex', undefined, { ...noAgentEnv, XDG_CONFIG_HOME: configHome });
      expect(result.stderr).not.toContain('unknown sandbox agent');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('--sandbox gemini accepted', () => {
      const configHome = join(tmpdir(), '.test-vet-sb-gemini-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --sandbox gemini', undefined, { ...noAgentEnv, XDG_CONFIG_HOME: configHome });
      expect(result.stderr).not.toContain('unknown sandbox agent');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('--sandbox without value in agent env: auto-detects agent', () => {
      const configHome = join(tmpdir(), '.test-vet-sb-auto-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --sandbox', undefined, { ...agentEnv, XDG_CONFIG_HOME: configHome });
      // Should pass sandbox agent resolution (claude code → claude), fail later at DID
      expect(result.stderr).not.toContain('could not detect agent');
      expect(result.stderr).not.toContain('unknown sandbox agent');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('--sandbox passes agent gate (agent env + --sandbox flag)', () => {
      const configHome = join(tmpdir(), '.test-vet-sb-gate-' + Math.random().toString(36).slice(2));
      mkdirSync(configHome, { recursive: true });
      const result = run('vet fast-cache-invalidation --sandbox claude', undefined, { ...agentEnv, XDG_CONFIG_HOME: configHome });
      // Should NOT contain the agent gate error
      expect(result.stderr).not.toContain('vit vet is for operator review');
      rmSync(configHome, { recursive: true, force: true });
    });

    test('--sandbox shows in help output', () => {
      const result = run('vet --help');
      expect(result.stdout).toContain('--sandbox');
    });

    test('--sandbox --json without agent outside agent env: JSON error', () => {
      const result = run('vet fast-cache-invalidation --sandbox --json', undefined, noAgentEnv);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain('could not detect agent');
    });

    test('--sandbox --json bogus: JSON error', () => {
      const result = run('vet fast-cache-invalidation --sandbox bogus --json', undefined, noAgentEnv);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain('unknown sandbox agent');
    });
  });
});
