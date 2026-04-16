// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, mock, spyOn, beforeEach, afterEach, afterAll } from 'bun:test';
import { Command } from 'commander';

const FAKE_HEAD = 'abc123def456';
const FAKE_TREE = 'tree789xyz';

mock.module('isomorphic-git', () => ({
  default: {
    clone: async () => {},
    resolveRef: async () => FAKE_HEAD,
    readObject: async ({ oid }) => {
      if (oid === FAKE_HEAD) {
        return { object: { tree: FAKE_TREE } };
      }
      return { object: [] };
    },
  },
}));

const { default: registerBeacon } = await import('../src/cmd/beacon.js');

describe('vit beacon', () => {
  let logSpy;
  let errorSpy;
  let savedExitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = savedExitCode ?? 0;
  });

  afterAll(() => {
    mock.restore();
  });

  test('probes a public repo without .vit/config.json beacon (unlit)', async () => {
    const program = new Command();
    program.exitOverride();
    registerBeacon(program);
    await program.parseAsync(['beacon', 'https://github.com/octocat/Hello-World.git'], { from: 'user' });
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('beacon: unlit');
  });

  test('errors on invalid URL', async () => {
    const program = new Command();
    program.exitOverride();
    registerBeacon(program);
    await program.parseAsync(['beacon', 'notaurl'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  test('errors on nonexistent repo', async () => {
    const gitMod = await import('isomorphic-git');
    const origClone = gitMod.default.clone;
    try {
      gitMod.default.clone = async () => {
        throw new Error('remote: Repository not found');
      };

      const program = new Command();
      program.exitOverride();
      registerBeacon(program);
      await program.parseAsync(['beacon', 'https://github.com/nonexistent-user-abc/repo404.git'], { from: 'user' });
      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      gitMod.default.clone = origClone;
    }
  });
});
