// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const agentEnv = { CLAUDECODE: '1' };

describe('vit ship --skill', () => {
  test('rejects when run outside a coding agent', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-gate-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: test\ndescription: test skill\n---\n# Test');
    const r = run(`ship --skill ${tmp}`, '/tmp', { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('should be run by a coding agent');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('errors when SKILL.md is missing', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-no-md-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    const r = run(`ship --skill ${tmp}`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('no SKILL.md found');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('errors when SKILL.md has no name', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-no-name-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\ndescription: test\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('name');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('errors when SKILL.md has no description', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-no-desc-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: test\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('description');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('rejects invalid skill name (uppercase)', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-bad-name-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: BadName\ndescription: test\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('lowercase');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('rejects skill name starting with hyphen', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-hyphen-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: -bad\ndescription: test\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('lowercase');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('passes validation with valid skill (fails at auth, not validation)', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-valid-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: test-skill\ndescription: a test skill\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    // Should fail at auth, not at validation
    expect(r.stderr).not.toContain('no SKILL.md');
    expect(r.stderr).not.toContain('name');
    expect(r.stderr).not.toContain('description');
    rmSync(tmp, { recursive: true, force: true });
  });

  test('can parse the existing vit skill SKILL.md', () => {
    // Use the real skill directory in the vit repo
    const skillDir = join(import.meta.dir, '..', 'skills', 'vit');
    const r = run(`ship --skill ${skillDir} --did did:plc:abc`, '/tmp', agentEnv);
    expect(r.exitCode).not.toBe(0);
    // Should fail at auth, not at SKILL.md parsing
    expect(r.stderr).not.toContain('no SKILL.md');
    expect(r.stderr).not.toContain('frontmatter must include');
    expect(r.stderr).not.toContain('skill name must be');
  });

  test('does not require beacon for skill shipping', () => {
    const tmp = join(tmpdir(), '.test-ship-skill-no-beacon-' + Math.random().toString(36).slice(2));
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, 'SKILL.md'), '---\nname: test-skill\ndescription: a test skill\n---\n# Test');
    const r = run(`ship --skill ${tmp} --did did:plc:abc`, tmp, agentEnv);
    expect(r.exitCode).not.toBe(0);
    // Should NOT fail due to beacon
    expect(r.stderr).not.toContain('no beacon set');
    rmSync(tmp, { recursive: true, force: true });
  });
});
