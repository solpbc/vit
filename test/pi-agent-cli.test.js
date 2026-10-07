// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers.js';

for (const [label, marker] of [
  ['AI_AGENT', { AI_AGENT: 'pi' }],
  ['PI_CODING_AGENT', { PI_CODING_AGENT: 'true' }],
  ['both markers', { AI_AGENT: 'pi', PI_CODING_AGENT: 'true' }],
]) {
  describe(`Pi CLI boundary via ${label}`, () => {
    let dir;
    let env;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), '.test-pi-cli-'));
      const home = join(dir, 'home');
      mkdirSync(home);
      env = { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), ...marker };
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    test('init writes the project beacon', () => {
      const result = run('init --beacon https://github.com/example/project', dir, env);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(join(dir, '.vit', 'config.json'), 'utf-8')).beacon)
        .toBe('vit:github.com/example/project');
    });

    for (const command of [
      'skim',
      'ship --title test --description test --ref pi-agent-test',
      'remix pi-agent-test',
    ]) {
      test(`${command.split(' ')[0]} reaches ordinary identity validation`, () => {
        const result = run(command, dir, env, 'test capability body');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('no DID configured');
      });
    }

    test('learn preserves vetting and then reaches identity validation', () => {
      const untrusted = run('learn skill-pi-test', dir, env);
      expect(untrusted.exitCode).toBe(1);
      expect(untrusted.stderr).toContain('not yet vetted');
      mkdirSync(join(dir, '.vit'));
      writeFileSync(join(dir, '.vit', 'trusted.jsonl'), JSON.stringify({ ref: 'skill-pi-test' }) + '\n');
      const trusted = run('learn skill-pi-test', dir, env);
      expect(trusted.exitCode).toBe(1);
      expect(trusted.stderr).toContain('no DID configured');
    });

    test('adopt refuses before cloning', () => {
      const result = run('adopt invalid-beacon', dir, env);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('must be run by a human');
      expect(existsSync(join(dir, 'project'))).toBe(false);
    });

    test('regular vet refuses agent review', () => {
      const result = run('vet pi-agent-test', dir, env);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('agents should not vet directly');
    });

    for (const format of ['', ' --json']) {
      test(`dangerous-accept refuses even with confirm${format}`, () => {
        mkdirSync(join(dir, '.vit'));
        const result = run(`vet --dangerous-accept --confirm${format}`, dir, env);
        expect(result.exitCode).toBe(1);
        if (format) expect(JSON.parse(result.stdout).error).toBe('dangerous-accept is human-only');
        else expect(result.stderr).toContain('human-only');
        expect(existsSync(join(dir, '.vit', 'dangerous-accept'))).toBe(false);
      });
    }

    test('vet keeps its explicit isolated-review override', () => {
      const result = run('vet pi-agent-test --trust --confirm', dir, env);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('no DID configured');
    });

    test('sandbox auto-detection reports the deferred Pi mapping', () => {
      const result = run('vet pi-agent-test --sandbox', dir, env);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("detected agent 'pi' has no sandbox mapping");
    });
  });
}
