// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { run } from './helpers.js';

const R = 'Load the using-vit skill before using this CLI.';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('using-vit skill reminder', () => {
  test('--help prints the reminder once on stdout', () => {
    const result = run('--help', '/tmp');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: vit');
    expect(result.stdout).toContain('help [command]');
    expect(count(result.stdout, R)).toBe(1);
    expect(typeof result.stderr).toBe('string');
    expect(result.stderr.length).toBe(0);
  });

  test('bare invocation prints help and the reminder once on stderr', () => {
    const result = run('', '/tmp');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: vit');
    expect(result.stderr).toContain('help [command]');
    expect(count(result.stderr, R)).toBe(1);
  });

  test('unknown command prints the reminder once and no root help', () => {
    const result = run('notacommand', '/tmp');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("error: unknown command 'notacommand'");
    expect(count(result.stderr, R)).toBe(1);
    expect(result.stderr).not.toContain('Usage: vit [options] [command]');
  });

  test('unknown option prints the reminder once and no root help', () => {
    const result = run('--bogus', '/tmp');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain("error: unknown option '--bogus'");
    expect(count(result.stderr, R)).toBe(1);
    expect(result.stderr).not.toContain('Usage: vit [options] [command]');
  });

  test('vouch missing ref prints the reminder once and no root help', () => {
    const result = run('vouch', '/tmp');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('error: missing required argument');
    expect(count(result.stderr, R)).toBe(1);
    expect(result.stderr).not.toContain('Usage: vit [options] [command]');
  });

  test('--version is reminder-free', () => {
    const result = run('--version', '/tmp');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(pkg.version);
    expect(typeof result.stderr).toBe('string');
    expect(result.stderr.length).toBe(0);
    expect(result.stdout).not.toContain(R);
    expect(result.stderr).not.toContain(R);
  });

  test('application --kind error is not decorated', () => {
    const result = run('vouch fast-cache-invalidation --kind badkind', '/tmp');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('--kind must be one of');
    expect(result.stdout).not.toContain(R);
    expect(result.stderr).not.toContain(R);
  });
});
