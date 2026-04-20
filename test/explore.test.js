// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'node:child_process';
import { run } from './helpers.js';

let server;
let port;

beforeAll(async () => {
  const serverScript = `
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;

        if (path === '/api/stats') {
          return Response.json({
            total_caps: 42, total_skills: 10, total_vouches: 5,
            total_beacons: 3, active_dids: 8, skill_publishers: 4,
          });
        }

        if (path === '/api/caps') {
          return Response.json({
            caps: [{ title: 'Test Cap', ref: 'test-cap', handle: 'test.bsky.social',
                     beacon: 'vit:github.com/test/repo', description: 'A test cap' }],
          });
        }

        if (path === '/api/skills') {
          return Response.json({
            skills: [{ name: 'test-skill', version: '1.0.0', description: 'A test skill',
                       handle: 'test.bsky.social' }],
          });
        }

        if (path === '/api/beacons') {
          return Response.json({
            beacons: [{ beacon: 'vit:github.com/test/repo', handle: 'test.bsky.social' }],
          });
        }

        if (path === '/api/cap') {
          const ref = url.searchParams.get('ref');
          if (ref === 'network-content-seeding') {
            return Response.json({
              cap: {
                ref: 'network-content-seeding', title: 'Network Content Seeding',
                beacon: 'vit:github.com/solpbc/vit', handle: 'test.bsky.social',
                description: 'Seed content across the network',
                record_json: JSON.stringify({ kind: 'feat', text: 'test body' }),
                created_at: '2026-01-01T00:00:00Z', vouch_count: 0,
              },
            });
          }
          return Response.json({});
        }

        if (path === '/api/skill') {
          const name = url.searchParams.get('name');
          if (name === 'atproto-records') {
            return Response.json({
              skill: {
                name: 'atproto-records', version: '1.0.0',
                description: 'AT Protocol record helpers',
                handle: 'test.bsky.social', tags: 'atproto',
                record_json: JSON.stringify({ license: 'MIT' }),
                vouch_count: 0,
              },
            });
          }
          return Response.json({});
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(server.port);
  `;

  server = spawn('bun', ['-e', serverScript], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise((resolve, reject) => {
    let started = false;
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error('mock explore server failed to start'));
    }, 5000);

    server.stdout.setEncoding('utf-8');
    server.stdout.on('data', (chunk) => {
      if (started) return;
      const value = Number(String(chunk).trim().split(/\r?\n/, 1)[0]);
      if (!Number.isNaN(value) && value > 0) {
        started = true;
        clearTimeout(timer);
        resolve(value);
      }
    });
    server.once('exit', (code) => {
      if (!started) {
        clearTimeout(timer);
        reject(new Error(`mock explore server exited early: ${code}`));
      }
    });
  });
});

afterAll(async () => {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once('exit', () => resolve());
    server.kill();
  });
});

describe('vit explore', () => {
  test('shows help', () => {
    const result = run('explore --help', '/tmp');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('explore');
  });

  test('stats returns JSON', () => {
    const result = run(`explore stats --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(typeof data.total_caps).toBe('number');
  });

  test('caps returns JSON', () => {
    const result = run(`explore caps --json --limit 2 --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.caps)).toBe(true);
  });

  test('skills returns JSON', () => {
    const result = run(`explore skills --json --limit 2 --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.skills)).toBe(true);
  });

  test('beacons returns JSON', () => {
    const result = run(`explore beacons --json --explore-url http://localhost:${port}`, '/tmp');
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
    expect(data.error).toContain('request to http://localhost:1/api/stats failed');
  });

  test('graceful error on invalid URL', () => {
    const result = run('explore stats --explore-url not-a-url --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('not-a-url');
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
    expect(data.error).toContain('request to http://localhost:1/api/stats failed');
  });

  test('flag overrides env var', () => {
    const result = run(
      `explore stats --json --explore-url http://localhost:${port}`,
      '/tmp',
      { VIT_EXPLORE_URL: 'http://localhost:1' },
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
  });

  test('cap detail returns JSON', () => {
    const result = run(`explore cap network-content-seeding --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.cap).toBeDefined();
    expect(data.cap.ref).toBe('network-content-seeding');
    expect(data.cap.title).toBeDefined();
  });

  test('cap detail with beacon', () => {
    const result = run(
      `explore cap network-content-seeding --beacon vit:github.com/solpbc/vit --json --explore-url http://localhost:${port}`,
      '/tmp',
    );
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.cap).toBeDefined();
    expect(data.cap.ref).toBe('network-content-seeding');
  });

  test('cap not found', () => {
    const result = run(`explore cap nonexistent-ref-xyz --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("no cap found with ref 'nonexistent-ref-xyz'");
  });

  test('skill detail returns JSON', () => {
    const result = run(`explore skill atproto-records --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(data.skill).toBeDefined();
    expect(data.skill.name).toBe('atproto-records');
    expect(data.skill.version).toBeDefined();
  });

  test('skill not found', () => {
    const result = run(`explore skill nonexistent-skill-xyz --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain("no skill found with name 'nonexistent-skill-xyz'");
  });

  test('caps --kind filter passes kind to API', () => {
    const result = run(`explore caps --kind request --json --limit 2 --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.caps)).toBe(true);
  });

  test('caps gracefully degrades on unreachable URL with --kind', () => {
    const result = run('explore caps --kind request --explore-url http://localhost:1 --json', '/tmp');
    expect(result.exitCode).not.toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('request to http://localhost:1/api/caps?kind=request failed');
  });

  test('bare explore returns stats JSON', () => {
    const result = run(`explore --json --explore-url http://localhost:${port}`, '/tmp');
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(true);
    expect(typeof data.total_caps).toBe('number');
  });
});
