// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';

const sourceDir = join(import.meta.dir, '..', 'skills', 'vit');
let currentHome;
const realHomedir = os.homedir;
const realTmpdir = os.tmpdir;

mock.module('node:os', () => ({
  ...os,
  homedir: () => currentHome || realHomedir(),
}));

const { ensureSkill } = await import('../src/lib/skill-install.js?skill-install-test');

function sortedEntries(dir) {
  return readdirSync(dir).sort();
}

describe('ensureSkill', () => {
  let tmpHome;
  let tmpSource;
  let oldHome;
  let oldXdgConfigHome;

  beforeEach(() => {
    tmpHome = join(realTmpdir(), '.test-skill-install-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    currentHome = tmpHome;
    oldHome = process.env.HOME;
    oldXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tmpHome;
    process.env.XDG_CONFIG_HOME = join(tmpHome, '.config');
  });

  afterEach(() => {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = oldXdgConfigHome;
    rmSync(tmpHome, { recursive: true, force: true });
    if (tmpSource) rmSync(tmpSource, { recursive: true, force: true });
    tmpSource = null;
    currentHome = undefined;
  });

  afterAll(() => {
    mock.restore();
  });

  test('installs the vendored using-vit skill into claude and agents homes', () => {
    const result = ensureSkill();

    expect(result.name).toBe('using-vit');
    expect(result.ok).toBe(true);
    expect(result.results.map(r => r.status)).toEqual(['created', 'created']);

    const expectedEntries = sortedEntries(sourceDir);
    for (const label of ['.claude', '.agents']) {
      const target = join(tmpHome, label, 'skills', 'using-vit');
      expect(existsSync(join(target, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(target, 'COMMANDS.md'))).toBe(true);
      expect(sortedEntries(target)).toEqual(expectedEntries);
    }
  });

  test('reports already-present and refreshes existing files', () => {
    ensureSkill();
    const targetFile = join(tmpHome, '.claude', 'skills', 'using-vit', 'COMMANDS.md');
    writeFileSync(targetFile, 'junk\n');

    const result = ensureSkill();

    expect(result.ok).toBe(true);
    expect(result.results.map(r => r.status)).toEqual(['already-present', 'already-present']);
    expect(readFileSync(targetFile, 'utf-8')).toBe(readFileSync(join(sourceDir, 'COMMANDS.md'), 'utf-8'));
  });

  test('reports one failed target while installing the other', () => {
    writeFileSync(join(tmpHome, '.claude'), 'not a directory\n');

    const result = ensureSkill();

    expect(result.ok).toBe(false);
    const claude = result.results.find(r => r.label === 'claude');
    const agents = result.results.find(r => r.label === 'agents');
    expect(claude.status).toBe('failed');
    expect(claude.error).toBeTruthy();
    expect(agents.status).toBe('created');
    expect(existsSync(join(tmpHome, '.agents', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
  });

  test('reports source-missing when vendored source is unavailable', () => {
    tmpSource = join(realTmpdir(), '.test-skill-source-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpSource, { recursive: true });

    const result = ensureSkill({ sourceDir: tmpSource });

    expect(result.source).toBe(null);
    expect(result.ok).toBe(false);
    expect(result.results.map(r => r.status)).toEqual(['source-missing', 'source-missing']);
    expect(existsSync(join(tmpHome, '.claude'))).toBe(false);
    expect(existsSync(join(tmpHome, '.agents'))).toBe(false);
  });

  test('falls back to using-vit when frontmatter has no name', () => {
    tmpSource = join(realTmpdir(), '.test-skill-source-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpSource, { recursive: true });
    writeFileSync(join(tmpSource, 'SKILL.md'), '---\ndescription: test skill\n---\n# Test\n');
    writeFileSync(join(tmpSource, 'EXTRA.md'), 'extra\n');

    const result = ensureSkill({ sourceDir: tmpSource });

    expect(result.name).toBe('using-vit');
    expect(result.ok).toBe(true);
    expect(existsSync(join(tmpHome, '.claude', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tmpHome, '.claude', 'skills', 'using-vit', 'EXTRA.md'))).toBe(true);
  });
});
