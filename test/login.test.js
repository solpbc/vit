// SPDX-License-Identifier: MIT
// Copyright (c) 2026 sol pbc

import { describe, test, expect, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './helpers.js';
import { cancelLogin, printLoginFailure, LOGIN_COMMON_ISSUES_FOOTER } from '../src/cmd/login.js';

describe('login', () => {
  test('--help shows --remote and --browser options', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--remote');
    expect(stdout).toContain('--browser');
  });

  test('--help shows --force option', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--force');
  });

  test('--help shows --app-password and --local options', () => {
    const { stdout, exitCode } = run('login --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--app-password');
    expect(stdout).toContain('--local');
  });

  test('requires handle argument', () => {
    const result = run('login');
    expect(result.exitCode).not.toBe(0);
  });

  test('--local without .vit/ directory fails', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'vit-test-'));
    try {
      const result = run('login testhandle --local', tmp);
      expect(result.exitCode).not.toBe(0);
      const output = (result.stdout || '') + ' ' + (result.stderr || '');
      expect(output).toContain('vit init');
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  test('cancelLogin closes resources, prints footer, and exits 130', () => {
    const lines = [];
    const server = { listening: true, close: () => lines.push('server.close') };
    const rl = { close: () => lines.push('rl.close') };
    const cleared = [];
    const exits = [];
    const timer = { id: 'timer' };

    cancelLogin({
      server,
      rl,
      timer,
      clearTimer: (value) => cleared.push(value),
      stderr: (line) => lines.push(line),
      exit: (code) => exits.push(code),
    });

    expect(lines).toContain('server.close');
    expect(lines).toContain('rl.close');
    expect(lines).toContain('\nLogin cancelled.');
    expect(lines).toContain(LOGIN_COMMON_ISSUES_FOOTER);
    expect(cleared).toEqual([timer]);
    expect(exits).toEqual([130]);
  });

  test('cancelLogin skips server.close when the server is not listening', () => {
    let serverClosed = false;
    let rlClosed = false;

    cancelLogin({
      server: { listening: false, close: () => { serverClosed = true; } },
      rl: { close: () => { rlClosed = true; } },
      timer: null,
      stderr: () => {},
      exit: () => {},
    });

    expect(serverClosed).toBe(false);
    expect(rlClosed).toBe(true);
  });

  test('printLoginFailure renders cause chains', () => {
    const root = new Error('Failed to resolve identity: bogus-handle.invalid');
    const middle = new Error('Handle bogus-handle.invalid does not resolve to a DID');
    const leaf = new Error('fetch failed');
    root.cause = middle;
    middle.cause = leaf;

    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      printLoginFailure(root, { verbose: false, includeFooter: true });
      const output = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toContain('Failed to resolve identity: bogus-handle.invalid');
      expect(output).toContain('caused by: Handle bogus-handle.invalid does not resolve to a DID');
      expect(output).toContain('caused by: fetch failed');
      expect(output).toContain(LOGIN_COMMON_ISSUES_FOOTER);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('printLoginFailure includes the footer for timeout errors', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      printLoginFailure(new Error('Timed out waiting for callback.'), {
        verbose: false,
        includeFooter: true,
      });
      const output = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toContain('Timed out waiting for callback.');
      expect(output).toContain('Common issues:');
      expect(output).toContain("vit login <handle> --remote");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
