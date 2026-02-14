// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect } from 'bun:test';
import { run } from './helpers.js';

const FAKE_URI = 'at://did:plc:fake123/org.v-it.cap/fake456';

describe('vit vet', () => {
  test('shows help with <cap-ref> argument', () => {
    const result = run('vet --help');
    expect(result.stdout).toContain('<cap-ref>');
  });

  test('rejects when run inside a coding agent', () => {
    const result = run('vet ' + FAKE_URI, undefined, { CLAUDECODE: '1' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('cannot run inside claude code');
    expect(result.stderr).toContain(`vit vet ${FAKE_URI}`);
    expect(result.stderr).toContain('--trust');
  });

  test('rejects when run inside gemini', () => {
    const result = run('vet ' + FAKE_URI, undefined, { CLAUDECODE: '', GEMINI_CLI: '1', CODEX_CI: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('cannot run inside gemini cli');
  });

  test('rejects invalid AT URI', () => {
    const result = run('vet not-a-valid-uri', undefined, { CLAUDECODE: '', GEMINI_CLI: '', CODEX_CI: '' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid cap reference');
  });

  test('fails with no arguments', () => {
    const result = run('vet');
    expect(result.exitCode).not.toBe(0);
  });
});
