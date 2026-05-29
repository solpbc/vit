// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, afterEach } from 'bun:test';
import { run } from './helpers.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('vit doctor', () => {
  let tmpHome;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function doctorEnv() {
    tmpHome = join(tmpdir(), '.test-doctor-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    return { HOME: tmpHome, XDG_CONFIG_HOME: join(tmpHome, '.config') };
  }

  test('reports beacon status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/beacon:/);
  });

  test('reports skill status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/skill:/);
  });

  test('reports bluesky status', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/bluesky:/);
  });

  test('reports install type', () => {
    const result = run('doctor', undefined, doctorEnv());
    expect(result.stdout).toMatch(/install:/);
  });

  test('vit status is an alias for doctor', () => {
    const result = run('status', undefined, doctorEnv());
    expect(result.stdout).toMatch(/install:/);
  });

  test('vit setup is byte-identical to vit doctor', () => {
    const env = doctorEnv();
    run('doctor', undefined, env);

    const doctor = run('doctor', undefined, env);
    const setup = run('setup', undefined, env);

    expect(setup.stdout).toBe(doctor.stdout);
  });

  test('doctor self-installs using-vit skill when absent', () => {
    const env = doctorEnv();
    const result = run('doctor', undefined, env);

    expect(result.stdout).toMatch(/skill: installed|skill: ok/);
    expect(result.stdout).not.toMatch(/reinstall vit/);
    expect(result.stdout).not.toMatch(/not installed/);
    expect(existsSync(join(tmpHome, '.claude', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tmpHome, '.agents', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
  });

  test('doctor JSON detects skill present only under agents', () => {
    const env = doctorEnv();
    const agentsSkill = join(tmpHome, '.agents', 'skills', 'using-vit');
    mkdirSync(agentsSkill, { recursive: true });
    writeFileSync(join(agentsSkill, 'SKILL.md'), '---\nname: using-vit\n---\n');
    writeFileSync(join(tmpHome, '.claude'), 'not a directory\n');

    const result = run('doctor --json', undefined, env);
    const parsed = JSON.parse(result.stdout);

    expect(parsed.skill).toBe(true);
    expect(parsed.skillInstall.ok).toBe(false);
  });

  test('doctor JSON keeps stdout pure and reports skillInstall', () => {
    const result = run('doctor --json', undefined, doctorEnv());
    const parsed = JSON.parse(result.stdout);

    expect(parsed.skill).toBe(true);
    for (const key of ['install', 'beacon', 'skill', 'projectSkills', 'userSkills', 'bluesky']) {
      expect(parsed).toHaveProperty(key);
    }
    expect(parsed.skillInstall.ok).toBe(true);
    expect(Array.isArray(parsed.skillInstall.results)).toBe(true);
  });
});
