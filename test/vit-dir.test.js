// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// vit-dir functions use process.cwd(), so we save/restore it
const originalCwd = process.cwd();

describe('vit-dir', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(tmpdir(), '.test-vit-dir-' + Math.random().toString(36).slice(2));
    mkdirSync(tmpDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeProjectConfig creates .vit/ and config.json', async () => {
    const { writeProjectConfig } = await import('../src/lib/vit-dir.js');
    writeProjectConfig({ beacon: 'vit:github.com/org/repo' });
    expect(existsSync(join(tmpDir, '.vit'))).toBe(true);
    const content = readFileSync(join(tmpDir, '.vit', 'config.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.beacon).toBe('vit:github.com/org/repo');
  });

  test('readProjectConfig reads written config', async () => {
    const { writeProjectConfig, readProjectConfig } = await import('../src/lib/vit-dir.js');
    writeProjectConfig({ beacon: 'vit:github.com/org/repo' });
    const config = readProjectConfig();
    expect(config.beacon).toBe('vit:github.com/org/repo');
  });

  test('readProjectConfig returns {} when file missing', async () => {
    const { readProjectConfig } = await import('../src/lib/vit-dir.js');
    const config = readProjectConfig();
    expect(config).toEqual({});
  });

  test('appendLog creates file and appends JSONL line', async () => {
    const { appendLog } = await import('../src/lib/vit-dir.js');
    appendLog('caps.jsonl', { ts: '2026-01-01T00:00:00Z', did: 'did:plc:test' });
    const content = readFileSync(join(tmpDir, '.vit', 'caps.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).did).toBe('did:plc:test');
  });

  test('appendLog appends to existing file', async () => {
    const { appendLog } = await import('../src/lib/vit-dir.js');
    appendLog('caps.jsonl', { ts: '2026-01-01T00:00:00Z', n: 1 });
    appendLog('caps.jsonl', { ts: '2026-01-02T00:00:00Z', n: 2 });
    const content = readFileSync(join(tmpDir, '.vit', 'caps.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).n).toBe(1);
    expect(JSON.parse(lines[1]).n).toBe(2);
  });
});
