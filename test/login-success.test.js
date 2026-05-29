// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { Command } from 'commander';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';

let tmpHome;
let oldHome;
let oldXdgConfigHome;
let registerLogin;
let currentHome;
let savedConfig = {};
const realHomedir = os.homedir;
const realTmpdir = os.tmpdir;
const fallbackConfigHome = join(realTmpdir(), '.test-login-config-' + process.pid);

mock.module('node:os', () => ({
  ...os,
  homedir: () => currentHome || realHomedir(),
}));

mock.module('@atproto/api', () => ({
  AtpAgent: class {
    async login({ identifier }) {
      if (globalThis.__vitLoginShouldReject) throw new Error('mock login failed');
      return {
        data: {
          did: 'did:plc:test',
          handle: identifier,
          accessJwt: 'a',
          refreshJwt: 'r',
        },
      };
    }
  },
  Agent: class {},
}));

mock.module('../src/lib/config.js', () => ({
  loadConfig: () => ({ ...savedConfig }),
  saveConfig: (config) => {
    savedConfig = { ...config };
    globalThis.__vitSavedConfig = { ...config };
  },
}));

mock.module('../src/lib/paths.js', () => ({
  configDir: join(fallbackConfigHome, 'vit'),
  configPath: (filename) => join(fallbackConfigHome, 'vit', filename),
}));

mock.module('../src/lib/oauth.js', () => ({
  checkSession: () => null,
  createOAuthClient: () => {
    throw new Error('OAuth path should not run in login success tests');
  },
  createSessionStore: () => ({}),
  createStore: () => ({}),
}));

async function runLogin(args) {
  const program = new Command();
  program.exitOverride();
  registerLogin(program);

  const oldExitCode = process.exitCode;
  const oldLog = console.log;
  const oldError = console.error;
  const logs = [];
  const errors = [];
  process.exitCode = undefined;
  console.log = (...line) => logs.push(line.join(' '));
  console.error = (...line) => errors.push(line.join(' '));
  try {
    await program.parseAsync(args);
    return { logs, errors, exitCode: process.exitCode ?? 0 };
  } finally {
    console.log = oldLog;
    console.error = oldError;
    process.exitCode = oldExitCode ?? 0;
  }
}

describe('login success path', () => {
  beforeAll(async () => {
    tmpHome = join(realTmpdir(), '.test-login-success-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpHome, { recursive: true });
    savedConfig = {};
    currentHome = tmpHome;
    globalThis.__vitTestHome = tmpHome;
    globalThis.__vitTestConfigHome = join(tmpHome, '.config');
    globalThis.__vitSavedConfig = {};
    globalThis.__vitLoginShouldReject = false;
    oldHome = process.env.HOME;
    oldXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.HOME = tmpHome;
    process.env.XDG_CONFIG_HOME = join(tmpHome, '.config');
    ({ default: registerLogin } = await import('../src/cmd/login.js?login-success'));
  });

  afterAll(() => {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = oldXdgConfigHome;
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(fallbackConfigHome, { recursive: true, force: true });
    currentHome = undefined;
    delete globalThis.__vitTestHome;
    delete globalThis.__vitTestConfigHome;
    delete globalThis.__vitSavedConfig;
    delete globalThis.__vitLoginShouldReject;
    mock.restore();
  });

  test('login app-password installs skill and prints readiness', async () => {
    globalThis.__vitLoginShouldReject = false;

    const result = await runLogin(['node', 'vit', 'login', 'alice.test', '--force', '--app-password', 'x']);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join('\n')).toContain('skill: ready (using-vit)');
    expect(result.logs.join('\n')).toContain('Logged in as did:plc:test');
    expect(existsSync(join(tmpHome, '.claude', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(tmpHome, '.agents', 'skills', 'using-vit', 'SKILL.md'))).toBe(true);
  });

  test('login prints readiness before failed auth', async () => {
    globalThis.__vitLoginShouldReject = true;

    const result = await runLogin(['node', 'vit', 'login', 'alice.test', '--force', '--app-password', 'x']);

    expect(result.exitCode).toBe(1);
    expect(result.logs.join('\n')).toContain('skill: ready (using-vit)');
  });
});
