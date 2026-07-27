// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vitBin = join(import.meta.dir, '..', 'bin', 'vit.js');
const cleanAgentEnv = { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '', OPENCODE: '' };

async function runVit(args, cwd, env = {}) {
  const proc = Bun.spawn(['bun', vitBin, ...args], {
    cwd,
    env: { ...process.env, ...cleanAgentEnv, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

function writeRawConfig(dir, config) {
  mkdirSync(join(dir, '.vit'), { recursive: true });
  writeFileSync(join(dir, '.vit', 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

describe('canonical beacon CLI behavior', () => {
  let testDir;
  let testHome;
  let server;
  let requests;

  beforeEach(() => {
    testDir = join(tmpdir(), '.test-canonical-beacon-cli-' + Math.random().toString(36).slice(2));
    testHome = join(tmpdir(), '.test-canonical-beacon-home-' + Math.random().toString(36).slice(2));
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testHome, { recursive: true });
    requests = [];
  });

  afterEach(() => {
    server?.stop(true);
    server = null;
    rmSync(testDir, { recursive: true, force: true });
    rmSync(testHome, { recursive: true, force: true });
  });

  function isolatedEnv(extra = {}) {
    return {
      HOME: testHome,
      XDG_CONFIG_HOME: join(testHome, '.config'),
      ...extra,
    };
  }

  function startExploreServer() {
    server = Bun.serve({
      port: 0,
      fetch(request) {
        requests.push(new URL(request.url));
        return Response.json({ caps: [], cursor: null });
      },
    });
    return `http://127.0.0.1:${server.port}`;
  }

  test('primary repair canonicalizes the replacement and preserves unrelated fields', async () => {
    writeRawConfig(testDir, {
      beacon: 'not a url',
      secondaryBeacon: 'https://tangled.org/solpbc.org/rookery',
      untouched: { keep: true },
    });

    const result = await runVit(
      ['init', '--beacon', 'https://github.com/solpbc/thermals'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(testDir, '.vit', 'config.json'), 'utf-8'))).toEqual({
      beacon: 'vit:github.com/solpbc/thermals',
      secondaryBeacon: 'vit:tangled.org/solpbc.org/rookery',
      untouched: { keep: true },
    });
  });

  test('primary repair drops only a corrupt preserved secondary', async () => {
    writeRawConfig(testDir, {
      beacon: 'not a url',
      secondaryBeacon: 'also not a url',
      untouched: 42,
    });

    const result = await runVit(
      ['init', '--beacon', 'https://github.com/solpbc/thermals'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('dropping invalid .vit/config.json "secondaryBeacon"');
    expect(JSON.parse(readFileSync(join(testDir, '.vit', 'config.json'), 'utf-8'))).toEqual({
      beacon: 'vit:github.com/solpbc/thermals',
      untouched: 42,
    });
  });

  test('secondary repair replaces corrupt secondary and canonicalizes the preserved primary', async () => {
    writeRawConfig(testDir, {
      beacon: 'https://github.com/solpbc/thermals',
      secondaryBeacon: 'not a url',
      untouched: true,
    });

    const result = await runVit(
      ['init', '--secondary', 'https://tangled.org/solpbc.org/rookery'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(testDir, '.vit', 'config.json'), 'utf-8'))).toEqual({
      beacon: 'vit:github.com/solpbc/thermals',
      secondaryBeacon: 'vit:tangled.org/solpbc.org/rookery',
      untouched: true,
    });
  });

  test('secondary-only repair refuses a corrupt primary with a repair hint and no write', async () => {
    const original = { beacon: 'not a url', secondaryBeacon: 'old invalid', untouched: true };
    writeRawConfig(testDir, original);

    const result = await runVit(
      ['init', '--secondary', 'https://tangled.org/solpbc.org/rookery'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('.vit/config.json "beacon"');
    expect(result.stderr).toContain('run vit init --beacon <canonical-git-url> to repair it');
    expect(JSON.parse(readFileSync(join(testDir, '.vit', 'config.json'), 'utf-8'))).toEqual(original);
  });

  test('doctor reports an invalid beacon, completes checks, and exposes beaconError in JSON', async () => {
    writeRawConfig(testDir, { beacon: 'not a url' });
    const env = isolatedEnv();

    const human = await runVit(['doctor'], testDir, env);
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toContain('beacon: invalid project identity in .vit/config.json');
    expect(human.stdout).toContain('skill:');
    expect(human.stdout).toContain('bluesky:');

    const json = await runVit(['doctor', '--json'], testDir, env);
    const parsed = JSON.parse(json.stdout);
    expect(json.exitCode).toBe(1);
    expect(parsed.ok).toBe(true);
    expect(parsed.beacon).toBeNull();
    expect(parsed.beaconError).toContain('.vit/config.json "beacon"');
    expect(parsed).toHaveProperty('skillInstall');
    expect(parsed).toHaveProperty('bluesky');
  });

  test('init status reports the corrupt config field with the repair hint', async () => {
    writeRawConfig(testDir, { beacon: 'not a url' });

    const result = await runVit(
      ['init'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('.vit/config.json "beacon"');
    expect(result.stderr).toContain('run vit init --beacon <canonical-git-url> to repair it');
  });

  test('explore dot filter sends canonical primary and secondary values', async () => {
    writeRawConfig(testDir, {
      beacon: 'https://github.com/solpbc/thermals',
      secondaryBeacon: 'https://tangled.org/solpbc.org/rookery',
    });
    const baseUrl = startExploreServer();

    const result = await runVit(
      ['explore', 'caps', '--beacon', '.', '--json', '--explore-url', baseUrl],
      testDir,
      isolatedEnv(),
    );

    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('beacon')).toBe(
      'vit:github.com/solpbc/thermals,vit:tangled.org/solpbc.org/rookery',
    );
  });

  test('explicit explore filters normalize before the HTTP request', async () => {
    const baseUrl = startExploreServer();

    const result = await runVit(
      [
        'explore', 'caps',
        '--beacon', 'https://github.com/solpbc/thermals',
        '--json',
        '--explore-url', baseUrl,
      ],
      testDir,
      isolatedEnv(),
    );

    expect(result.exitCode).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('beacon')).toBe('vit:github.com/solpbc/thermals');
  });

  test('invalid explicit explore filter makes no HTTP request', async () => {
    const baseUrl = startExploreServer();

    const result = await runVit(
      ['explore', 'caps', '--beacon', 'not a url', '--json', '--explore-url', baseUrl],
      testDir,
      isolatedEnv(),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('--beacon');
    expect(requests).toHaveLength(0);
  });

  test('invalid init option names the option and accepted forms without writing config', async () => {
    const result = await runVit(
      ['init', '--beacon', 'not a url'],
      testDir,
      isolatedEnv({ CODEX_CI: '1' }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid beacon from --beacon');
    expect(result.stderr).toContain('vit:host/owner/repo or a git URL');
    expect(existsSync(join(testDir, '.vit', 'config.json'))).toBe(false);
  });

  test('all eleven config consumers surface a corrupt primary before external work', async () => {
    writeRawConfig(testDir, { beacon: 'not a url' });
    const cases = [
      { args: ['init'], env: { CODEX_CI: '1' } },
      { args: ['init', '--secondary', 'https://github.com/org/repo'], env: { CODEX_CI: '1' } },
      { args: ['doctor'] },
      { args: ['explore', 'caps', '--beacon', '.', '--json', '--explore-url', 'http://127.0.0.1:1'] },
      {
        args: [
          'ship', '--did', 'did:plc:test', '--kind', 'request',
          '--title', 'Canonical Beacon', '--description', 'Test request',
          '--ref', 'canonical-beacon-test',
        ],
        env: { CODEX_CI: '1' },
      },
      { args: ['skim', '--did', 'did:plc:test', '--skills'], env: { CODEX_CI: '1' } },
      { args: ['remix', 'canonical-beacon-test', '--did', 'did:plc:test'], env: { CODEX_CI: '1' } },
      { args: ['vet', 'canonical-beacon-test', '--did', 'did:plc:test'] },
      { args: ['vouch', 'canonical-beacon-test', '--did', 'did:plc:test', '--kind', 'want'] },
      { args: ['scan', '--beacon', '.', '--days', '1', '--json'] },
      { args: ['inbox', '--json', '--explore-url', 'http://127.0.0.1:1'] },
    ];

    for (const entry of cases) {
      const result = await runVit(entry.args, testDir, isolatedEnv(entry.env));
      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        entry.args[0] === 'doctor' ? 'invalid project identity' : '.vit/config.json',
      );
    }
  });
});
