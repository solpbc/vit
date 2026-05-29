// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SKILL_NAME = 'using-vit';
const SOURCE_MISSING_ERROR = 'source skill files missing or empty';

function defaultSourceDir() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'vit');
}

function errorMessage(err) {
  if (err instanceof Error) return err.message || String(err);
  return String(err);
}

function readSkillName(sourceDir) {
  try {
    const content = readFileSync(join(sourceDir, 'SKILL.md'), 'utf-8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return DEFAULT_SKILL_NAME;
    const nameMatch = match[1].match(/^name:\s*(.+)$/m);
    return nameMatch ? nameMatch[1].trim() : DEFAULT_SKILL_NAME;
  } catch {
    return DEFAULT_SKILL_NAME;
  }
}

function sourceExists(sourceDir) {
  try {
    return existsSync(sourceDir) && readdirSync(sourceDir).length > 0;
  } catch {
    return false;
  }
}

export function skillInstallReason(skillResult) {
  if (skillResult.results.some(result => result.status === 'source-missing')) {
    return 'source skill files missing';
  }

  const failed = skillResult.results.filter(result => result.status === 'failed');
  if (failed.length > 0) {
    return failed
      .map(result => `${result.label} failed: ${result.error || 'unknown error'}`)
      .join('; ');
  }

  return 'skill install failed';
}

// sourceDir exists only as a test seam; production callers pass nothing.
export function ensureSkill({ sourceDir = defaultSourceDir() } = {}) {
  const name = readSkillName(sourceDir);
  const home = homedir();
  const targets = [
    { label: 'claude', path: join(home, '.claude', 'skills', name) },
    { label: 'agents', path: join(home, '.agents', 'skills', name) },
  ];

  if (!sourceExists(sourceDir)) {
    return {
      name,
      source: null,
      ok: false,
      results: targets.map(target => ({
        ...target,
        status: 'source-missing',
        error: SOURCE_MISSING_ERROR,
      })),
    };
  }

  const results = targets.map(target => {
    try {
      const existed = existsSync(join(target.path, 'SKILL.md'));
      mkdirSync(target.path, { recursive: true });
      cpSync(sourceDir, target.path, { recursive: true, force: true });
      return {
        ...target,
        status: existed ? 'already-present' : 'created',
        error: null,
      };
    } catch (err) {
      return {
        ...target,
        status: 'failed',
        error: errorMessage(err),
      };
    }
  });

  return {
    name,
    source: sourceDir,
    ok: results.every(result => result.status === 'created' || result.status === 'already-present'),
    results,
  };
}
