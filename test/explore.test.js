// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

describe('vit explore', () => {
  test('shows help', () => {
    const result = run('explore --help', '/tmp');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('explore');
  });

  test('stats returns JSON', () => {
    const result = run('explore stats --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(typeof data.total_caps).toBe('number');
  });

  test('caps returns JSON', () => {
    const result = run('explore caps --json --limit 2', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.caps)).toBe(true);
  });

  test('skills returns JSON', () => {
    const result = run('explore skills --json --limit 2', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test('beacons returns JSON', () => {
    const result = run('explore beacons --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.beacons)).toBe(true);
  });

  test('graceful error on unreachable URL', () => {
    const result = run('explore stats --explore-url http://localhost:1 --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('unavailable');
  });

  test('graceful error on invalid URL', () => {
    const result = run('explore stats --explore-url not-a-url --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('unavailable');
  });

  test('vouches requires --cap or --ref', () => {
    const result = run('explore vouches --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
  });

  test('env var override works', () => {
    const result = run('explore stats --json', '/tmp', { VIT_EXPLORE_URL: 'http://localhost:1' });
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('unavailable');
  });

  test('flag overrides env var', () => {
    const result = run(
      'explore stats --json --explore-url https://explore.v-it.org',
      '/tmp',
      { VIT_EXPLORE_URL: 'http://localhost:1' },
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
  });
});
