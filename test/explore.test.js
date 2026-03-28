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

  test('cap detail returns JSON', () => {
    const result = run('explore cap network-content-seeding --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.cap).toBeDefined();
    expect(data.cap.ref).toBe('network-content-seeding');
    expect(data.cap.title).toBeDefined();
  });

  test('cap detail with beacon', () => {
    const result = run('explore cap network-content-seeding --beacon vit:github.com/solpbc/vit --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.cap).toBeDefined();
    expect(data.cap.ref).toBe('network-content-seeding');
  });

  test('cap not found', () => {
    const result = run('explore cap nonexistent-ref-xyz --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("no cap found with ref 'nonexistent-ref-xyz'");
  });

  test('skill detail returns JSON', () => {
    const result = run('explore skill atproto-records --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.skill).toBeDefined();
    expect(data.skill.name).toBe('atproto-records');
    expect(data.skill.version).toBeDefined();
  });

  test('skill not found', () => {
    const result = run('explore skill nonexistent-skill-xyz --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("no skill found with name 'nonexistent-skill-xyz'");
  });

  test('bare explore returns stats JSON', () => {
    const result = run('explore --json', '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(typeof data.total_caps).toBe('number');
  });
});
